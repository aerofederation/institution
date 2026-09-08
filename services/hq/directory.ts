import 'server-only'

import {
  APPLICATION_STATUSES,
  DOCUMENT_TYPES,
  INSTITUTION_STATUSES,
  INSTITUTION_TYPES,
  USER_STATUSES,
  VERIFICATION_STATUSES,
  narrow,
} from '@/lib/constants/enums'
import { requireHq } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'

/**
 * Paginated federation-wide listings: institutions, teachers, students,
 * applications, documents and audit events.
 *
 * Two rules hold across every function here.
 *
 * 1. **The database paginates.** `.range()` plus `count: 'exact'` means one page
 *    of rows crosses the wire regardless of how large the table gets. Nothing
 *    fetches a table and slices it in JavaScript.
 *
 * 2. **Search is a database predicate.** Filtering happens in PostgreSQL, so a
 *    row the caller may not see is never loaded in order to be filtered out.
 */

export const PAGE_SIZE = 20

export type Page<T> = {
  rows: T[]
  total: number
  page: number
  pageSize: number
}

export type ListParams = {
  page?: number
  q?: string
  status?: string
  type?: string
  institutionId?: string
}

function range(page: number, pageSize = PAGE_SIZE) {
  const current = Math.max(1, page || 1)
  const from = (current - 1) * pageSize
  return { from, to: from + pageSize - 1, current }
}

/**
 * Escapes a user search term for PostgREST's `or()` filter grammar.
 *
 * Commas separate conditions and parentheses delimit them, so an unescaped
 * term containing either would change the meaning of the filter rather than be
 * searched for. `%` and `_` are LIKE wildcards and are neutralised too.
 */
function safeTerm(input: string) {
  return input.replace(/[,()%_\\*]/g, ' ').trim().slice(0, 80)
}

// ── Institutions ────────────────────────────────────────────────────────────

export type InstitutionRow = {
  id: string
  slug: string
  name: string
  institution_type: string
  category: string
  city: string | null
  state: string | null
  country: string
  status: string
  created_at: string
  approved_at: string | null
}

export async function listInstitutions(params: ListParams): Promise<Page<InstitutionRow>> {
  await requireHq('institution.read_all')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('institutions')
    .select(
      'id, slug, name, institution_type, category, city, state, country, status, created_at, approved_at',
      { count: 'exact' },
    )
    .is('deleted_at', null)

  if (params.q) {
    const term = safeTerm(params.q)
    if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,city.ilike.%${term}%`)
  }
  const status = narrow(INSTITUTION_STATUSES, params.status)
  if (status) query = query.eq('status', status)
  const type = narrow(INSTITUTION_TYPES, params.type)
  if (type) query = query.eq('institution_type', type)

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { rows: data ?? [], total: count ?? 0, page: current, pageSize: PAGE_SIZE }
}

/**
 * Member counts per institution, for the listing.
 *
 * Counted in one grouped pass rather than a query per row — a directory of 500
 * institutions must not become 1,000 round trips. `head: true` counts are used
 * per institution only on the detail page, where there is exactly one.
 */
export async function countMembersByInstitution(institutionIds: string[]) {
  if (institutionIds.length === 0) return new Map<string, { teachers: number; students: number }>()

  await requireHq('institution.read_all')
  const supabase = await createClient()

  const [teachers, students] = await Promise.all([
    supabase
      .from('teachers')
      .select('institution_id')
      .in('institution_id', institutionIds)
      .is('deleted_at', null),
    supabase
      .from('students')
      .select('institution_id')
      .in('institution_id', institutionIds)
      .is('deleted_at', null),
  ])

  if (teachers.error) throw teachers.error
  if (students.error) throw students.error

  const counts = new Map<string, { teachers: number; students: number }>()
  for (const id of institutionIds) counts.set(id, { teachers: 0, students: 0 })

  for (const row of teachers.data ?? []) {
    const entry = counts.get(row.institution_id)
    if (entry) entry.teachers += 1
  }
  for (const row of students.data ?? []) {
    const entry = counts.get(row.institution_id)
    if (entry) entry.students += 1
  }

  return counts
}

export async function getInstitution(id: string) {
  await requireHq('institution.read_all')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institutions')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data
}

/** Everything the institution detail page counts, in one parallel pass. */
export async function getInstitutionSummary(institutionId: string) {
  await requireHq('institution.read_all')
  const supabase = await createClient()

  const countOf = async (
    table: Parameters<typeof supabase.from>[0],
    column = 'institution_id',
  ) => {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(column, institutionId)
    if (error) throw error
    return count ?? 0
  }

  const [teachers, students, departments, programs, classes, courses, subjects, documents] =
    await Promise.all([
      countOf('teachers'),
      countOf('students'),
      countOf('departments'),
      countOf('programs'),
      countOf('classes'),
      countOf('courses'),
      countOf('subjects'),
      countOf('institution_documents'),
    ])

  return { teachers, students, departments, programs, classes, courses, subjects, documents }
}

export async function getInstitutionAdmins(institutionId: string) {
  await requireHq('institution.read_all')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institution_admins')
    .select(
      'profile_id, designation, is_primary, status, created_at, profiles!institution_admins_profile_id_fkey(full_name, email)',
    )
    .eq('institution_id', institutionId)
    .order('is_primary', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ── Applications ────────────────────────────────────────────────────────────

export type ApplicationRow = {
  id: string
  application_ref: string
  institution_name: string
  institution_type: string
  category: string
  status: string
  applicant_email: string
  city: string | null
  state: string | null
  submitted_at: string | null
  created_at: string
  institution_id: string | null
}

export async function listApplications(params: ListParams): Promise<Page<ApplicationRow>> {
  await requireHq('application.read_all')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('institution_applications')
    .select(
      'id, application_ref, institution_name, institution_type, category, status, applicant_email, city, state, submitted_at, created_at, institution_id',
      { count: 'exact' },
    )
    .is('deleted_at', null)

  if (params.q) {
    const term = safeTerm(params.q)
    if (term) {
      query = query.or(
        `institution_name.ilike.%${term}%,application_ref.ilike.%${term}%,applicant_email.ilike.%${term}%`,
      )
    }
  }
  const status = narrow(APPLICATION_STATUSES, params.status)
  if (status) query = query.eq('status', status)
  const type = narrow(INSTITUTION_TYPES, params.type)
  if (type) query = query.eq('institution_type', type)

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { rows: data ?? [], total: count ?? 0, page: current, pageSize: PAGE_SIZE }
}

export async function getApplication(id: string) {
  await requireHq('application.read_all')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institution_applications')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getApplicationHistory(applicationId: string) {
  await requireHq('application.read_all')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institution_application_status_history')
    .select('id, from_status, to_status, actor_kind, comments, required_actions, created_at')
    .eq('application_id', applicationId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// ── Documents ───────────────────────────────────────────────────────────────

export type DocumentRow = {
  id: string
  document_type: string
  file_name: string
  storage_path: string
  mime_type: string
  file_size: number
  verification_status: string
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
  institution_id: string | null
  institution_application_id: string | null
}

export async function listDocuments(
  params: ListParams & { applicationId?: string },
): Promise<Page<DocumentRow>> {
  await requireHq('document.read_all')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('institution_documents')
    .select(
      'id, document_type, file_name, storage_path, mime_type, file_size, verification_status, rejection_reason, reviewed_at, created_at, institution_id, institution_application_id',
      { count: 'exact' },
    )
    .is('deleted_at', null)

  const status = narrow(VERIFICATION_STATUSES, params.status)
  if (status) query = query.eq('verification_status', status)
  const type = narrow(DOCUMENT_TYPES, params.type)
  if (type) query = query.eq('document_type', type)
  if (params.institutionId) query = query.eq('institution_id', params.institutionId)
  if (params.applicationId) query = query.eq('institution_application_id', params.applicationId)
  if (params.q) {
    const term = safeTerm(params.q)
    if (term) query = query.ilike('file_name', `%${term}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return { rows: data ?? [], total: count ?? 0, page: current, pageSize: PAGE_SIZE }
}

// ── People ──────────────────────────────────────────────────────────────────

export type TeacherRow = {
  profile_id: string
  institution_id: string
  employee_id: string
  qualification: string | null
  specialization: string | null
  status: string
  created_at: string
  profiles: { full_name: string; email: string; last_login_at: string | null } | null
  institutions: { name: string; slug: string } | null
  departments: { name: string } | null
}

export async function listTeachers(params: ListParams): Promise<Page<TeacherRow>> {
  await requireHq('teacher.read_all')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('teachers')
    .select(
      `profile_id, institution_id, employee_id, qualification, specialization, status, created_at,
       profiles!teachers_profile_id_fkey ( full_name, email, last_login_at ),
       institutions!teachers_institution_id_fkey ( name, slug ),
       departments ( name )`,
      { count: 'exact' },
    )
    .is('deleted_at', null)

  const status = narrow(USER_STATUSES, params.status)
  if (status) query = query.eq('status', status)
  if (params.institutionId) query = query.eq('institution_id', params.institutionId)
  if (params.q) {
    const term = safeTerm(params.q)
    if (term) query = query.ilike('employee_id', `%${term}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    rows: (data ?? []) as unknown as TeacherRow[],
    total: count ?? 0,
    page: current,
    pageSize: PAGE_SIZE,
  }
}

export type StudentRow = {
  profile_id: string
  institution_id: string
  student_code: string
  admission_number: string | null
  status: string
  created_at: string
  profiles: { full_name: string; email: string; last_login_at: string | null } | null
  institutions: { name: string; slug: string } | null
  programs: { name: string } | null
  classes: { name: string } | null
}

export async function listStudents(params: ListParams): Promise<Page<StudentRow>> {
  await requireHq('student.read_all')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('students')
    .select(
      `profile_id, institution_id, student_code, admission_number, status, created_at,
       profiles!students_profile_id_fkey ( full_name, email, last_login_at ),
       institutions!students_institution_id_fkey ( name, slug ),
       programs ( name ),
       classes ( name )`,
      { count: 'exact' },
    )
    .is('deleted_at', null)

  const status = narrow(USER_STATUSES, params.status)
  if (status) query = query.eq('status', status)
  if (params.institutionId) query = query.eq('institution_id', params.institutionId)
  if (params.q) {
    const term = safeTerm(params.q)
    if (term) {
      query = query.or(`student_code.ilike.%${term}%,admission_number.ilike.%${term}%`)
    }
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    rows: (data ?? []) as unknown as StudentRow[],
    total: count ?? 0,
    page: current,
    pageSize: PAGE_SIZE,
  }
}

// ── Audit ───────────────────────────────────────────────────────────────────

export type AuditRow = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_email: string | null
  actor_role: string | null
  institution_id: string | null
  created_at: string
  metadata: unknown
}

export async function listAuditLogs(
  params: ListParams & { action?: string; from?: string; to?: string },
): Promise<Page<AuditRow>> {
  await requireHq('audit.read')
  const supabase = await createClient()
  const { from, to, current } = range(params.page ?? 1)

  let query = supabase
    .from('audit_logs')
    .select(
      'id, action, entity_type, entity_id, actor_email, actor_role, institution_id, created_at, metadata',
      { count: 'exact' },
    )

  if (params.action) query = query.eq('action', params.action)
  if (params.institutionId) query = query.eq('institution_id', params.institutionId)
  if (params.status) query = query.eq('actor_role', params.status)
  if (params.from) query = query.gte('created_at', params.from)
  if (params.to) query = query.lte('created_at', params.to)
  if (params.q) {
    const term = safeTerm(params.q)
    if (term) query = query.or(`action.ilike.%${term}%,actor_email.ilike.%${term}%`)
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error
  return {
    rows: (data ?? []) as AuditRow[],
    total: count ?? 0,
    page: current,
    pageSize: PAGE_SIZE,
  }
}

/** Distinct action names, for the audit filter. */
export async function listAuditActions(): Promise<string[]> {
  await requireHq('audit.read')
  const supabase = await createClient()

  // Bounded scan: enough to populate a filter without loading the whole log.
  const { data, error } = await supabase
    .from('audit_logs')
    .select('action')
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw error
  return [...new Set((data ?? []).map((row) => row.action))].sort()
}
