import 'server-only'

import { requireHq } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'

/**
 * Federation-wide figures for the HQ command centre.
 *
 * Every number here is a `count: 'exact', head: true` against PostgreSQL — the
 * rows are counted in the database and only the count crosses the wire. No
 * metric on this dashboard is computed by fetching a table and measuring its
 * length in JavaScript, which would be both slow and a way to leak rows.
 *
 * The queries run through the request-scoped client, so RLS applies: an HQ
 * caller counts the federation because `institution.read_all` grants it, and
 * the same code executed by anyone else would count zero.
 */

export type HqOverview = {
  institutions: {
    total: number
    active: number
    pending: number
    suspended: number
  }
  applications: {
    total: number
    open: number
    submitted: number
    underReview: number
    awaitingApplicant: number
    approved: number
    rejected: number
  }
  people: {
    teachers: number
    activeTeachers: number
    students: number
    activeStudents: number
    institutionAdmins: number
  }
  academics: {
    departments: number
    programs: number
    classes: number
    courses: number
    subjects: number
  }
  documents: {
    total: number
    pending: number
  }
  activity: {
    auditEventsLast7Days: number
    institutionsAddedLast30Days: number
    applicationsLast30Days: number
  }
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

export async function getHqOverview(): Promise<HqOverview> {
  await requireHq('institution.read_all')
  const supabase = await createClient()

  const countOf = async (
    table: Parameters<typeof supabase.from>[0],
    build?: (query: ReturnType<typeof supabase.from>) => unknown,
  ) => {
    // `head: true` asks PostgREST for the count only — no row payload at all.
    let query = supabase.from(table).select('*', { count: 'exact', head: true })
    if (build) query = build(query) as typeof query
    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }

  const [
    institutionsTotal,
    institutionsActive,
    institutionsPending,
    institutionsSuspended,

    applicationsTotal,
    applicationsSubmitted,
    applicationsUnderReview,
    applicationsDocsRequired,
    applicationsResubmission,
    applicationsApproved,
    applicationsRejected,

    teachers,
    activeTeachers,
    students,
    activeStudents,
    institutionAdmins,

    departments,
    programs,
    classes,
    courses,
    subjects,

    documentsTotal,
    documentsPending,

    auditLast7,
    institutionsLast30,
    applicationsLast30,
  ] = await Promise.all([
    countOf('institutions', (q) => q.is('deleted_at', null)),
    countOf('institutions', (q) => q.eq('status', 'ACTIVE').is('deleted_at', null)),
    countOf('institutions', (q) => q.eq('status', 'PENDING').is('deleted_at', null)),
    countOf('institutions', (q) => q.eq('status', 'SUSPENDED').is('deleted_at', null)),

    countOf('institution_applications', (q) => q.is('deleted_at', null)),
    countOf('institution_applications', (q) => q.eq('status', 'SUBMITTED')),
    countOf('institution_applications', (q) => q.eq('status', 'UNDER_REVIEW')),
    countOf('institution_applications', (q) => q.eq('status', 'DOCUMENTS_REQUIRED')),
    countOf('institution_applications', (q) => q.eq('status', 'RESUBMISSION_REQUIRED')),
    countOf('institution_applications', (q) => q.eq('status', 'APPROVED')),
    countOf('institution_applications', (q) => q.eq('status', 'REJECTED')),

    countOf('teachers', (q) => q.is('deleted_at', null)),
    countOf('teachers', (q) => q.eq('status', 'ACTIVE').is('deleted_at', null)),
    countOf('students', (q) => q.is('deleted_at', null)),
    countOf('students', (q) => q.eq('status', 'ACTIVE').is('deleted_at', null)),
    countOf('institution_admins'),

    countOf('departments', (q) => q.is('deleted_at', null)),
    countOf('programs', (q) => q.is('deleted_at', null)),
    countOf('classes', (q) => q.is('deleted_at', null)),
    countOf('courses', (q) => q.is('deleted_at', null)),
    countOf('subjects', (q) => q.is('deleted_at', null)),

    countOf('institution_documents', (q) => q.is('deleted_at', null)),
    countOf('institution_documents', (q) =>
      q.eq('verification_status', 'PENDING').is('deleted_at', null),
    ),

    countOf('audit_logs', (q) => q.gte('created_at', daysAgo(7))),
    countOf('institutions', (q) => q.gte('created_at', daysAgo(30)).is('deleted_at', null)),
    countOf('institution_applications', (q) => q.gte('created_at', daysAgo(30))),
  ])

  return {
    institutions: {
      total: institutionsTotal,
      active: institutionsActive,
      pending: institutionsPending,
      suspended: institutionsSuspended,
    },
    applications: {
      total: applicationsTotal,
      // What HQ actually has to act on.
      open: applicationsSubmitted + applicationsUnderReview,
      submitted: applicationsSubmitted,
      underReview: applicationsUnderReview,
      awaitingApplicant: applicationsDocsRequired + applicationsResubmission,
      approved: applicationsApproved,
      rejected: applicationsRejected,
    },
    people: {
      teachers,
      activeTeachers,
      students,
      activeStudents,
      institutionAdmins,
    },
    academics: { departments, programs, classes, courses, subjects },
    documents: { total: documentsTotal, pending: documentsPending },
    activity: {
      auditEventsLast7Days: auditLast7,
      institutionsAddedLast30Days: institutionsLast30,
      applicationsLast30Days: applicationsLast30,
    },
  }
}

/** The most recent applications, for the overview queue. */
export async function getRecentApplications(limit = 6) {
  await requireHq('application.read_all')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institution_applications')
    .select(
      'id, application_ref, institution_name, institution_type, status, submitted_at, created_at',
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}

/** The most recent audited actions, for the overview activity rail. */
export async function getRecentActivity(limit = 8) {
  await requireHq('audit.read')
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, entity_type, entity_id, actor_email, actor_role, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data ?? []
}
