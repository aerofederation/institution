'use server'

import { headers } from 'next/headers'

import { AppError, action, type ActionResult } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { loginSchema } from '@/lib/validation/auth'
import { toFieldErrors } from '@/lib/validation/common'

/**
 * HQ sign-in.
 *
 * Separate from the general portal sign-in because the authorisation question
 * is different: authenticating successfully is not sufficient here, the account
 * must also hold `HQ_ADMIN`.
 *
 * The role is read from the `profiles` row after authentication — never from
 * the form, a hidden field, or a client-supplied claim. There is no role
 * selector on the page because a role is not something a user chooses.
 *
 * A correct password on a non-HQ account is signed straight back out and told
 * the same thing a wrong password is told. Distinguishing the two would turn
 * this page into an oracle for which addresses hold federation-wide access,
 * which is precisely the set worth attacking.
 */
export type HqLoginResult = ActionResult<{ redirectTo: string }>

export async function hqLogin(_previous: unknown, formData: FormData): Promise<HqLoginResult> {
  return action(async () => {
    const parsed = loginSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
      next: formData.get('next') || undefined,
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'HQ sign-in input rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { email, password, next } = parsed.data
    const supabase = await createClient()
    const headerList = await headers()

    const audit = async (auditAction: string, metadata: Record<string, unknown> = {}) => {
      try {
        await supabase.rpc('write_audit_log', {
          action: auditAction,
          entity_type: 'auth',
          metadata: {
            surface: 'hq',
            user_agent: headerList.get('user-agent')?.slice(0, 512) ?? null,
            ...metadata,
          } as never,
        })
      } catch (error) {
        console.warn('[afi:audit] HQ sign-in audit failed', error)
      }
    }

    // One message for every failure mode below this point.
    const refuse = () =>
      new AppError('UNAUTHENTICATED', `HQ sign-in refused for ${email}`, {
        publicMessage: 'Those credentials are not valid for HQ access.',
      })

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error || !data.user) {
      await audit('HQ_LOGIN_FAILED', { email_domain: email.split('@')[1] ?? null })
      throw refuse()
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, status')
      .eq('id', data.user.id)
      .is('deleted_at', null)
      .maybeSingle()

    if (!profile || profile.role !== 'HQ_ADMIN') {
      // Authenticated, but not entitled to be here. End the session rather than
      // leaving them signed in on a page they cannot use.
      await audit('HQ_LOGIN_DENIED_NOT_HQ', { attempted_role: profile?.role ?? 'none' })
      await supabase.auth.signOut()
      throw refuse()
    }

    if (profile.status !== 'ACTIVE') {
      await audit('HQ_LOGIN_BLOCKED_INACTIVE', { status: profile.status })
      await supabase.auth.signOut()
      throw new AppError('ACCOUNT_INACTIVE', `HQ account status ${profile.status}`, {
        publicMessage:
          profile.status === 'INVITED'
            ? 'This HQ account has not been activated. Use the activation link that was issued to you.'
            : 'This HQ account is not active.',
      })
    }

    await supabase.rpc('touch_last_login')
    await audit('HQ_LOGIN_SUCCEEDED')

    // `next` is regex-constrained to a same-site path by loginSchema, and is
    // additionally required to stay inside /hq.
    const destination = next && next.startsWith('/hq') ? next : '/hq'
    return { redirectTo: destination }
  })
}
