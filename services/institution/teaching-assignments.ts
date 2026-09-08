'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { teachingAssignmentSchema } from '@/lib/validation/academics'

/**
 * Which classes a teacher teaches.
 *
 * This is not bookkeeping. `private.teaches_class()` reads
 * `teacher_class_assignments`, and every RLS policy that lets a teacher publish
 * material, set an assignment or author a quiz consults it. A teacher with no
 * assignment here can sign in, see their workspace, and create nothing — the
 * database refuses the insert, correctly, because they teach nowhere.
 *
 * So this is the switch that turns a provisioned teacher into a working one,
 * and it belongs to the institution administrator rather than to the teacher.
 * A teacher who could assign themselves a class could publish into any class in
 * the institution.
 */

export type TeachingAssignment = {
  id: string
  teacher_id: string
  class_id: string
  section_id: string | null
  academic_year_id: string
  is_class_teacher: boolean
  status: string
  classes: { name: string } | null
  sections: { name: string } | null
  academic_years: { name: string } | null
}

export async function listTeachingAssignments(teacherId: string): Promise<TeachingAssignment[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teacher_class_assignments')
    .select(
      `id, teacher_id, class_id, section_id, academic_year_id, is_class_teacher, status,
       classes ( name ), sections ( name ), academic_years ( name )`,
    )
    .eq('institution_id', session.institutionId)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as TeachingAssignment[]
}

export async function assignTeacherToClass(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'teacher.update' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'a teaching assignment belongs to an institution')
    }

    const parsed = teachingAssignmentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'teaching assignment rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    // The teacher must be one of this institution's, read from the database
    // rather than taken on trust from the request.
    const { data: teacher } = await supabase
      .from('teachers')
      .select('profile_id')
      .eq('profile_id', values.teacher_id)
      .eq('institution_id', session.institutionId)
      .maybeSingle()

    if (!teacher) throw notFound('teacher not found')

    const { data, error } = await supabase
      .from('teacher_class_assignments')
      .insert({
        institution_id: session.institutionId,
        teacher_id: values.teacher_id,
        class_id: values.class_id,
        section_id: values.section_id ?? null,
        academic_year_id: values.academic_year_id,
        is_class_teacher: values.is_class_teacher,
        status: 'ACTIVE',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'that class is already assigned to this teacher', {
          publicMessage: 'This teacher is already assigned to that class and section.',
        })
      }
      throw error
    }

    revalidatePath(`/institution/teachers/${values.teacher_id}`)
    return { id: data.id }
  })
}

export async function removeTeachingAssignment(input: {
  assignment_id: string
}): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    const session = await authorize({ permission: 'teacher.update' })
    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('teacher_class_assignments')
      .select('id, teacher_id, institution_id')
      .eq('id', input.assignment_id)
      .maybeSingle()

    if (!existing) throw notFound('assignment not found')
    if (existing.institution_id !== session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'assignment belongs to another institution')
    }

    /*
     * Removing an assignment revokes the teacher's ability to publish to that
     * class from the next request onward, because the RLS predicate re-reads
     * this table every time. Content they already published stays: it belongs
     * to the class, and deleting a term's material because a teacher changed
     * rooms would be its own kind of wrong.
     */
    const { error } = await supabase
      .from('teacher_class_assignments')
      .delete()
      .eq('id', input.assignment_id)

    if (error) throw error

    revalidatePath(`/institution/teachers/${existing.teacher_id}`)
    return { removed: true as const }
  })
}
