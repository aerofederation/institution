import 'server-only'

import { requireHq } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'

/**
 * Federation growth and composition, computed from real rows.
 *
 * Growth series are built from `created_at` on the underlying tables. Only the
 * timestamp column is selected — never whole rows — and the series is bucketed
 * in application code because that keeps this working on the current schema
 * without adding rollup tables or database functions that later phases will
 * want to design properly.
 *
 * There is no synthetic data anywhere here. A federation with three
 * institutions produces a chart with three points, and the surfaces that read
 * these functions say so rather than padding the axis.
 */

export type SeriesPoint = { period: string; label: string; value: number }

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: '2-digit',
  })
}

/** The last `months` month buckets, including empty ones. */
function emptySeries(months: number): Map<string, number> {
  const series = new Map<string, number>()
  const now = new Date()
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1))
    series.set(monthKey(date), 0)
  }
  return series
}

function bucket(rows: { created_at: string }[], months: number): SeriesPoint[] {
  const series = emptySeries(months)
  for (const row of rows) {
    const key = monthKey(new Date(row.created_at))
    if (series.has(key)) series.set(key, (series.get(key) ?? 0) + 1)
  }
  return [...series.entries()].map(([period, value]) => ({
    period,
    label: monthLabel(period),
    value,
  }))
}

/** Cumulative running total, for "network size over time". */
function cumulative(points: SeriesPoint[], startingFrom: number): SeriesPoint[] {
  let total = startingFrom
  return points.map((point) => {
    total += point.value
    return { ...point, value: total }
  })
}

export type HqAnalytics = {
  months: number
  institutionGrowth: SeriesPoint[]
  institutionCumulative: SeriesPoint[]
  teacherGrowth: SeriesPoint[]
  studentGrowth: SeriesPoint[]
  applicationTrend: SeriesPoint[]
  byType: { label: string; value: number }[]
  byStatus: { label: string; value: number }[]
  applicationOutcomes: { label: string; value: number }[]
  totals: {
    institutions: number
    teachers: number
    students: number
    applications: number
  }
  /** True when there is genuinely nothing to plot. */
  isEmpty: boolean
}

export async function getHqAnalytics(months = 12): Promise<HqAnalytics> {
  await requireHq('institution.read_all')
  const supabase = await createClient()

  const since = new Date()
  since.setUTCMonth(since.getUTCMonth() - (months - 1))
  since.setUTCDate(1)
  since.setUTCHours(0, 0, 0, 0)
  const sinceIso = since.toISOString()

  const [institutions, teachers, students, applications, typeRows, statusRows, outcomeRows] =
    await Promise.all([
      supabase
        .from('institutions')
        .select('created_at')
        .gte('created_at', sinceIso)
        .is('deleted_at', null),
      supabase
        .from('teachers')
        .select('created_at')
        .gte('created_at', sinceIso)
        .is('deleted_at', null),
      supabase
        .from('students')
        .select('created_at')
        .gte('created_at', sinceIso)
        .is('deleted_at', null),
      supabase
        .from('institution_applications')
        .select('created_at')
        .gte('created_at', sinceIso)
        .is('deleted_at', null),
      supabase.from('institutions').select('institution_type').is('deleted_at', null),
      supabase.from('institutions').select('status').is('deleted_at', null),
      supabase.from('institution_applications').select('status').is('deleted_at', null),
    ])

  for (const result of [
    institutions,
    teachers,
    students,
    applications,
    typeRows,
    statusRows,
    outcomeRows,
  ]) {
    if (result.error) throw result.error
  }

  // Rows created before the window still count toward the cumulative baseline.
  const priorInstitutions = await supabase
    .from('institutions')
    .select('id', { count: 'exact', head: true })
    .lt('created_at', sinceIso)
    .is('deleted_at', null)

  const tally = (rows: { [key: string]: string }[], key: string) => {
    const counts = new Map<string, number>()
    for (const row of rows) {
      const value = row[key]
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([label, value]) => ({
        label: label.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()),
        value,
      }))
      .sort((a, b) => b.value - a.value)
  }

  const institutionGrowth = bucket(institutions.data ?? [], months)

  return {
    months,
    institutionGrowth,
    institutionCumulative: cumulative(institutionGrowth, priorInstitutions.count ?? 0),
    teacherGrowth: bucket(teachers.data ?? [], months),
    studentGrowth: bucket(students.data ?? [], months),
    applicationTrend: bucket(applications.data ?? [], months),
    byType: tally(typeRows.data ?? [], 'institution_type'),
    byStatus: tally(statusRows.data ?? [], 'status'),
    applicationOutcomes: tally(outcomeRows.data ?? [], 'status'),
    totals: {
      institutions: (typeRows.data ?? []).length,
      teachers: (teachers.data ?? []).length,
      students: (students.data ?? []).length,
      applications: (outcomeRows.data ?? []).length,
    },
    isEmpty:
      (typeRows.data ?? []).length === 0 &&
      (outcomeRows.data ?? []).length === 0 &&
      (teachers.data ?? []).length === 0 &&
      (students.data ?? []).length === 0,
  }
}

/** Global academic-network composition. */
export async function getAcademicNetwork() {
  await requireHq('academic.read_all')
  const supabase = await createClient()

  const countOf = async (table: Parameters<typeof supabase.from>[0], soft = true) => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true })
    if (soft) query = query.is('deleted_at', null)
    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }

  const [
    institutions,
    departments,
    programs,
    academicYears,
    classes,
    sections,
    subjects,
    courses,
    enrolments,
    teacherClassAssignments,
  ] = await Promise.all([
    countOf('institutions'),
    countOf('departments'),
    countOf('programs'),
    countOf('academic_years', false),
    countOf('classes'),
    countOf('sections'),
    countOf('subjects'),
    countOf('courses'),
    countOf('student_enrollments', false),
    countOf('teacher_class_assignments', false),
  ])

  return {
    institutions,
    departments,
    programs,
    academicYears,
    classes,
    sections,
    subjects,
    courses,
    enrolments,
    teacherClassAssignments,
  }
}
