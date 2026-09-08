'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { USER_STATUSES, narrow } from '@/lib/constants/enums'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  createStudentSchema,
  setMemberStatusSchema,
  updateStudentSchema,
} from '@/lib/validation/members'
import {
  provisionMember,
  rollbackProvisioning,
  sendActivationLink,
} from '@/services/provisioning/members'

/**
 * Enrolled students, from the institution's side.
 *
 * Same rules as `services/teachers`: the tenant comes from the acting
 * administrator's session and never from the request, the extension row is
 * written under the caller's own RLS context, and the service role is confined
 * to creating the auth user and its profile.
 *
 * One thing is specific to students. A student's placement — department,
 * programme, academic year, class, section — is a web of composite foreign keys
 * that each carry `institution_id`. That means a class belonging to another
 * institution cannot be attached to this student even by a caller holding the
 * service role: the reference has nowhere to land. The form still filters the
 * options by tenant, but the guarantee is in the schema.
 */

export type StudentRow = {
  profile_id: string
  student_code: string
  admission_number: string | null
  status: string
  department_id: string | null
  program_id: string | null
  academic_year_id: string | null
  class_id: string | null
  section_id: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  admission_date: string | null
  created_at: string
  profiles: { full_name: string; email: string; phone: string | null; status: string } | null
  departments: { name: string } | null
  programs: { name: string } | null
  classes: { name: string } | null
  sections: { name: string } | null
}

export type StudentListResult = {
  rows: StudentRow[]
  total: number
}

const PAGE_SIZE = 25

/** The institution's current academic year, when one is marked. */
async function currentAcademicYear(institutionId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('academic_years')
    .select('id')
    .eq('institution_id', institutionId)
    .eq('is_current', true)
    .is('deleted_at', null)
    .maybeSingle()

  return data?.id ?? null
}

export async function listStudents(options: {
  search?: string
  status?: string
  classId?: string
  programId?: string
  page?: number
}): Promise<StudentListResult> {
  const session = await requireTenant()
  const supabase = await createClient()
  const page = Math.max(1, options.page ?? 1)
  const from = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('students')
    .select(
      `profile_id, student_code, admission_number, status, department_id, program_id,
       academic_year_id, class_id, section_id, admission_date, created_at,
       profiles!students_profile_id_fkey ( full_name, email, phone, status ),
       departments ( name ), programs ( name ), classes ( name ), sections ( name )`,
      { count: 'exact' },
    )
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  const status = narrow(USER_STATUSES, options.status)
  if (status) query = query.eq('status', status)
  if (options.classId) query = query.eq('class_id', options.classId)
  if (options.programId) query = query.eq('program_id', options.programId)

  // Same two-step as teachers: PostgREST cannot OR across an embedded resource
  // and its parent in a single filter.
  const term = options.search?.trim()
  if (term) {
    const { data: matches } = await supabase
      .from('profiles')
      .select('id')
      .eq('institution_id', session.institutionId)
      .eq('role', 'STUDENT')
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(200)

    const ids = (matches ?? []).map((row) => row.id)
    query = ids.length
      ? query.or(
          `student_code.ilike.%${term}%,admission_number.ilike.%${term}%,profile_id.in.(${ids.join(',')})`,
        )
      : query.or(`student_code.ilike.%${term}%,admission_number.ilike.%${term}%`)
  }

  const { data, error, count } = await query
  if (error) throw error

  return { rows: (data ?? []) as unknown as StudentRow[], total: count ?? 0 }
}

export async function getStudent(profileId: string): Promise<StudentRow | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('students')
    .select(
      `profile_id, student_code, admission_number, status, department_id, program_id,
       academic_year_id, class_id, section_id, guardian_name, guardian_phone, guardian_email,
       admission_date, created_at,
       profiles!students_profile_id_fkey ( full_name, email, phone, status, last_login_at ),
       departments ( name ), programs ( name ), classes ( name ), sections ( name )`,
    )
    .eq('profile_id', profileId)
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as unknown as StudentRow | null
}

export type EnrolledStudent = {
  profileId: string
  studentCode: string
  email: string
  emailed: boolean
}

export async function createStudent(input: unknown): Promise<ActionResult<EnrolledStudent>> {
  return action(async () => {
    const session = await authorize({ permission: 'student.create' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'a student must belong to an institution')
    }

    const parsed = createStudentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'student rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    // Checked before an account exists, so a duplicate roll number cannot leave
    // an orphaned auth user behind.
    const { data: clash } = await supabase
      .from('students')
      .select('profile_id')
      .eq('institution_id', session.institutionId)
      .eq('student_code', values.student_code)
      .maybeSingle()

    if (clash) {
      throw new AppError('CONFLICT', `student code ${values.student_code} is already in use`, {
        fieldErrors: { student_code: ['That roll number is already used at this institution'] },
      })
    }

    const member = await provisionMember({
      institutionId: session.institutionId,
      role: 'STUDENT',
      email: values.email,
      fullName: values.full_name,
    })

    try {
      if (values.phone) {
        await supabase.from('profiles').update({ phone: values.phone }).eq('id', member.userId)
      }

      const { error } = await supabase.from('students').insert({
        profile_id: member.userId,
        institution_id: session.institutionId,
        student_code: values.student_code,
        admission_number: values.admission_number ?? null,
        department_id: values.department_id ?? null,
        program_id: values.program_id ?? null,
        academic_year_id: values.academic_year_id ?? null,
        class_id: values.class_id ?? null,
        section_id: values.section_id ?? null,
        guardian_name: values.guardian_name ?? null,
        guardian_phone: values.guardian_phone ?? null,
        guardian_email: values.guardian_email ?? null,
        admission_date: values.admission_date ?? null,
        status: 'INVITED',
      })

      if (error) throw error

      /*
       * The enrolment row, not just the column.
       *
       * `students.class_id` records where a student sits. `student_enrollments`
       * is what `private.receives_content()` reads, and that is the predicate
       * every piece of teaching content is delivered through — so a student
       * with a class but no enrolment row would be enrolled on screen and
       * receive nothing at all.
       *
       * The academic year falls back to the institution's current one, because
       * the column is NOT NULL and an administrator who picked a class but no
       * year plainly means "this year".
       */
      if (values.class_id) {
        const yearId = values.academic_year_id ?? (await currentAcademicYear(session.institutionId))

        if (yearId) {
          const { error: enrolError } = await supabase.from('student_enrollments').insert({
            institution_id: session.institutionId,
            student_id: member.userId,
            class_id: values.class_id,
            section_id: values.section_id ?? null,
            academic_year_id: yearId,
            program_id: values.program_id ?? null,
            status: 'ACTIVE',
          })
          if (enrolError) throw enrolError
        }
      }
    } catch (error) {
      await rollbackProvisioning(member)
      throw error
    }

    const emailed = await sendActivationLink({
      member,
      fullName: values.full_name,
      roleLabel: 'student',
      institutionName: session.institutionName ?? 'your institution',
      institutionId: session.institutionId,
    })

    await supabase.rpc('write_audit_log', {
      action: 'STUDENT_ENROLLED',
      entity_type: 'student',
      entity_id: member.userId,
      metadata: { student_code: values.student_code, emailed } as never,
    })

    revalidatePath('/institution/students')
    revalidatePath('/institution')

    return {
      profileId: member.userId,
      studentCode: values.student_code,
      email: member.email,
      emailed,
    }
  })
}

export async function updateStudent(input: unknown): Promise<ActionResult<{ profileId: string }>> {
  return action(async () => {
    await authorize({ permission: 'student.update' })

    const parsed = updateStudentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'student update rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { profile_id, full_name, phone, ...studentFields } = parsed.data
    const supabase = await createClient()

    const { data: existing, error: readError } = await supabase
      .from('students')
      .select('profile_id, institution_id')
      .eq('profile_id', profile_id)
      .maybeSingle()

    if (readError) throw readError
    if (!existing) throw notFound('student not found')

    // The tenant compared against is the record's own, read from the database.
    await authorize({ permission: 'student.update', institutionId: existing.institution_id })

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

    // Enumerated rather than spread, so only these columns are ever writable
    // from a request.
    const patch: Record<string, string | null> = {}
    const assignable = [
      'student_code',
      'admission_number',
      'department_id',
      'program_id',
      'academic_year_id',
      'class_id',
      'section_id',
      'guardian_name',
      'guardian_phone',
      'guardian_email',
      'admission_date',
    ] as const

    for (const key of assignable) {
      const value = studentFields[key]
      if (value !== undefined) patch[key] = (value as string | null) ?? null
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase
        .from('students')
        .update(patch as never)
        .eq('profile_id', profile_id)
      if (error) throw error
    }

    await supabase.rpc('write_audit_log', {
      action: 'STUDENT_UPDATED',
      entity_type: 'student',
      entity_id: profile_id,
      metadata: {} as never,
    })

    revalidatePath('/institution/students')
    revalidatePath(`/institution/students/${profile_id}`)
    return { profileId: profile_id }
  })
}

/**
 * Suspends or reactivates a student.
 *
 * Both rows are set for the same reason as teachers: `private.is_active()`
 * reads the profile and is what every RLS predicate consults, while
 * `students.status` is what the institution's screens display. Letting them
 * disagree would show an administrator an active student who cannot sign in.
 */
export async function setStudentStatus(
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
        fieldErrors: { reason: ['State why this student is being suspended'] },
      })
    }

    const supabase = await createClient()
    const { data: existing, error: readError } = await supabase
      .from('students')
      .select('profile_id, institution_id')
      .eq('profile_id', profile_id)
      .maybeSingle()

    if (readError) throw readError
    if (!existing) throw notFound('student not found')

    await authorize({ permission: 'student.suspend', institutionId: existing.institution_id })

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', profile_id)
    if (profileError) throw profileError

    const { error } = await supabase
      .from('students')
      .update({ status })
      .eq('profile_id', profile_id)
    if (error) throw error

    await supabase.rpc('write_audit_log', {
      action: status === 'SUSPENDED' ? 'STUDENT_SUSPENDED' : 'STUDENT_REACTIVATED',
      entity_type: 'student',
      entity_id: profile_id,
      metadata: { reason: reason ?? null } as never,
    })

    revalidatePath('/institution/students')
    revalidatePath(`/institution/students/${profile_id}`)
    return { profileId: profile_id, status }
  })
}
