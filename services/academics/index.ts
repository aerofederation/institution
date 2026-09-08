'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  academicYearSchema,
  classSchema,
  departmentSchema,
  programSchema,
  sectionSchema,
  subjectSchema,
} from '@/lib/validation/academics'

/**
 * The institution's academic structure.
 *
 * Departments, academic years, programmes, classes and sections. These exist
 * before teachers and students are useful — a teacher with no department and a
 * student with no class are records, not a working institution — so this is the
 * first thing an administrator sets up.
 *
 * Every write derives its tenant from `requireTenant()`. Nothing here accepts
 * an `institution_id`, and the composite foreign keys mean a class cannot point
 * at another institution's academic year even if one were somehow supplied: the
 * reference carries the tenant, so it has nowhere to land.
 */

export type Department = {
  id: string
  code: string
  name: string
  description: string | null
  status: string
}

export type AcademicYear = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  is_current: boolean
  status: string
}

export type Program = {
  id: string
  code: string
  name: string
  level: string | null
  duration_months: number | null
  department_id: string | null
  status: string
  departments: { name: string } | null
}

export type ClassRow = {
  id: string
  name: string
  code: string | null
  level_order: number | null
  capacity: number | null
  status: string
  academic_year_id: string
  program_id: string | null
  department_id: string | null
  academic_years: { name: string } | null
  programs: { name: string } | null
}

export type Section = {
  id: string
  name: string
  capacity: number | null
  class_id: string
  status: string
  classes: { name: string } | null
}

export type Subject = {
  id: string
  code: string
  name: string
  credits: number | null
  is_elective: boolean
  department_id: string | null
  status: string
  departments: { name: string } | null
}

// ── Reads ───────────────────────────────────────────────────────────────────

export async function listDepartments(): Promise<Department[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('departments')
    .select('id, code, name, description, status')
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return (data ?? []) as Department[]
}

export async function listAcademicYears(): Promise<AcademicYear[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('academic_years')
    .select('id, name, starts_on, ends_on, is_current, status')
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('starts_on', { ascending: false })

  if (error) throw error
  return (data ?? []) as AcademicYear[]
}

export async function listPrograms(): Promise<Program[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('programs')
    .select('id, code, name, level, duration_months, department_id, status, departments ( name )')
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return (data ?? []) as unknown as Program[]
}

export async function listClasses(): Promise<ClassRow[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('classes')
    .select(
      `id, name, code, level_order, capacity, status, academic_year_id, program_id, department_id,
       academic_years ( name ), programs ( name )`,
    )
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('level_order', { ascending: true, nullsFirst: false })
    .order('name')

  if (error) throw error
  return (data ?? []) as unknown as ClassRow[]
}

export async function listSections(): Promise<Section[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('sections')
    .select('id, name, capacity, class_id, status, classes ( name )')
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return (data ?? []) as unknown as Section[]
}

/** Everything the teacher and student forms need to offer, in one round trip. */
/**
 * The subjects this institution teaches.
 *
 * Read with the caller's own client, so `subjects_select` decides: an
 * administrator, a teacher and a student all hold `academic.read` and all see
 * their own institution's list. That is deliberate — a teacher picking a
 * subject for a paper is choosing from what the institution actually offers.
 */
export async function listSubjects(): Promise<Subject[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('subjects')
    .select('id, code, name, credits, is_elective, department_id, status, departments ( name )')
    .eq('institution_id', session.institutionId)
    .is('deleted_at', null)
    .order('name')

  if (error) throw error
  return (data ?? []) as unknown as Subject[]
}

export async function getAcademicOptions() {
  const [departments, years, programs, classes, sections, subjects] = await Promise.all([
    listDepartments(),
    listAcademicYears(),
    listPrograms(),
    listClasses(),
    listSections(),
    listSubjects(),
  ])

  return { departments, years, programs, classes, sections, subjects }
}

// ── Writes ──────────────────────────────────────────────────────────────────

async function tenantForWrite() {
  const session = await authorize({ permission: 'academic.manage' })
  if (!session.institutionId) {
    throw new AppError('TENANT_MISMATCH', 'academic structure belongs to an institution')
  }
  return session.institutionId
}

export async function createDepartment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = departmentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'department rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('departments')
      .insert({ ...parsed.data, institution_id: institutionId })
      .select('id')
      .single()

    if (error) {
      // 23505 is the (institution_id, code) unique index.
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'department code already exists', {
          fieldErrors: { code: ['That code is already used at this institution'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    return { id: data.id }
  })
}

export async function createAcademicYear(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = academicYearSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'academic year rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    /*
     * A partial unique index permits one current year per institution, so the
     * previous one is stood down first. Doing it the other way round would trip
     * the index and fail the whole operation.
     */
    if (parsed.data.is_current) {
      await supabase
        .from('academic_years')
        .update({ is_current: false })
        .eq('institution_id', institutionId)
        .eq('is_current', true)
    }

    const { data, error } = await supabase
      .from('academic_years')
      .insert({ ...parsed.data, institution_id: institutionId })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'academic year name already exists', {
          fieldErrors: { name: ['That academic year already exists'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    return { id: data.id }
  })
}

export async function createProgram(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = programSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'programme rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('programs')
      .insert({
        ...parsed.data,
        department_id: parsed.data.department_id ?? null,
        institution_id: institutionId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'programme code already exists', {
          fieldErrors: { code: ['That code is already used at this institution'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    return { id: data.id }
  })
}

export async function createClassRecord(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = classSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'class rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('classes')
      .insert({
        ...parsed.data,
        code: parsed.data.code ?? null,
        program_id: parsed.data.program_id ?? null,
        department_id: parsed.data.department_id ?? null,
        level_order: parsed.data.level_order ?? null,
        capacity: parsed.data.capacity ?? null,
        institution_id: institutionId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'class already exists in that academic year', {
          fieldErrors: { name: ['A class with this name already exists in that academic year'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    return { id: data.id }
  })
}

export async function createSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = sectionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'section rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    // The class is verified to belong to this tenant before the section points
    // at it. The composite foreign key enforces the same thing, but failing
    // here produces a message an administrator can act on.
    const { data: parent } = await supabase
      .from('classes')
      .select('id')
      .eq('id', parsed.data.class_id)
      .eq('institution_id', institutionId)
      .maybeSingle()

    if (!parent) throw notFound('class not found')

    const { data, error } = await supabase
      .from('sections')
      .insert({
        ...parsed.data,
        capacity: parsed.data.capacity ?? null,
        institution_id: institutionId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'section already exists in that class', {
          fieldErrors: { name: ['That section already exists in this class'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    return { id: data.id }
  })
}

/**
 * Creates a subject.
 *
 * Until this existed there was no way to create one anywhere in the
 * application. The table, its RLS and every read were in place — the teacher's
 * "Subject" dropdown reads from it — but nothing wrote to it, so the dropdown
 * was empty in every institution whose rows had not been inserted by a seed
 * script. A field offering only "Not set" is not an optional field; it is a
 * broken one.
 */
export async function createSubject(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const institutionId = await tenantForWrite()

    const parsed = subjectSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'subject rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    /*
     * The department is confirmed to be this institution's before the subject
     * points at it. The composite foreign key enforces the same thing; failing
     * here produces a message an administrator can act on rather than a
     * constraint name.
     */
    if (parsed.data.department_id) {
      const { data: department } = await supabase
        .from('departments')
        .select('id')
        .eq('id', parsed.data.department_id)
        .eq('institution_id', institutionId)
        .maybeSingle()

      if (!department) throw notFound('department not found')
    }

    const { data, error } = await supabase
      .from('subjects')
      .insert({
        code: parsed.data.code,
        name: parsed.data.name,
        department_id: parsed.data.department_id ?? null,
        credits: parsed.data.credits ?? null,
        is_elective: parsed.data.is_elective,
        description: parsed.data.description ?? null,
        institution_id: institutionId,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new AppError('CONFLICT', 'subject code already used', {
          fieldErrors: { code: ['That code is already used by another subject'] },
        })
      }
      throw error
    }

    revalidatePath('/institution/academics')
    // Teachers pick from this list when building a paper or publishing material.
    revalidatePath('/teacher/assessments/new')
    revalidatePath('/teacher/materials')
    return { id: data.id }
  })
}
