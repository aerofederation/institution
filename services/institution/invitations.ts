'use server'

import { revalidatePath } from 'next/cache'

import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { provisionMember, sendActivationLink } from '@/services/provisioning/members'

/**
 * Reissuing a member's activation link.
 *
 * An invitation is single-use and expires after 72 hours, so a teacher or
 * student who never opened theirs has an account they cannot reach and no way
 * back. This is also the repair path for an invitation whose delivery failed at
 * the SMTP layer.
 *
 * The address is never taken from the request. It is read from the member's own
 * profile, so this cannot be used to redirect somebody's activation link to an
 * address of the caller's choosing — which would otherwise be a neat way to
 * take over a colleague's account.
 *
 * `provisionMember` is idempotent for an existing account: the address is
 * already registered, so it issues a `recovery` token and `provision_profile`
 * confirms the existing profile rather than creating a second one. It refuses
 * outright if the profile belongs to a different tenant or holds a different
 * role.
 */

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'teacher',
  STUDENT: 'student',
  INSTITUTION_ADMIN: 'institution administrator',
}

export async function resendMemberInvitation(input: {
  profile_id: string
}): Promise<ActionResult<{ email: string; emailed: boolean }>> {
  return action(async () => {
    const supabase = await createClient()

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status, institution_id')
      .eq('id', input.profile_id)
      .maybeSingle()

    if (error) throw error
    if (!profile) throw notFound('member not found')

    if (profile.role !== 'TEACHER' && profile.role !== 'STUDENT') {
      throw new AppError('FORBIDDEN', `cannot reissue an invitation for ${profile.role}`, {
        publicMessage: 'Only teacher and student invitations can be reissued from here.',
      })
    }

    /*
     * The permission required matches the member's role, and the tenant checked
     * is the one on their profile — read from the database, not the request. A
     * caller from another institution fails here, and RLS would refuse the read
     * above in any case.
     */
    await authorize({
      permission: profile.role === 'TEACHER' ? 'teacher.update' : 'student.update',
      institutionId: profile.institution_id,
    })

    if (profile.status === 'SUSPENDED' || profile.status === 'DEACTIVATED') {
      throw new AppError('CONFLICT', `cannot invite a ${profile.status} account`, {
        publicMessage:
          'This account is suspended. Reactivate it first, then reissue the invitation.',
      })
    }

    if (!profile.institution_id) {
      throw new AppError('TENANT_MISMATCH', 'member has no institution')
    }

    const { data: institution } = await supabase
      .from('institutions')
      .select('name')
      .eq('id', profile.institution_id)
      .maybeSingle()

    const member = await provisionMember({
      institutionId: profile.institution_id,
      role: profile.role,
      email: profile.email,
      fullName: profile.full_name,
    })

    const emailed = await sendActivationLink({
      member,
      fullName: profile.full_name,
      roleLabel: ROLE_LABEL[profile.role] ?? 'member',
      institutionName: institution?.name ?? 'your institution',
      institutionId: profile.institution_id,
    })

    await supabase.rpc('write_audit_log', {
      action: 'MEMBER_INVITATION_REISSUED',
      entity_type: 'profile',
      entity_id: profile.id,
      metadata: { role: profile.role, emailed } as never,
    })

    revalidatePath('/institution/teachers')
    revalidatePath('/institution/students')

    return { email: member.email, emailed }
  })
}
