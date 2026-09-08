'use server'

import { headers } from 'next/headers'

import { publicEnv } from '@/lib/env/public'
import { AppError, action, type ActionResult } from '@/lib/errors'
import { HOME_BY_ROLE, isRoleCode } from '@/lib/permissions/definitions'
import { createClient } from '@/lib/supabase/server'
import { loginSchema, passwordResetRequestSchema, setPasswordSchema } from '@/lib/validation/auth'
import { toFieldErrors } from '@/lib/validation/common'

/**
 * Authentication Server Actions.
 *
 * Three rules run through all of them:
 *
 *   1. Every input is re-validated on the server with the same zod schema the
 *      browser used. Client validation is feedback, not a gate.
 *   2. Responses are uniform where a difference would disclose whether an
 *      account exists. Wrong password and unknown address produce byte-identical
 *      results, and a reset request always reports success.
 *   3. Actions return a destination instead of calling `redirect()`. `redirect`
 *      signals by throwing, and a throw inside the `action()` wrapper would be
 *      caught and reported as a failure for an operation that in fact
 *      succeeded.
 */

export type AuthActionResult = ActionResult<{ redirectTo: string }>

async function requestFingerprint() {
  const headerList = await headers()
  return {
    userAgent: headerList.get('user-agent')?.slice(0, 512) ?? null,
  }
}

/**
 * Records a security event. Never allowed to fail the surrounding action — an
 * audit write that throws would turn a successful sign-in into an error.
 */
async function audit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  auditAction: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await supabase.rpc('write_audit_log', {
      action: auditAction,
      entity_type: 'auth',
      metadata: metadata as never,
    })
  } catch (error) {
    console.warn('[afi:audit] write failed', auditAction, error)
  }
}

export async function login(_previous: unknown, formData: FormData): Promise<AuthActionResult> {
  return action(async () => {
    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      next: formData.get('next') || undefined,
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'login input rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { email, password, next } = parsed.data
    const supabase = await createClient()

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      // One message for every failure mode. Distinguishing "no such account"
      // from "wrong password" turns the login form into an account oracle.
      await audit(supabase, 'LOGIN_FAILED', {
        email_domain: email.split('@')[1] ?? null,
        ...(await requestFingerprint()),
      })
      throw new AppError('UNAUTHENTICATED', `sign-in rejected for ${email}`, {
        publicMessage: 'Incorrect email or password.',
      })
    }

    // Authentication succeeded; authorization to actually use the platform is a
    // separate question, answered from the profiles row.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status, institution_id, institutions!profiles_institution_id_fkey ( status )')
      .eq('id', data.user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile || !isRoleCode(profile.role)) {
      await supabase.auth.signOut()
      throw new AppError('FORBIDDEN', `no usable profile for ${data.user.id}`, {
        publicMessage: 'This account is not set up for the platform. Contact your administrator.',
      })
    }

    if (profile.status !== 'ACTIVE') {
      await supabase.auth.signOut()
      await audit(supabase, 'LOGIN_BLOCKED_INACTIVE_ACCOUNT', { status: profile.status })
      throw new AppError('ACCOUNT_INACTIVE', `account status ${profile.status}`, {
        publicMessage:
          profile.status === 'INVITED'
            ? 'This account has not been activated yet. Use the activation link that was emailed to you.'
            : 'This account is not active. Contact your administrator.',
      })
    }

    const institution = profile.institutions as { status: string } | null
    if (profile.institution_id && institution?.status !== 'ACTIVE') {
      await supabase.auth.signOut()
      await audit(supabase, 'LOGIN_BLOCKED_INACTIVE_INSTITUTION', {
        institution_status: institution?.status ?? 'UNKNOWN',
      })
      throw new AppError('ACCOUNT_INACTIVE', `institution status ${institution?.status}`, {
        publicMessage: 'Your institution is not currently active on the platform.',
      })
    }

    await supabase.rpc('touch_last_login')
    await audit(supabase, 'LOGIN_SUCCEEDED', { role: profile.role })

    // `next` is regex-constrained to a same-site path by loginSchema, so it
    // cannot redirect off the platform.
    return { redirectTo: next ?? HOME_BY_ROLE[profile.role] }
  })
}

export async function signOut(): Promise<AuthActionResult> {
  return action(async () => {
    const supabase = await createClient()
    await audit(supabase, 'LOGOUT')
    await supabase.auth.signOut()
    return { redirectTo: '/login' }
  })
}

/**
 * Password reset request.
 *
 * Always reports success. Reporting "no account with that address" would make
 * this a membership oracle for every institution on the platform.
 */
export async function requestPasswordReset(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ sent: true }>> {
  return action(async () => {
    const parsed = passwordResetRequestSchema.safeParse({ email: formData.get('email') })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'reset request rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/auth/callback?next=/reset-password`,
    })

    if (error) {
      // Logged for operators; the caller still sees success.
      console.warn('[afi:auth] reset request failed', error.message)
    }

    return { sent: true as const }
  })
}

/**
 * Sets a password for a session established by a recovery or invitation link.
 *
 * The user is already authenticated at this point — the link exchange in
 * `/auth/callback` created the session — so there is no email field here. A
 * form-supplied address would let a recipient set the password on an account
 * the link was not issued for.
 */
export async function setPassword(
  _previous: unknown,
  formData: FormData,
): Promise<AuthActionResult> {
  return action(async () => {
    const parsed = setPasswordSchema.safeParse({
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'password rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw new AppError('UNAUTHENTICATED', 'no recovery session', {
        publicMessage: 'This link has expired. Request a new one and try again.',
      })
    }

    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    if (error) {
      throw new AppError('VALIDATION', error.message, {
        publicMessage: 'That password could not be set. Choose a different one.',
      })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.status === 'INVITED') {
      // An invited user becomes active the moment they hold a password. The
      // status column is immutable to the account holder, so this goes through
      // activate_own_account(), which only ever moves INVITED -> ACTIVE and
      // writes its own audit entry.
      const { error: activationError } = await supabase.rpc('activate_own_account')
      if (activationError) {
        throw new AppError('INTERNAL', activationError.message, {
          publicMessage: 'Your password was set, but the account could not be activated. Contact your administrator.',
        })
      }
    } else {
      await audit(supabase, 'PASSWORD_CHANGED')
    }

    const role = isRoleCode(profile?.role) ? profile.role : null
    return { redirectTo: role ? HOME_BY_ROLE[role] : '/login' }
  })
}
