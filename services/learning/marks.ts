'use server'

import { requireTenant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

/**
 * A student's own marks, and what they add up to.
 *
 * Every figure on this page is computed from released attempts and nothing
 * else. `released_at is null` means the teacher has not published that result
 * yet, and an average that quietly included one would tell the student their
 * mark by arithmetic — the number would move the moment the paper was scored,
 * before anybody decided it should be visible. So the filter is not a display
 * preference; it is the same rule `student_get_result()` enforces when it
 * refuses to send an unreleased score to the browser at all.
 *
 * `attempts_select` already limits these rows to the student's own. The
 * explicit `student_id` filter below is redundant against it and kept: if that
 * policy were ever loosened, this query would still return one person's marks.
 */

export type MarkRow = {
  attempt_id: string
  assessment_id: string
  title: string
  kind: string
  subject: string
  attempt_no: number
  score: number
  max_score: number
  percentage: number
  passed: boolean | null
  is_late: boolean
  submitted_at: string | null
  released_at: string
}

export type SubjectSummary = {
  subject: string
  papers: number
  average: number
  best: number
  lowest: number
  passed: number
}

export type KindSummary = { kind: string; papers: number; average: number }

export type StudentMarks = {
  results: MarkRow[]
  /** Chronological, for the trend. Oldest first. */
  trend: { label: string; value: number }[]
  subjects: SubjectSummary[]
  kinds: KindSummary[]
  overall: {
    papers: number
    average: number
    best: number
    lowest: number
    passed: number
    failed: number
    /** Papers submitted and marked but not yet released by the teacher. */
    awaitingRelease: number
  }
}

const round = (value: number) => Math.round(value * 10) / 10

function average(values: number[]) {
  if (values.length === 0) return 0
  return round(values.reduce((total, value) => total + value, 0) / values.length)
}

export async function getStudentMarks(): Promise<StudentMarks> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessment_attempts')
    .select(
      `id, assessment_id, attempt_no, score, max_score, percentage, passed, is_late,
       submitted_at, released_at,
       assessments ( title, kind, subjects ( name ) )`,
    )
    .eq('student_id', session.userId)
    .not('released_at', 'is', null)
    .order('submitted_at', { ascending: true })

  if (error) throw error

  type Row = {
    id: string
    assessment_id: string
    attempt_no: number
    score: number | null
    max_score: number | null
    percentage: number | null
    passed: boolean | null
    is_late: boolean
    submitted_at: string | null
    released_at: string
    assessments: { title: string; kind: string; subjects: { name: string } | null } | null
  }

  const rows = (data ?? []) as unknown as Row[]

  const results: MarkRow[] = rows
    /*
     * A released attempt with no score is not a zero — it is a row that has
     * nothing to say, and averaging it in as zero would drag the student's
     * figures down for a paper that was never actually marked.
     */
    .filter((row) => row.score !== null && row.max_score !== null && row.max_score > 0)
    .map((row) => ({
      attempt_id: row.id,
      assessment_id: row.assessment_id,
      title: row.assessments?.title ?? 'Paper',
      kind: row.assessments?.kind ?? 'TEST',
      subject: row.assessments?.subjects?.name ?? 'Unassigned',
      attempt_no: row.attempt_no,
      score: Number(row.score),
      max_score: Number(row.max_score),
      // `percentage` is computed by the database on release. Recomputing it
      // here only when it is missing keeps one source of truth.
      percentage:
        row.percentage !== null
          ? Number(row.percentage)
          : round((Number(row.score) / Number(row.max_score)) * 100),
      passed: row.passed,
      is_late: row.is_late,
      submitted_at: row.submitted_at,
      released_at: row.released_at,
    }))

  // How many are sat and marked but still with the teacher.
  const { count: awaitingRelease } = await supabase
    .from('assessment_attempts')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', session.userId)
    .is('released_at', null)
    // Sat and finished. ABANDONED and EXPIRED are not waiting on anybody, and
    // IN_PROGRESS has not been handed in.
    .in('status', ['SUBMITTED', 'GRADED'])

  const percentages = results.map((row) => row.percentage)

  const bySubject = new Map<string, MarkRow[]>()
  const byKind = new Map<string, MarkRow[]>()
  for (const row of results) {
    bySubject.set(row.subject, [...(bySubject.get(row.subject) ?? []), row])
    byKind.set(row.kind, [...(byKind.get(row.kind) ?? []), row])
  }

  const subjects: SubjectSummary[] = [...bySubject.entries()]
    .map(([subject, items]) => {
      const values = items.map((item) => item.percentage)
      return {
        subject,
        papers: items.length,
        average: average(values),
        best: round(Math.max(...values)),
        lowest: round(Math.min(...values)),
        passed: items.filter((item) => item.passed === true).length,
      }
    })
    .sort((a, b) => b.average - a.average)

  const kinds: KindSummary[] = [...byKind.entries()]
    .map(([kind, items]) => ({
      kind,
      papers: items.length,
      average: average(items.map((item) => item.percentage)),
    }))
    .sort((a, b) => b.average - a.average)

  return {
    // Newest first for the table; the trend keeps its chronological order.
    results: [...results].reverse(),
    trend: results.map((row) => ({
      label: row.submitted_at
        ? new Date(row.submitted_at).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
          })
        : '—',
      value: row.percentage,
    })),
    subjects,
    kinds,
    overall: {
      papers: results.length,
      average: average(percentages),
      best: percentages.length > 0 ? round(Math.max(...percentages)) : 0,
      lowest: percentages.length > 0 ? round(Math.min(...percentages)) : 0,
      passed: results.filter((row) => row.passed === true).length,
      failed: results.filter((row) => row.passed === false).length,
      awaitingRelease: awaitingRelease ?? 0,
    },
  }
}
