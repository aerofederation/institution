'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { answerSchema } from '@/lib/validation/teaching'

/**
 * The student's side of teaching content.
 *
 * Reads of materials and assignments go straight to the tables, because RLS
 * already answers the only question that matters: was this published to a class
 * I am enrolled in? `private.receives_content()` is consulted inside every
 * relevant policy, so a query here cannot widen what comes back.
 *
 * Assessments are different and deliberately so. Sitting a paper runs entirely
 * through the SECURITY DEFINER functions in migration 022, because three things
 * must not be client-controlled: the answer key, the clock, and the score. A
 * student holds no policy on `assessment_options` at all, and no INSERT policy
 * on `assessment_attempts` — so there is no path by which a browser could read
 * an answer or write a mark.
 */

// ── Materials ───────────────────────────────────────────────────────────────

export type StudentMaterial = {
  id: string
  title: string
  description: string | null
  material_type: string
  file_name: string | null
  file_size: number | null
  mime_type: string | null
  external_url: string | null
  published_at: string | null
  classes: { name: string } | null
  sections: { name: string } | null
  subjects: { name: string } | null
  teachers: { profiles: { full_name: string } | null } | null
}

export async function listMaterialsForStudent(): Promise<StudentMaterial[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('materials')
    .select(
      `id, title, description, material_type, file_name, file_size, mime_type, external_url, published_at,
       classes ( name ), sections ( name ), subjects ( name ),
       teachers ( profiles!teachers_profile_id_fkey ( full_name ) )`,
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('published_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as StudentMaterial[]
}

/**
 * One material, for the study-aid page.
 *
 * No visibility condition beyond the published/deleted pair the list uses:
 * `materials_select` decides the rest, so an id belonging to another class
 * returns nothing rather than a title this student should not see.
 */
export async function getMaterialForStudent(id: string): Promise<StudentMaterial | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('materials')
    .select(
      `id, title, description, material_type, file_name, file_size, mime_type, external_url, published_at,
       classes ( name ), sections ( name ), subjects ( name ),
       teachers ( profiles!teachers_profile_id_fkey ( full_name ) )`,
    )
    .eq('id', id)
    .eq('is_published', true)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  return (data as unknown as StudentMaterial | null) ?? null
}

// ── Assessments ─────────────────────────────────────────────────────────────

export type StudentAssessment = {
  id: string
  kind: string
  title: string
  instructions: string | null
  duration_minutes: number | null
  max_attempts: number
  pass_marks: number | null
  opens_at: string | null
  closes_at: string | null
  classes: { name: string } | null
  subjects: { name: string } | null
  assessment_attempts: {
    id: string
    attempt_no: number
    status: string
    score: number | null
    max_score: number | null
    submitted_at: string | null
  }[]
  /**
   * Window state, derived against the server clock.
   *
   * The database makes the same judgement in `student_start_attempt()`, which is
   * the one that counts. These exist so the page can say "opens at" instead of
   * offering a button that is certain to be refused — and so no React render
   * has to call `Date.now()`.
   */
  not_yet_open: boolean
  has_closed: boolean
  attempts_used: number
  attempts_exhausted: boolean
  /**
   * Which list this belongs in.
   *
   * Derived here rather than in the page so the tab counts and the tab contents
   * cannot disagree — and derived from the same values the database uses to
   * decide whether an attempt may start.
   */
  bucket: 'available' | 'upcoming' | 'in_progress' | 'completed'
}

export async function listAssessmentsForStudent(): Promise<StudentAssessment[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessments')
    .select(
      `id, kind, title, instructions, duration_minutes, max_attempts, pass_marks,
       opens_at, closes_at, classes ( name ), subjects ( name ),
       assessment_attempts ( id, attempt_no, status, score, max_score, submitted_at, student_id )`,
    )
    .eq('is_published', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error

  /*
   * `attempts_select` already limits the embedded attempts to this student's
   * own. Filtering again here means a loosened policy could not put a
   * classmate's score on this screen.
   */
  type EmbeddedAttempt = StudentAssessment['assessment_attempts'][number] & {
    student_id: string
  }
  type WithAttempts = Omit<StudentAssessment, 'assessment_attempts'> & {
    assessment_attempts: EmbeddedAttempt[]
  }

  const now = Date.now()

  return ((data ?? []) as unknown as WithAttempts[]).map((row) => {
    const attempts = (row.assessment_attempts ?? []).filter(
      (attempt) => attempt.student_id === session.userId,
    )
    const used = attempts.filter((attempt) => attempt.status !== 'ABANDONED').length
    const inProgress = attempts.some((attempt) => attempt.status === 'IN_PROGRESS')

    const notYetOpen = Boolean(row.opens_at && new Date(row.opens_at).getTime() > now)
    const hasClosed = Boolean(row.closes_at && new Date(row.closes_at).getTime() < now)
    const exhausted = used >= row.max_attempts

    const bucket: StudentAssessment['bucket'] = inProgress
      ? 'in_progress'
      : notYetOpen
        ? 'upcoming'
        : hasClosed || exhausted
          ? 'completed'
          : 'available'

    return {
      ...row,
      bucket,
      assessment_attempts: attempts,
      not_yet_open: notYetOpen,
      has_closed: hasClosed,
      attempts_used: used,
      // An attempt in progress is not "exhausted" — it is the one they are on.
      attempts_exhausted: exhausted && !inProgress,
    }
  })
}

export async function startAttempt(input: {
  assessment_id: string
}): Promise<ActionResult<{ attemptId: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_start_attempt', {
      target_assessment_id: input.assessment_id,
    })

    if (error) {
      // 22023 is the function refusing on a rule the student can act on: not
      // open yet, already closed, or out of attempts.
      if (error.code === '22023') {
        throw new AppError('CONFLICT', error.message, { publicMessage: error.message })
      }
      throw error
    }

    return { attemptId: data as unknown as string }
  })
}

export type Paper = {
  attempt_id: string
  assessment_id: string
  title: string
  kind: string
  instructions: string | null
  duration_minutes: number | null
  expires_at: string | null
  status: string
  questions: {
    id: string
    position: string
    question_type: string
    prompt: string
    marks: number
    options: { id: string; label: string }[]
    answer: { selected_option_ids: string[]; text_answer: string | null } | null
  }[]
}

/** The paper as the student may see it — no `is_correct` anywhere in it. */
export async function getPaper(attemptId: string): Promise<Paper | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('student_get_paper', {
    target_attempt_id: attemptId,
  })

  if (error) throw error
  return (data ?? null) as unknown as Paper | null
}

export async function saveAnswer(
  input: unknown,
): Promise<ActionResult<{ saved: boolean; reason?: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })

    const parsed = answerSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'answer rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('student_answer_question', {
      target_attempt_id: parsed.data.attempt_id,
      target_question_id: parsed.data.question_id,
      option_ids: parsed.data.option_ids,
      answer_text: parsed.data.text_answer ?? null,
      payload: (parsed.data.payload ?? {}) as never,
    })

    if (error) throw error

    /*
     * The function reports why it declined rather than just failing: the attempt
     * is finished, the time ran out, or the question is not in this paper. All
     * three are decided in the database, so the client is told rather than asked.
     */
    const outcome = data as unknown as { saved: boolean; reason?: string }
    return { saved: outcome.saved === true, reason: outcome.reason }
  })
}

export async function submitAttempt(input: {
  attempt_id: string
}): Promise<ActionResult<{ score: number; maxScore: number; awaitingMarking: boolean }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_submit_attempt', {
      target_attempt_id: input.attempt_id,
      expired: false,
    })

    if (error) throw error

    const result = data as unknown as {
      score: number
      max_score: number
      awaiting_marking: boolean
    }

    revalidatePath('/student/assessments')
    return {
      score: result.score,
      maxScore: result.max_score,
      awaitingMarking: result.awaiting_marking,
    }
  })
}

export type AttemptResult = {
  attempt_id: string
  title: string
  kind: string
  status: string
  score: number | null
  max_score: number | null
  pass_marks: number | null
  submitted_at: string | null
  reveal_answers: boolean
  questions: {
    id: string
    prompt: string
    marks: number
    explanation: string | null
    is_correct: boolean | null
    marks_awarded: number
    selected_option_ids: string[]
    options: { id: string; label: string; is_correct: boolean }[]
  }[]
}

export async function getAttemptResult(attemptId: string): Promise<AttemptResult | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('student_get_result', {
    target_attempt_id: attemptId,
  })

  if (error) {
    if (error.code === '22023') return null
    throw error
  }

  return (data ?? null) as unknown as AttemptResult | null
}
