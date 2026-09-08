'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  MANUAL_ONLY_TYPES,
  gradeAnswerSchema,
  type QuestionType,
} from '@/lib/validation/assessment'

/**
 * Marking, results and analytics.
 *
 * Every number on these screens comes from a submitted attempt. Nothing is
 * estimated, sampled or filled in — an assessment nobody has sat reports zeros
 * and says so, which is more useful than a plausible-looking chart.
 *
 * The marking itself is done by `teacher_grade_answer()` in the database, which
 * re-checks ownership, clamps the mark to the question's maximum, recomputes
 * the attempt total from the marks actually awarded, and records a revision if
 * the result had already been released. This layer decides who may ask; it does
 * not do the arithmetic.
 */

export type GradingAnswer = {
  id: string
  question_id: string
  text_answer: string | null
  answer_payload: Record<string, unknown>
  storage_path: string | null
  file_name: string | null
  marks_awarded: number
  /** What auto marking would have awarded. Advisory; never a mark. */
  suggested_marks: number | null
  is_correct: boolean | null
  feedback: string | null
  /** Set only when a person marked it — the engine leaves it null. */
  graded_at: string | null
  assessment_questions: {
    prompt: string
    question_type: string
    marks: number
    explanation: string | null
    /** Present when the teacher wrote one; AI grading requires it. */
    rubric: string | null
  } | null
}

export type GradingAttempt = {
  id: string
  student_id: string
  attempt_no: number
  status: string
  score: number | null
  max_score: number | null
  awaiting_manual: number
  started_at: string
  submitted_at: string | null
  is_late: boolean
  released_at: string | null
  students: { student_code: string; profiles: { full_name: string } | null } | null
}

/**
 * Attempts on this paper that still need a person, newest first.
 *
 * `assessment_attempts` is readable to the owning teacher through
 * `attempts_select`, so a paper belonging to somebody else returns nothing here
 * rather than being filtered out afterwards.
 */
export async function listAttemptsToGrade(assessmentId: string): Promise<GradingAttempt[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessment_attempts')
    .select(
      `id, student_id, attempt_no, status, score, max_score, awaiting_manual,
       started_at, submitted_at, is_late, released_at,
       students ( student_code, profiles!students_profile_id_fkey ( full_name ) )`,
    )
    .eq('assessment_id', assessmentId)
    .neq('status', 'IN_PROGRESS')
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as unknown as GradingAttempt[]
}

/** One attempt's answers, in the order the paper was served. */
export async function getAttemptForGrading(
  attemptId: string,
): Promise<{ attempt: GradingAttempt; answers: GradingAnswer[] } | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data: attempt, error } = await supabase
    .from('assessment_attempts')
    .select(
      `id, student_id, attempt_no, status, score, max_score, awaiting_manual,
       started_at, submitted_at, is_late, released_at, question_set,
       students ( student_code, profiles!students_profile_id_fkey ( full_name ) )`,
    )
    .eq('id', attemptId)
    .maybeSingle()

  if (error) throw error
  if (!attempt) return null

  const { data: answers, error: answersError } = await supabase
    .from('assessment_answers')
    .select(
      `id, question_id, text_answer, answer_payload, storage_path, file_name,
       marks_awarded, suggested_marks, is_correct, feedback, graded_at,
       assessment_questions ( prompt, question_type, marks, explanation, rubric )`,
    )
    .eq('attempt_id', attemptId)

  if (answersError) throw answersError

  // Ordered by the attempt's own question set, so the teacher reads the paper
  // in the order the student saw it.
  const order = (attempt as unknown as { question_set: string[] }).question_set ?? []
  const rows = (answers ?? []) as unknown as GradingAnswer[]
  const sorted = [...rows].sort(
    (a, b) => order.indexOf(a.question_id) - order.indexOf(b.question_id),
  )

  return { attempt: attempt as unknown as GradingAttempt, answers: sorted }
}

export async function gradeAnswer(
  input: unknown,
): Promise<ActionResult<{ score: number; awaiting: number; released: boolean }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })

    const parsed = gradeAnswerSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'grade rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('teacher_grade_answer', {
      target_answer_id: parsed.data.answer_id,
      awarded: parsed.data.marks,
      comment: parsed.data.feedback ?? null,
    })

    if (error) {
      // 22023 is the function refusing a mark outside the question's range.
      if (error.code === '22023') {
        throw new AppError('VALIDATION', error.message, {
          fieldErrors: { marks: [error.message] },
        })
      }
      throw error
    }

    const result = data as unknown as { score: number; awaiting: number; released: boolean }

    revalidatePath(`/teacher/assessments/${parsed.data.assessment_id}/grading`)
    return result
  })
}

export async function releaseResults(input: {
  assessment_id: string
}): Promise<ActionResult<{ released: number }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('teacher_release_results', {
      target_assessment_id: input.assessment_id,
    })

    if (error) throw error

    await supabase.rpc('write_audit_log', {
      action: 'RESULTS_RELEASED',
      entity_type: 'assessment',
      entity_id: input.assessment_id,
      metadata: { attempts: data } as never,
    })

    revalidatePath(`/teacher/assessments/${input.assessment_id}/results`)
    return { released: (data as unknown as number) ?? 0 }
  })
}

// ── Results ─────────────────────────────────────────────────────────────────

export type ResultRow = {
  student_id: string
  student_code: string
  full_name: string
  attempts: number
  best: GradingAttempt | null
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED' | 'EXPIRED'
}

/**
 * Every student the paper was addressed to, and what became of them.
 *
 * Starts from the enrolment rather than from the attempts, so a student who
 * never opened it appears as NOT_STARTED instead of simply being absent. "Who
 * has not done this" is the question a teacher most often has.
 */
export async function listResults(assessmentId: string): Promise<{
  rows: ResultRow[]
  scoring: string
}> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from('assessments')
    .select('class_id, section_id, attempt_scoring')
    .eq('id', assessmentId)
    .maybeSingle()

  if (!assessment) return { rows: [], scoring: 'HIGHEST' }

  const { data: enrolled } = await supabase
    .from('student_enrollments')
    .select('student_id, section_id')
    .eq('institution_id', session.institutionId)
    .eq('class_id', assessment.class_id)
    .eq('status', 'ACTIVE')

  const cohort = (enrolled ?? []).filter(
    (row) => !assessment.section_id || row.section_id === assessment.section_id,
  )

  const [{ data: students }, attempts] = await Promise.all([
    supabase
      .from('students')
      .select('profile_id, student_code, profiles!students_profile_id_fkey ( full_name )')
      .in('profile_id', cohort.map((row) => row.student_id).length ? cohort.map((row) => row.student_id) : ['00000000-0000-0000-0000-000000000000']),
    listAttemptsToGrade(assessmentId),
  ])

  const byStudent = new Map<string, GradingAttempt[]>()
  for (const attempt of attempts) {
    byStudent.set(attempt.student_id, [...(byStudent.get(attempt.student_id) ?? []), attempt])
  }

  const rows: ResultRow[] = (students ?? []).map((student) => {
    const own = byStudent.get(student.profile_id) ?? []
    const profile = student.profiles as unknown as { full_name: string } | null

    // The teacher's configured rule decides which attempt counts. A student
    // cannot influence it — it is stored on the assessment.
    const chosen = pickAttempt(own, assessment.attempt_scoring)

    return {
      student_id: student.profile_id,
      student_code: student.student_code,
      full_name: profile?.full_name ?? student.student_code,
      attempts: own.length,
      best: chosen,
      status: own.length === 0 ? 'NOT_STARTED' : (chosen?.status as ResultRow['status']) ?? 'SUBMITTED',
    }
  })

  return { rows, scoring: assessment.attempt_scoring }
}

function pickAttempt(attempts: GradingAttempt[], rule: string): GradingAttempt | null {
  if (attempts.length === 0) return null

  const bySubmitted = [...attempts].sort(
    (a, b) => new Date(a.submitted_at ?? 0).getTime() - new Date(b.submitted_at ?? 0).getTime(),
  )

  switch (rule) {
    case 'FIRST':
      return bySubmitted[0]
    case 'LATEST':
      return bySubmitted[bySubmitted.length - 1]
    case 'AVERAGE': {
      /*
       * An averaged result is not one of the attempts, so a synthetic row is
       * returned carrying the mean. Its `id` is the latest attempt's, so a link
       * to "open this result" still leads somewhere real.
       */
      const scored = attempts.filter((attempt) => attempt.score !== null)
      if (scored.length === 0) return bySubmitted[bySubmitted.length - 1]
      const mean =
        scored.reduce((sum, attempt) => sum + Number(attempt.score), 0) / scored.length
      return {
        ...bySubmitted[bySubmitted.length - 1],
        score: Math.round(mean * 100) / 100,
      }
    }
    default:
      return attempts.reduce((best, attempt) =>
        Number(attempt.score ?? -1) > Number(best.score ?? -1) ? attempt : best,
      )
  }
}

// ── Analytics ───────────────────────────────────────────────────────────────

export type Analytics = {
  cohort: number
  started: number
  completed: number
  notAttempted: number
  averageScore: number | null
  highestScore: number | null
  lowestScore: number | null
  passRate: number | null
  averageMinutes: number | null
  questions: {
    id: string
    prompt: string
    question_type: string
    marks: number
    answered: number
    correctPercent: number | null
    averageMarks: number | null
  }[]
}

/**
 * Real figures, or none.
 *
 * Where there is no data the fields are null and the screen says "nobody has
 * sat this yet" — rather than showing a confident 0% that reads like a result.
 */
export async function getAnalytics(assessmentId: string): Promise<Analytics> {
  const supabase = await createClient()

  const [{ rows: cohortRows }, attempts] = await Promise.all([
    listResults(assessmentId),
    listAttemptsToGrade(assessmentId),
  ])

  const { data: assessment } = await supabase
    .from('assessments')
    .select('pass_marks')
    .eq('id', assessmentId)
    .maybeSingle()

  const scored = attempts.filter((attempt) => attempt.score !== null)
  const scores = scored.map((attempt) => Number(attempt.score))

  const durations = scored
    .map((attempt) => {
      if (!attempt.submitted_at) return null
      return (
        (new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 60_000
      )
    })
    .filter((value): value is number => value !== null && value >= 0)

  const passMark = assessment?.pass_marks !== null && assessment?.pass_marks !== undefined
    ? Number(assessment.pass_marks)
    : null

  const { data: questions } = await supabase
    .from('assessment_questions')
    .select('id, prompt, question_type, marks')
    .eq('assessment_id', assessmentId)
    .order('position')

  const { data: answers } = await supabase
    .from('assessment_answers')
    .select('question_id, is_correct, marks_awarded, attempt_id')
    .in(
      'attempt_id',
      attempts.length ? attempts.map((attempt) => attempt.id) : ['00000000-0000-0000-0000-000000000000'],
    )

  const perQuestion = (questions ?? []).map((question) => {
    const own = (answers ?? []).filter((answer) => answer.question_id === question.id)
    const marked = own.filter((answer) => answer.is_correct !== null)
    const correct = marked.filter((answer) => answer.is_correct === true).length

    /*
     * "Correct" is only a meaningful category for a question with a right
     * answer. On a manually marked one, `is_correct` records whether full marks
     * were awarded — so an essay scored 4 out of 5 would report as 0% correct,
     * which reads as "everyone got it wrong" and is simply false.
     *
     * For those types the rate is withheld and the average mark carries the
     * meaning instead.
     */
    const objective = !MANUAL_ONLY_TYPES.includes(question.question_type as QuestionType)

    return {
      id: question.id,
      prompt: question.prompt,
      question_type: question.question_type,
      marks: Number(question.marks),
      answered: own.length,
      correctPercent:
        objective && marked.length > 0 ? Math.round((correct / marked.length) * 100) : null,
      averageMarks:
        own.length > 0
          ? Math.round(
              (own.reduce((sum, answer) => sum + Number(answer.marks_awarded), 0) / own.length) *
                100,
            ) / 100
          : null,
    }
  })

  return {
    cohort: cohortRows.length,
    started: attempts.length,
    completed: attempts.filter((attempt) => attempt.status !== 'IN_PROGRESS').length,
    notAttempted: cohortRows.filter((row) => row.status === 'NOT_STARTED').length,
    averageScore:
      scores.length > 0
        ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100) / 100
        : null,
    highestScore: scores.length > 0 ? Math.max(...scores) : null,
    lowestScore: scores.length > 0 ? Math.min(...scores) : null,
    passRate:
      passMark !== null && scores.length > 0
        ? Math.round((scores.filter((value) => value >= passMark).length / scores.length) * 100)
        : null,
    averageMinutes:
      durations.length > 0
        ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10
        : null,
    questions: perQuestion,
  }
}

/** What the browser reported during an attempt. Context, never proof. */
export async function listIntegrityEvents(attemptId: string) {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessment_integrity_events')
    .select('id, event, occurred_at, detail')
    .eq('attempt_id', attemptId)
    .order('occurred_at')

  if (error) throw error
  return data ?? []
}

export async function getGradeRevisions(attemptId: string) {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessment_grade_revisions')
    .select('id, previous_score, new_score, reason, revised_at')
    .eq('attempt_id', attemptId)
    .order('revised_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function findAttemptById(attemptId: string): Promise<{ assessment_id: string } | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data } = await supabase
    .from('assessment_attempts')
    .select('assessment_id')
    .eq('id', attemptId)
    .maybeSingle()

  if (!data) throw notFound('attempt not found')
  return data
}
