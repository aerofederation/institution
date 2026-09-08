'use server'

import { requireTenant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * The teaching workspace's own figures.
 *
 * Every count is scoped to the acting teacher, not to their institution. A
 * teacher's dashboard showing how much material *the school* published would
 * be both useless and a small breach of the boundary this whole area exists to
 * keep.
 */

export type TeacherOverview = {
  materials: { total: number; published: number }
  assessments: { total: number; published: number; awaitingMarking: number }
  classes: number
  students: number
}

export type TeacherClass = {
  id: string
  class_id: string
  section_id: string | null
  is_class_teacher: boolean
  classes: { name: string } | null
  sections: { name: string } | null
  academic_years: { name: string } | null
}

/** The classes this teacher is assigned to — what they may publish into. */
export async function listOwnClasses(): Promise<TeacherClass[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('teacher_class_assignments')
    .select(
      `id, class_id, section_id, is_class_teacher,
       classes ( name ), sections ( name ), academic_years ( name )`,
    )
    .eq('teacher_id', session.userId)
    .eq('status', 'ACTIVE')

  if (error) throw error
  return (data ?? []) as unknown as TeacherClass[]
}

export async function getTeacherOverview(): Promise<TeacherOverview> {
  const session = await requireTenant()
  const supabase = await createClient()
  const mine = session.userId

  const countOwn = async (
    table: 'materials' | 'assessments',
    published?: boolean,
  ) => {
    let query = supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('teacher_id', mine)
      .is('deleted_at', null)

    if (published !== undefined) query = query.eq('is_published', published)

    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }

  const [
    materialsTotal,
    materialsPublished,
    assessmentsTotal,
    assessmentsPublished,
    classes,
  ] = await Promise.all([
    countOwn('materials'),
    countOwn('materials', true),
    countOwn('assessments'),
    countOwn('assessments', true),
    listOwnClasses(),
  ])

  /*
   * Work waiting on this teacher. Two queries rather than a join, because
   * `attempts_select` already limits rows to assessments they own — the
   * assessment ids are fetched first so the count cannot accidentally span
   * somebody else's.
   */
  const { data: ownAssessments } = await supabase
    .from('assessments')
    .select('id')
    .eq('teacher_id', mine)
    .is('deleted_at', null)

  const assessmentIds = (ownAssessments ?? []).map((row) => row.id)

  let awaitingAttempts = 0
  if (assessmentIds.length > 0) {
    const { count } = await supabase
      .from('assessment_attempts')
      .select('*', { count: 'exact', head: true })
      .in('assessment_id', assessmentIds)
      .eq('status', 'SUBMITTED')
    awaitingAttempts = count ?? 0
  }

  /*
   * Students reachable through an ACTIVE class assignment. `students_select`
   * admits them via `private.teaches_student()`, so this count is exactly the
   * set of students this teacher may see — not the institution's roll.
   */
  const { count: students } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)

  return {
    materials: { total: materialsTotal, published: materialsPublished },
    assessments: {
      total: assessmentsTotal,
      published: assessmentsPublished,
      awaitingMarking: awaitingAttempts,
    },
    classes: classes.length,
    students: students ?? 0,
  }
}

export type TaughtStudent = {
  profile_id: string
  student_code: string
  status: string
  profiles: { full_name: string; email: string } | null
  classes: { name: string } | null
  sections: { name: string } | null
}

/**
 * The students this teacher actually teaches.
 *
 * No explicit filter, and that is the point: `students_select` admits a row to
 * a teacher only through `private.teaches_student()`, which requires an ACTIVE
 * class assignment matching the student's ACTIVE enrolment. A teacher with no
 * assignments sees an empty list here, from the database, not from a condition
 * this file could get wrong.
 */
export async function listTaughtStudents(): Promise<TaughtStudent[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('students')
    .select(
      `profile_id, student_code, status,
       profiles!students_profile_id_fkey ( full_name, email ),
       classes ( name ), sections ( name )`,
    )
    .is('deleted_at', null)
    .order('student_code')

  if (error) throw error
  return (data ?? []) as unknown as TaughtStudent[]
}

export type PublishTargets = {
  /** One entry per class assignment — what this teacher may publish into. */
  targets: {
    class_id: string
    section_id: string | null
    academic_year_id: string
    label: string
  }[]
  subjects: { id: string; name: string }[]
}

/**
 * The class, section and year combinations this teacher may publish to.
 *
 * Built from their own assignments rather than from the institution's class
 * list, so the form cannot offer a class they do not teach. The database would
 * refuse it anyway — `materials_insert` and its siblings call
 * `private.teaches_class()` — but offering an option that is guaranteed to fail
 * is a poor way to tell somebody they are not assigned.
 */
export async function getPublishTargets(): Promise<PublishTargets> {
  const session = await requireTenant()
  const supabase = await createClient()

  const [assignments, subjects] = await Promise.all([
    listOwnClasses(),
    supabase
      .from('subjects')
      .select('id, name')
      .eq('institution_id', session.institutionId)
      .is('deleted_at', null)
      .order('name'),
  ])

  /*
   * The academic year comes from the assignment, so it always agrees with the
   * class. Letting a teacher pick a year independently would allow a class and
   * a year from different sessions, which the composite foreign keys would then
   * refuse with a message about a constraint.
   */
  const { data: rows } = await supabase
    .from('teacher_class_assignments')
    .select('class_id, section_id, academic_year_id')
    .eq('teacher_id', session.userId)
    .eq('status', 'ACTIVE')

  const byKey = new Map<string, PublishTargets['targets'][number]>()

  for (const assignment of assignments) {
    const match = (rows ?? []).find(
      (row) =>
        row.class_id === assignment.class_id && row.section_id === assignment.section_id,
    )
    if (!match) continue

    const key = `${match.class_id}:${match.section_id ?? ''}`
    byKey.set(key, {
      class_id: match.class_id,
      section_id: match.section_id,
      academic_year_id: match.academic_year_id,
      label: assignment.sections?.name
        ? `${assignment.classes?.name ?? 'Class'} · ${assignment.sections.name}`
        : `${assignment.classes?.name ?? 'Class'} (whole class)`,
    })
  }

  return {
    targets: [...byKey.values()],
    subjects: (subjects.data ?? []) as { id: string; name: string }[],
  }
}

// ── Assessment activity, for the dashboard ──────────────────────────────────

export type AssessmentDigest = {
  drafts: number
  scheduled: number
  active: number
  pendingGrading: number
  upcoming: {
    id: string
    title: string
    kind: string
    opens_at: string | null
    closes_at: string | null
    className: string | null
  }[]
  needsGrading: { id: string; title: string; outstanding: number }[]
  recentResults: {
    id: string
    title: string
    submitted: number
    averagePercent: number | null
  }[]
}

/**
 * What the teacher's own papers are doing right now.
 *
 * Every figure is counted from a real row. A dashboard that invents a number is
 * indistinguishable from one that is working, which makes it worse than an
 * empty one — so where there is nothing, these come back as zero and the page
 * says so.
 */
export async function getAssessmentDigest(): Promise<AssessmentDigest> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data: papers } = await supabase
    .from('assessments')
    .select('id, title, kind, status, opens_at, closes_at, classes ( name )')
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const all = (papers ?? []) as unknown as {
    id: string
    title: string
    kind: string
    status: string
    opens_at: string | null
    closes_at: string | null
    classes: { name: string } | null
  }[]

  const now = Date.now()
  const live = all.filter((p) => !['DRAFT', 'ARCHIVED'].includes(p.status))

  /*
   * Outstanding marking is counted from the attempts themselves rather than
   * from an assessment-level flag, so it cannot drift out of step with what a
   * teacher would find on the grading screen.
   */
  const liveIds = live.map((p) => p.id)
  const { data: attempts } = await supabase
    .from('assessment_attempts')
    .select('assessment_id, awaiting_manual, percentage, status')
    .in('assessment_id', liveIds.length ? liveIds : ['00000000-0000-0000-0000-000000000000'])
    .neq('status', 'IN_PROGRESS')

  const rows = attempts ?? []

  const outstandingBy = new Map<string, number>()
  for (const attempt of rows) {
    if (attempt.awaiting_manual > 0) {
      outstandingBy.set(
        attempt.assessment_id,
        (outstandingBy.get(attempt.assessment_id) ?? 0) + 1,
      )
    }
  }

  const scoredBy = new Map<string, number[]>()
  for (const attempt of rows) {
    if (attempt.percentage !== null && attempt.awaiting_manual === 0) {
      scoredBy.set(attempt.assessment_id, [
        ...(scoredBy.get(attempt.assessment_id) ?? []),
        Number(attempt.percentage),
      ])
    }
  }

  const isUpcoming = (p: (typeof all)[number]) =>
    p.opens_at !== null && new Date(p.opens_at).getTime() > now

  const isActive = (p: (typeof all)[number]) => {
    if (['CLOSED', 'GRADING', 'COMPLETED'].includes(p.status)) return false
    if (isUpcoming(p)) return false
    return !p.closes_at || new Date(p.closes_at).getTime() > now
  }

  return {
    drafts: all.filter((p) => p.status === 'DRAFT').length,
    scheduled: live.filter(isUpcoming).length,
    active: live.filter(isActive).length,
    pendingGrading: [...outstandingBy.values()].reduce((sum, count) => sum + count, 0),

    upcoming: live
      .filter((p) => isUpcoming(p) || isActive(p))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        title: p.title,
        kind: p.kind,
        opens_at: p.opens_at,
        closes_at: p.closes_at,
        className: p.classes?.name ?? null,
      })),

    needsGrading: live
      .filter((p) => (outstandingBy.get(p.id) ?? 0) > 0)
      .slice(0, 5)
      .map((p) => ({ id: p.id, title: p.title, outstanding: outstandingBy.get(p.id) ?? 0 })),

    recentResults: live
      .filter((p) => (scoredBy.get(p.id)?.length ?? 0) > 0)
      .slice(0, 5)
      .map((p) => {
        const scores = scoredBy.get(p.id) ?? []
        return {
          id: p.id,
          title: p.title,
          submitted: scores.length,
          averagePercent:
            scores.length > 0
              ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
              : null,
        }
      }),
  }
}
