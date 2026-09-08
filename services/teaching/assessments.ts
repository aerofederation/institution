'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { assessmentSchema, questionSchema } from '@/lib/validation/teaching'

/**
 * Quizzes and tests, from the teacher's side.
 *
 * Everything a student does with a paper goes through the SECURITY DEFINER
 * functions in migration 022 rather than through these tables — see
 * `services/learning/assessments`. The split is the point: the answer key, the
 * clock and the score are decided in the database, and a student never reads
 * `assessment_options` at all.
 *
 * On this side, ownership is the rule. `private.owns_assessment()` gates the
 * questions, the options, the attempts and the marking, so one teacher cannot
 * open another's paper even to look.
 */

export type AssessmentRow = {
  id: string
  kind: string
  title: string
  instructions: string | null
  duration_minutes: number | null
  pass_marks: number | null
  max_attempts: number
  opens_at: string | null
  closes_at: string | null
  shuffle_questions: boolean
  reveal_answers: boolean
  is_published: boolean
  created_at: string
  class_id: string
  section_id: string | null
  classes: { name: string } | null
  sections: { name: string } | null
  subjects: { name: string } | null
}

const SELECT = `id, kind, title, instructions, duration_minutes, pass_marks, max_attempts,
  opens_at, closes_at, shuffle_questions, reveal_answers, is_published, created_at,
  class_id, section_id, classes ( name ), sections ( name ), subjects ( name )`

export async function listOwnAssessments(): Promise<AssessmentRow[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessments')
    .select(SELECT)
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as unknown as AssessmentRow[]
}

export type QuestionRow = {
  id: string
  position: number
  question_type: string
  prompt: string
  marks: number
  explanation: string | null
  assessment_options: { id: string; position: number; label: string; is_correct: boolean }[]
}

export async function getOwnAssessment(
  id: string,
): Promise<{ assessment: AssessmentRow; questions: QuestionRow[] } | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select(SELECT)
    .eq('id', id)
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!assessment) return null

  /*
   * The answer key travels to the teacher's own screen, and only there.
   * `options_owner_all` admits this select solely to the owning teacher — there
   * is no student policy and no oversight policy on that table.
   */
  const { data: questions, error: questionsError } = await supabase
    .from('assessment_questions')
    .select(
      `id, position, question_type, prompt, marks, explanation,
       assessment_options ( id, position, label, is_correct )`,
    )
    .eq('assessment_id', id)
    .order('position')

  if (questionsError) throw questionsError

  return {
    assessment: assessment as unknown as AssessmentRow,
    questions: (questions ?? []) as unknown as QuestionRow[],
  }
}

export async function createAssessment(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'assessment belongs to an institution')
    }

    const parsed = assessmentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'assessment rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assessments')
      .insert({
        institution_id: session.institutionId,
        teacher_id: session.userId,
        class_id: values.class_id,
        section_id: values.section_id ?? null,
        subject_id: values.subject_id ?? null,
        academic_year_id: values.academic_year_id,
        kind: values.kind,
        title: values.title,
        instructions: values.instructions ?? null,
        duration_minutes: values.duration_minutes ?? null,
        pass_marks: values.pass_marks ?? null,
        max_attempts: values.max_attempts,
        opens_at: values.opens_at ? new Date(values.opens_at).toISOString() : null,
        closes_at: values.closes_at ? new Date(values.closes_at).toISOString() : null,
        shuffle_questions: values.shuffle_questions,
        reveal_answers: values.reveal_answers,
        // A new paper is never born published: it has no questions yet, and a
        // published paper with nothing in it is a broken promise to a class.
        status: 'DRAFT',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === '42501') {
        throw new AppError('FORBIDDEN', 'not assigned to that class', {
          publicMessage:
            'You are not assigned to that class. Ask your institution administrator to add it.',
        })
      }
      throw error
    }

    revalidatePath('/teacher/assessments')
    return { id: data.id }
  })
}

/**
 * Saves a question and its options together.
 *
 * One call, because a choice question without options is not answerable, and
 * writing them separately would let a paper exist in that state. Options are
 * replaced wholesale rather than diffed — they are a small, ordered set, and a
 * diff would be more code with more ways to leave a stale answer key behind.
 */
export async function saveQuestion(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'question belongs to an institution')
    }

    const parsed = questionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    // Ownership via the caller's own client: if RLS will not return the paper,
    // it is not theirs to add a question to.
    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, is_published')
      .eq('id', values.assessment_id)
      .eq('teacher_id', session.userId)
      .is('deleted_at', null)
      .maybeSingle()

    if (!assessment) throw notFound('assessment not found')

    if (assessment.is_published) {
      /*
       * Editing a live paper would change it underneath anybody sitting it, and
       * would invalidate the marks of anybody who already finished.
       */
      throw new AppError('CONFLICT', 'cannot edit a published paper', {
        publicMessage:
          'Unpublish this paper before changing its questions — students may be sitting it.',
      })
    }

    const { data: last } = await supabase
      .from('assessment_questions')
      .select('position')
      .eq('assessment_id', values.assessment_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data: question, error } = await supabase
      .from('assessment_questions')
      .insert({
        institution_id: session.institutionId,
        assessment_id: values.assessment_id,
        position: (last?.position ?? -1) + 1,
        question_type: values.question_type,
        prompt: values.prompt,
        marks: values.marks,
        explanation: values.explanation ?? null,
      })
      .select('id')
      .single()

    if (error) throw error

    if (values.options.length > 0) {
      const { error: optionsError } = await supabase.from('assessment_options').insert(
        values.options.map((option, index) => ({
          institution_id: session.institutionId!,
          question_id: question.id,
          position: index,
          label: option.label,
          is_correct: option.is_correct,
        })),
      )

      if (optionsError) {
        // Without its options the question is unanswerable, so it does not stay.
        await supabase.from('assessment_questions').delete().eq('id', question.id)
        throw optionsError
      }
    }

    revalidatePath(`/teacher/assessments/${values.assessment_id}`)
    return { id: question.id }
  })
}

export async function deleteQuestion(input: {
  question_id: string
  assessment_id: string
}): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    // `questions_write` requires ownership of the parent assessment, so a
    // question belonging to another teacher simply is not deletable here.
    const { error } = await supabase
      .from('assessment_questions')
      .delete()
      .eq('id', input.question_id)

    if (error) throw error

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { removed: true as const }
  })
}

export async function setAssessmentPublished(input: {
  assessment_id: string
  publish: boolean
}): Promise<ActionResult<{ published: boolean }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    if (input.publish) {
      // A paper with no questions cannot be sat. Publishing one would put an
      // empty test in front of a class.
      const { count } = await supabase
        .from('assessment_questions')
        .select('id', { count: 'exact', head: true })
        .eq('assessment_id', input.assessment_id)

      if (!count) {
        throw new AppError('CONFLICT', 'no questions', {
          publicMessage: 'Add at least one question before publishing.',
        })
      }
    }

    /*
     * `status` is the state; `is_published` is derived from it by trigger and
     * kept so the policies written in migration 021 still read what they expect.
     * Writing the derived column here would be writing to the shadow.
     */
    const { data, error } = await supabase
      .from('assessments')
      .update({ status: input.publish ? 'PUBLISHED' : 'DRAFT' })
      .eq('id', input.assessment_id)
      .eq('teacher_id', session.userId)
      .select('is_published')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        throw new AppError('CONFLICT', error.message, {
          publicMessage:
            'A student has already started this paper, so it cannot be taken back to draft.',
        })
      }
      throw error
    }
    if (!data) throw notFound('assessment not found')

    revalidatePath('/teacher/assessments')
    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { published: data.is_published }
  })
}

export async function deleteAssessment(input: {
  assessment_id: string
}): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assessments')
      .update({ deleted_at: new Date().toISOString(), is_published: false })
      .eq('id', input.assessment_id)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('assessment not found')

    revalidatePath('/teacher/assessments')
    return { removed: true as const }
  })
}

// ── Results and marking ─────────────────────────────────────────────────────

export type AttemptRow = {
  id: string
  student_id: string
  attempt_no: number
  status: string
  score: number | null
  max_score: number | null
  submitted_at: string | null
  students: { student_code: string; profiles: { full_name: string } | null } | null
}

export async function listAttempts(assessmentId: string): Promise<AttemptRow[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('assessment_attempts')
    .select(
      `id, student_id, attempt_no, status, score, max_score, submitted_at,
       students ( student_code, profiles!students_profile_id_fkey ( full_name ) )`,
    )
    .eq('assessment_id', assessmentId)
    .order('submitted_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return (data ?? []) as unknown as AttemptRow[]
}

export type PendingAnswer = {
  id: string
  text_answer: string | null
  marks_awarded: number
  assessment_questions: { prompt: string; marks: number } | null
  assessment_attempts: { student_id: string; assessment_id: string } | null
}

/** Free-text answers on this paper that still need a human mark. */
export async function listAnswersAwaitingMarking(assessmentId: string): Promise<PendingAnswer[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data: attempts } = await supabase
    .from('assessment_attempts')
    .select('id')
    .eq('assessment_id', assessmentId)
    .eq('status', 'SUBMITTED')

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id)
  if (attemptIds.length === 0) return []

  const { data, error } = await supabase
    .from('assessment_answers')
    .select(
      `id, text_answer, marks_awarded,
       assessment_questions ( prompt, marks ),
       assessment_attempts ( student_id, assessment_id )`,
    )
    .in('attempt_id', attemptIds)
    .is('is_correct', null)

  if (error) throw error
  return (data ?? []) as unknown as PendingAnswer[]
}

/**
 * Marks one free-text answer.
 *
 * Delegates to `teacher_grade_answer()`, which re-checks ownership, clamps the
 * mark to the question's maximum and recomputes the attempt's total. Doing the
 * arithmetic here instead would put the score in the client's reach.
 */
export async function gradeAnswer(input: {
  answer_id: string
  marks: number
  assessment_id: string
  feedback?: string | null
}): Promise<ActionResult<{ score: number; awaiting: number }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('teacher_grade_answer', {
      target_answer_id: input.answer_id,
      awarded: input.marks,
      comment: input.feedback ?? null,
    })

    if (error) throw error

    const result = data as unknown as { score: number; awaiting: number }
    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return result
  })
}
