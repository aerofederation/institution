'use server'

import { requireTenant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.generated'

type UserStatus = Database['public']['Enums']['user_status']

/**
 * The institution dashboard's figures.
 *
 * Every number here is a real count against a real table, taken with
 * `head: true` so the row bodies are never transferred. Nothing on this surface
 * is a placeholder — a dashboard that displays invented figures is worse than
 * one that displays none, because it cannot be told apart from a working one.
 *
 * The counts run under the caller's own client, so RLS scopes them to this
 * tenant. The explicit `institution_id` filter is redundant against that, and
 * kept deliberately: if a policy were ever loosened, these numbers would still
 * be this institution's.
 */

export type InstitutionOverview = {
  teachers: { total: number; active: number; invited: number; suspended: number }
  students: { total: number; active: number; invited: number; suspended: number }
  academics: { departments: number; programs: number; classes: number; years: number }
  pendingActivations: number
  currentYear: { name: string; starts_on: string; ends_on: string } | null
}

export async function getInstitutionOverview(): Promise<InstitutionOverview> {
  const session = await requireTenant()
  const supabase = await createClient()
  const tenant = session.institutionId

  /*
   * Split in two because `status` is a different enum on each family of tables:
   * `user_status` on members, `record_status` and `academic_year_status` on the
   * academic ones. One helper taking a loose `string` would typecheck by
   * discarding that distinction, which is exactly the check worth keeping.
   */
  const countMembers = async (table: 'teachers' | 'students', status?: UserStatus) => {
    let query = supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', tenant)
      .is('deleted_at', null)

    if (status) query = query.eq('status', status)

    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }

  const countRecords = async (
    table: 'departments' | 'programs' | 'classes' | 'academic_years',
  ) => {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('institution_id', tenant)
      .is('deleted_at', null)

    if (error) throw error
    return count ?? 0
  }

  const [
    teachersTotal,
    teachersActive,
    teachersInvited,
    teachersSuspended,
    studentsTotal,
    studentsActive,
    studentsInvited,
    studentsSuspended,
    departments,
    programs,
    classes,
    years,
  ] = await Promise.all([
    countMembers('teachers'),
    countMembers('teachers', 'ACTIVE'),
    countMembers('teachers', 'INVITED'),
    countMembers('teachers', 'SUSPENDED'),
    countMembers('students'),
    countMembers('students', 'ACTIVE'),
    countMembers('students', 'INVITED'),
    countMembers('students', 'SUSPENDED'),
    countRecords('departments'),
    countRecords('programs'),
    countRecords('classes'),
    countRecords('academic_years'),
  ])

  const { data: currentYear } = await supabase
    .from('academic_years')
    .select('name, starts_on, ends_on')
    .eq('institution_id', tenant)
    .eq('is_current', true)
    .is('deleted_at', null)
    .maybeSingle()

  return {
    teachers: {
      total: teachersTotal,
      active: teachersActive,
      invited: teachersInvited,
      suspended: teachersSuspended,
    },
    students: {
      total: studentsTotal,
      active: studentsActive,
      invited: studentsInvited,
      suspended: studentsSuspended,
    },
    academics: { departments, programs, classes, years },
    pendingActivations: teachersInvited + studentsInvited,
    currentYear: currentYear ?? null,
  }
}

export type RecentMember = {
  id: string
  full_name: string
  email: string
  role: string
  status: string
  created_at: string
}

/** The most recently provisioned accounts, for the dashboard's activity strip. */
export async function listRecentMembers(limit = 8): Promise<RecentMember[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at')
    .eq('institution_id', session.institutionId)
    .in('role', ['TEACHER', 'STUDENT'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as RecentMember[]
}
