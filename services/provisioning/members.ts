import 'server-only'

import { verificationUrl } from '@/lib/email/links'
import { sendEmail } from '@/lib/email/send'
import { accountActivation } from '@/lib/email/templates'
import { AppError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Bringing a platform account into existence.
 *
 * Every provisioned user on the platform — an institution's first
 * administrator, a teacher, a student — is created the same way, and it is
 * worth stating what that way is:
 *
 *   * No password is ever generated, transmitted or stored. The account is
 *     created without one and lives in INVITED until the recipient sets it
 *     themselves through `activate_own_account()`, which is the only transition
 *     out of that state.
 *   * The profile is written by `provision_profile()`, which is granted to
 *     `service_role` alone, refuses HQ_ADMIN outright, and refuses to move an
 *     existing profile between tenants or roles.
 *   * The tenant is passed in by the caller from its *own* authorised session,
 *     never from client input. A caller that let the browser choose
 *     `institutionId` would be handing out accounts in other institutions.
 *
 * Provisioning and the invitation email are deliberately separate calls.
 * Creating an account is one transaction and telling somebody about it is
 * another; a caller that has to attach a role-extension row in between must be
 * able to fail and undo without an email having already gone out promising
 * access to an account that no longer exists.
 *
 * None of this is a Server Action, and there is no `'use server'` directive on
 * purpose. It runs with the service role and assigns roles — exposing it as a
 * callable endpoint would hand every visitor an account-provisioning primitive.
 * Callers authorise first.
 */

const ACTIVATION_TTL_HOURS = 72

/** HQ_ADMIN is absent by design: `provision_profile()` refuses that role. */
export type ProvisionableRole = 'INSTITUTION_ADMIN' | 'TEACHER' | 'STUDENT'

export type ProvisionedMember = {
  userId: string
  email: string
  /** False when the address was already registered and was re-invited. */
  created: boolean
  /** Redeemable token for the activation link. Never logged, never persisted. */
  tokenHash: string
  linkType: 'invite' | 'recovery'
}

export async function provisionMember(input: {
  institutionId: string
  role: ProvisionableRole
  email: string
  fullName: string
}): Promise<ProvisionedMember> {
  const admin = createAdminClient()
  const email = input.email.trim().toLowerCase()

  if (!email) {
    throw new AppError('VALIDATION', 'an account needs an email address', {
      publicMessage: 'An email address is required — it is how this person receives their access.',
    })
  }

  /*
   * `invite` both creates the user and mints the token, so the two cannot drift
   * apart. It fails when the address is already registered — a retried
   * operation, or somebody who already holds an account elsewhere on the
   * platform — and a `recovery` token is issued instead so the link still works.
   *
   * `redirectTo` is intentionally not passed. The returned `action_link` is
   * discarded in favour of a URL built from `hashed_token`, so binding this to
   * the project's redirect allow-list would add a failure mode for no benefit.
   */
  let linkType: 'invite' | 'recovery' = 'invite'
  let generated = await admin.auth.admin.generateLink({ type: 'invite', email })

  if (generated.error) {
    linkType = 'recovery'
    generated = await admin.auth.admin.generateLink({ type: 'recovery', email })
  }

  if (generated.error || !generated.data?.user || !generated.data.properties?.hashed_token) {
    throw new AppError('EMAIL', `could not mint an activation link: ${generated.error?.message}`, {
      publicMessage: 'The account could not be prepared. Check the address and try again.',
    })
  }

  const userId = generated.data.user.id

  const { error: profileError } = await admin.rpc('provision_profile', {
    user_id: userId,
    user_email: email,
    full_name: input.fullName,
    role: input.role,
    institution_id: input.institutionId,
  })

  if (profileError) throw profileError

  /*
   * Mirrored into app_metadata so middleware can route without a database read.
   * A routing hint only — never an authorisation input. Every decision is
   * re-derived from the profiles row, because this value rides in the JWT and
   * must not be trusted as a claim.
   */
  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { afi_role: input.role },
  })

  if (metadataError) {
    console.warn('[afi:provisioning] could not set routing metadata', metadataError.message)
  }

  return {
    userId,
    email,
    created: linkType === 'invite',
    tokenHash: generated.data.properties.hashed_token,
    linkType,
  }
}

/**
 * Undoes a provisioning that could not be completed.
 *
 * Deleting the auth user cascades the profile, so a member whose role-extension
 * row was refused — a duplicate staff number, a department from another tenant
 * — does not leave a half-built account behind that can still receive a link.
 *
 * Only ever call this for an account this operation just created. An address
 * that was already registered belongs to somebody, and removing it would
 * delete a real user because their colleague mistyped a staff number.
 */
export async function rollbackProvisioning(member: ProvisionedMember): Promise<void> {
  if (!member.created) return

  const { error } = await createAdminClient().auth.admin.deleteUser(member.userId)
  if (error) {
    console.error('[afi:provisioning] could not roll back a failed provisioning', {
      userId: member.userId,
      reason: error.message,
    })
  }
}

/**
 * Emails the activation link.
 *
 * Delivery is reported rather than thrown. By the time this runs the account is
 * real and committed, and failing the caller's request would report a failure
 * for work that succeeded. The remedy is to reissue the invitation, which every
 * caller exposes.
 */
export async function sendActivationLink(input: {
  member: ProvisionedMember
  fullName: string
  roleLabel: string
  institutionName: string
  institutionId: string
}): Promise<boolean> {
  const activationUrl = verificationUrl(input.member.tokenHash, input.member.linkType, '/activate')

  const delivery = await sendEmail({
    to: input.member.email,
    document: accountActivation({
      fullName: input.fullName,
      roleLabel: input.roleLabel,
      institutionName: input.institutionName,
      activationUrl,
      expiresInHours: ACTIVATION_TTL_HOURS,
    }),
    context: { institutionId: input.institutionId, purpose: 'account_activation' },
  })

  if (!delivery.ok) {
    // The link itself is never logged: until it is redeemed it is a bearer
    // credential for the account.
    console.error('[afi:provisioning] activation email not delivered', {
      institutionId: input.institutionId,
      reason: delivery.reason,
    })
  }

  return delivery.ok
}
