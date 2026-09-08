'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { USER_STATUSES, narrow } from '@/lib/constants/enums'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  createTeacherSchema,
  setMemberStatusSchema,
  updateTeacherSchema,
} from '@/lib/validation/members'
import {
  provisionMember,
  rollbackProvisioning,
  sendActivationLink,
} from '@/services/provisioning/members'

/**
 * Teaching staff, from the institution's side.
 *
 * The tenant in every function here comes from `requireTenant()` — the acting
 * administrator's own session — and never from the request. That is not
 * defensive style; it is the reason a well-formed request cannot create a
 * teacher in another institution. The schemas in `lib/validation/members`
 * deliberately have no `institution_id` field, so the idea is not even
 * expressible, and RLS refuses the write independently underneath.
 *
 * Reads and writes to `teachers` go through the caller's own client so RLS
 * applies. The service role appears only where it must: creating the auth user
 * and its profile, which no `authenticated` role may do.
 */

export type TeacherRow = {
  profile_id: string
  employee_id: string
  status: string
  department_id: string | null
  qualification: string | null
  specialization: string | null
  experience_years: number | null
  joining_date: string | null
  // Selected by getTeacher and needed by the edit form; the type had omitted it.
  bio: string | null
  created_at: string
  profiles: { full_name: string; email: string; phone: string | null; status: string } | null
  departments: { name: string; code: string } | null
}

export type TeacherListResult = {
  rows: TeacherRow[]
  total: number
}

const PAGE_SIZE = 25

export async function listTeachers(options: {
  search?: string
  status?: string
  departmentId?: string
  page?: number
}): Promise<TeacherListResult> {
  const session = await requireTenant()
  const supabase = await createClient()
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('teachers')
    .select(
      `profile_id, employee_id, status, department_id, qualification, specialization,
       experience_years, joining_date, created_at,
       profiles!teachers_profile_id_fkey ( full_name, email, phone, status ),
       departments ( name, code )`,
      { count: 'exact' },
    )
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const status = narrow(USER_STATUSES, options.status)
  if (status) query = query.eq('status', status)
  if (options.departmentId) query = query.eq('department_id', options.departmentId)

  /*
   * Search spans the staff number and the name/email on the joined profile.
   * PostgREST cannot OR across an embedded resource and the parent in one
   * filter, so the name/email case is resolved to profile ids first.
   */
  const term = options.search?.trim()
  if (term) {
    const { data: matches } = await supabase
      .from('profiles')
      .select('id')
      .eq('institution_id', session.institutionId)
      .eq('role', 'TEACHER')
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(200)

    const ids = (matches ?? []).map((row) => row.id)
    query = ids.length
      ? query.or(`employee_id.ilike.%${term}%,profile_id.in.(${ids.join(',')})`)
      : query.ilike('employee_id', `%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw error

  return { rows: (data ?? []) as unknown as TeacherRow[], total: count ?? 0 }
}

export async function getTeacher(profileId: string): Promise<TeacherRow | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teachers')
    .select(
      `profile_id, employee_id, status, department_id, qualification, specialization,
       experience_years, joining_date, bio, created_at,
       profiles!teachers_profile_id_fkey ( full_name, email, phone, status, last_login_at ),
       departments ( name, code )`,
    )
    .eq('profile_id', profileId)
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as unknown as TeacherRow | null
}

export type CreatedMember = {
  profileId: string
  employeeId: string
  email: string
  emailed: boolean
}

/**
 * Creates a teacher and invites them.
 *
 * Order matters and is not arbitrary. The staff number is checked first,
 * because discovering it is taken *after* creating an auth user leaves an
 * orphan account. The account is created next, then the `teachers` row under
 * the caller's own RLS context, and only once that has succeeded does the
 * invitation go out — nobody should receive a link to an account that is about
 * to be rolled back.
 */
export async function createTeacher(input: unknown): Promise<ActionResult<CreatedMember>> {
  return action(async () => {
    const session = await authorize({ permission: 'teacher.create' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'a teacher must belong to an institution')
    }

    const parsed = createTeacherSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'teacher rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    const { data: clash } = await supabase
      .from('teachers')
      .select('profile_id')
      .eq('institution_id', session.institutionId)
      .eq('employee_id', values.employee_id)
      .maybeSingle()

    if (clash) {
      throw new AppError('CONFLICT', `employee id ${values.employee_id} is already in use`, {
        fieldErrors: { employee_id: ['That staff number is already used at this institution'] },
      })
    }

    const member = await provisionMember({
      institutionId: session.institutionId,
      role: 'TEACHER',
      email: values.email,
      fullName: values.full_name,
    })

    try {
      if (values.phone) {
        await supabase.from('profiles').update({ phone: values.phone }).eq('id', member.userId)
      }

      /*
       * Written through the caller's client, not the service role. The insert
       * therefore has to satisfy `teachers_insert`, which independently
       * re-checks the tenant and the `teacher.create` permission — so the
       * authorisation above is not the only thing standing between this request
       * and the row.
       */
      const { error } = await supabase.from('teachers').insert({
        profile_id: member.userId,
        institution_id: session.institutionId,
        employee_id: values.employee_id,
        department_id: values.department_id ?? null,
        qualification: values.qualification ?? null,
        specialization: values.specialization ?? null,
        experience_years: values.experience_years ?? null,
        joining_date: values.joining_date ?? null,
        bio: values.bio ?? null,
        status: 'INVITED',
      })

      if (error) throw error
    } catch (error) {
      await rollbackProvisioning(member)
      throw error
    }

    const emailed = await sendActivationLink({
      member,
      fullName: values.full_name,
      roleLabel: 'teacher',
      institutionName: session.institutionName ?? 'your institution',
      institutionId: session.institutionId,
    })

    await supabase.rpc('write_audit_log', {
      action: 'TEACHER_CREATED',
      entity_type: 'teacher',
      entity_id: member.userId,
      metadata: { employee_id: values.employee_id, emailed } as never,
    })

    revalidatePath('/institution/teachers')
    revalidatePath('/institution')

    return {
      profileId: member.userId,
      employeeId: values.employee_id,
      email: member.email,
      emailed,
    }
  })
}

export async function updateTeacher(input: unknown): Promise<ActionResult<{ profileId: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'teacher.update' })

    const parsed = updateTeacherSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'teacher update rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { profile_id, full_name, phone, ...teacherFields } = parsed.data
    const supabase = await createClient()

    // Read the record first so the tenant compared against is the record's own,
    // not one supplied by the request.
    const { data: existing, error: readError } = await supabase
      .from('teachers')
      .select('profile_id, institution_id')
      .eq('profile_id', profile_id)
      .maybeSingle()

    if (readError) throw readError
    if (!existing) throw notFound('teacher not found')

    await authorize({ permission: 'teacher.update', institutionId: existing.institution_id })

    if (full_name || phone !== undefined) {
      const { error } = await supabase
        .from('profiles')
        .update({
          ...(full_name ? { full_name } : {}),
          ...(phone !== undefined ? { phone: phone ?? null } : {}),
        })
        .eq('id', profile_id)
      if (error) throw error
    }

    /*
     * Built field by field rather than spread from the parsed input. A generic
     * object would let any future schema key reach the table, and `institution_id`
     * arriving in an update payload is exactly the thing this layer exists to
     * make impossible.
     */
    const patch: Record<string, string | number | null> = {}
    if (teacherFields.employee_id !== undefined) patch.employee_id = teacherFields.employee_id
    if (teacherFields.department_id !== undefined)
      patch.department_id = teacherFields.department_id ?? null
    if (teacherFields.qualification !== undefined)
      patch.qualification = teacherFields.qualification ?? null
    if (teacherFields.specialization !== undefined)
      patch.specialization = teacherFields.specialization ?? null
    if (teacherFields.experience_years !== undefined)
      patch.experience_years = teacherFields.experience_years ?? null
    if (teacherFields.joining_date !== undefined)
      patch.joining_date = teacherFields.joining_date ?? null
    if (teacherFields.bio !== undefined) patch.bio = teacherFields.bio ?? null

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('teachers')
        .update(patch as never)
        .eq('profile_id', profile_id)
      if (error) throw error
    }

    await supabase.rpc('write_audit_log', {
      action: 'TEACHER_UPDATED',
      entity_type: 'teacher',
      entity_id: profile_id,
      metadata: {} as never,
    })

    revalidatePath('/institution/teachers')
    revalidatePath(`/institution/teachers/${profile_id}`)
    void session
    return { profileId: profile_id }
  })
}

/**
 * Suspends or reactivates a teacher.
 *
 * Both the profile and the extension row are set. `private.is_active()` reads
 * the profile, and that is what every RLS predicate consults — so the profile
 * update is what actually revokes access. The `teachers.status` column is what
 * the institution's own screens display, and letting the two disagree would
 * show an administrator an active teacher who cannot sign in.
 */
export async function setTeacherStatus(
  input: unknown,
): Promise<ActionResult<{ profileId: string; status: string }>> {
  return action(async () => {
    const parsed = setMemberStatusSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'status change rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { profile_id, status, reason } = parsed.data

    if (status === 'SUSPENDED' && !reason?.trim()) {
      throw new AppError('VALIDATION', 'suspension requires a reason', {
        fieldErrors: { reason: ['State why this teacher is being suspended'] },
      })
    }

    const supabase = await createClient()
    const { data: existing, error: readError } = await supabase
      .from('teachers')
      .select('profile_id, institution_id')
      .eq('profile_id', profile_id)
      .maybeSingle()

    if (readError) throw readError
    if (!existing) throw notFound('teacher not found')

    await authorize({ permission: 'teacher.suspend', institutionId: existing.institution_id })

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', profile_id)
    if (profileError) throw profileError

    const { error } = await supabase
      .from('teachers')
      .update({ status })
      .eq('profile_id', profile_id)
    if (error) throw error

    await supabase.rpc('write_audit_log', {
      action: status === 'SUSPENDED' ? 'TEACHER_SUSPENDED' : 'TEACHER_REACTIVATED',
      entity_type: 'teacher',
      entity_id: profile_id,
      metadata: { reason: reason ?? null } as never,
    })

    revalidatePath('/institution/teachers')
    revalidatePath(`/institution/teachers/${profile_id}`)
    return { profileId: profile_id, status }
  })
}
