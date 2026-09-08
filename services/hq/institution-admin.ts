import 'server-only'

import { AppError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  provisionMember,
  rollbackProvisioning,
  sendActivationLink,
} from '@/services/provisioning/members'

/**
 * Bringing an institution's first administrator into existence.
 *
 * Approving an application creates a tenant, but a tenant nobody can sign into
 * is not a tenant. This closes that gap: it creates the account for the
 * authorised representative named on the application, gives them an
 * INSTITUTION_ADMIN profile in the new tenant, and emails them a single-use
 * link to choose a password.
 *
 * The account mechanics live in `services/provisioning/members`, shared with
 * teacher and student onboarding. What is specific here is the
 * `institution_admins` extension row and where the recipient comes from.
 *
 * Not a Server Action, and deliberately carrying no `'use server'` directive:
 * it runs with the service role and assigns a role. Its callers authorise
 * first.
 */

export type Invitation = {
  userId: string
  email: string
  /** False when the account existed already and was re-invited rather than created. */
  created: boolean
  /** False when the account is provisioned but the link could not be delivered. */
  emailed: boolean
}

export async function inviteInstitutionAdmin(input: {
  institutionId: string
  institutionName: string
  email: string
  fullName: string
  designation?: string | null
  roleLabel?: string
}): Promise<Invitation> {
  const admin = createAdminClient()

  const member = await provisionMember({
    institutionId: input.institutionId,
    role: 'INSTITUTION_ADMIN',
    email: input.email,
    fullName: input.fullName,
  })

  /*
   * The role extension row. `profiles` says what someone is; this table is what
   * the institution's own screens read, and its composite foreign key
   * `(profile_id, role_guard, institution_id)` means the row cannot exist
   * unless that profile really is an INSTITUTION_ADMIN of this institution —
   * the pairing is guaranteed by schema, not by this code being careful.
   *
   * `is_primary` is claimed only when the institution has no primary yet: a
   * partial unique index permits exactly one, and a reissued invitation must
   * not collide with it.
   */
  const { data: existingPrimary } = await admin
    .from('institution_admins')
    .select('profile_id')
    .eq('institution_id', input.institutionId)
    .eq('is_primary', true)
    .maybeSingle()

  const { error: adminRowError } = await admin.from('institution_admins').upsert(
    {
      profile_id: member.userId,
      institution_id: input.institutionId,
      designation: input.designation ?? null,
      is_primary: !existingPrimary || existingPrimary.profile_id === member.userId,
      status: 'INVITED',
    },
    { onConflict: 'profile_id' },
  )

  if (adminRowError) {
    await rollbackProvisioning(member)
    throw adminRowError
  }

  const emailed = await sendActivationLink({
    member,
    fullName: input.fullName,
    roleLabel: input.roleLabel ?? 'institution administrator',
    institutionName: input.institutionName,
    institutionId: input.institutionId,
  })

  return { userId: member.userId, email: member.email, created: member.created, emailed }
}

/**
 * Resolves who an institution's administrator should be, then invites them.
 *
 * The recipient is derived from the institution's originating application, not
 * supplied by the caller. That is the security property worth keeping: a caller
 * who could name the address could attach an account they control to any
 * tenant. Taking it from the record means the invitation can only ever reach
 * the representative who actually applied.
 *
 * Shared by the HQ action and the operational script so the two cannot drift.
 */
export async function inviteAdminForInstitution(institutionId: string): Promise<Invitation> {
  const admin = createAdminClient()

  const { data: institution, error } = await admin
    .from('institutions')
    .select('id, name, official_email, source_application_id')
    .eq('id', institutionId)
    .maybeSingle()

  if (error) throw error
  if (!institution) {
    throw new AppError('NOT_FOUND', `no institution ${institutionId}`)
  }

  let email = institution.official_email
  let fullName = 'Institution administrator'
  let designation: string | null = null

  if (institution.source_application_id) {
    const { data: application } = await admin
      .from('institution_applications')
      .select('representative_name, representative_email, representative_designation, applicant_email')
      .eq('id', institution.source_application_id)
      .maybeSingle()

    if (application) {
      email = application.representative_email ?? application.applicant_email ?? email
      fullName = application.representative_name ?? fullName
      designation = application.representative_designation
    }
  }

  return inviteInstitutionAdmin({
    institutionId: institution.id,
    institutionName: institution.name,
    email,
    fullName,
    designation,
    roleLabel: designation
      ? `institution administrator (${designation})`
      : 'institution administrator',
  })
}
