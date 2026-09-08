'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  AUTO_MARKED_TYPES,
  KIND_DEFAULTS,
  MANUAL_ONLY_TYPES,
  OPTION_TYPES,
  assessmentDetailsSchema,
  assessmentQuestionSchema,
  assessmentSettingsSchema,
  sectionSchema,
  type AssessmentKind,
  type QuestionType,
} from '@/lib/validation/assessment'

/**
 * Building a paper.
 *
 * Everything here is the teacher's side of the engine: create, configure, write
 * questions, validate, publish. Nothing in this file computes a mark or decides
 * a deadline — those live in the database, where a browser cannot reach them.
 *
 * Two rules run through all of it. Authorship comes from the session, never the
 * request, and RLS re-checks it independently. And a published paper is not
 * freely editable: `assessment_questions` writes are refused once students can
 * see it, because changing a paper underneath somebody sitting it is the thing
 * versioning exists to prevent.
 */

export type AssessmentSummary = {
  id: string
  kind: string
  title: string
  status: string
  duration_minutes: number | null
  max_attempts: number
  pass_marks: number | null
  total_marks: number | null
  opens_at: string | null
  closes_at: string | null
  created_at: string
  results_released_at: string | null
  classes: { name: string } | null
  sections: { name: string } | null
  subjects: { name: string } | null
}

const SUMMARY = `id, kind, title, status, duration_minutes, max_attempts, pass_marks,
  total_marks, opens_at, closes_at, created_at, results_released_at,
  classes ( name ), sections ( name ), subjects ( name )`

/**
 * The teacher's own papers, optionally narrowed to one lifecycle bucket.
 *
 * `ACTIVE` and `SCHEDULED` are computed rather than stored: a paper is active
 * when its window contains now. Persisting that would need a scheduler to move
 * rows at the right minute, and a status that is a day stale is worse than one
 * derived on read.
 */
export async function listAssessments(options: {
  bucket?: string
  kind?: string
} = {}): Promise<AssessmentSummary[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  let query = supabase
    .from('assessments')
    .select(SUMMARY)
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (options.kind) query = query.eq('kind', options.kind as never)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as unknown as AssessmentSummary[]
  const now = Date.now()

  const bucketOf = (row: AssessmentSummary) => {
    if (row.status === 'ARCHIVED') return 'archived'
    if (row.status === 'DRAFT') return 'drafts'
    if (row.status === 'COMPLETED') return 'completed'
    if (row.status === 'GRADING') return 'grading'
    if (row.status === 'CLOSED') return 'completed'

    const opens = row.opens_at ? new Date(row.opens_at).getTime() : null
    const closes = row.closes_at ? new Date(row.closes_at).getTime() : null

    if (opens && now < opens) return 'scheduled'
    if (closes && now > closes) return 'completed'
    return 'active'
  }

  const withBucket = rows.map((row) => ({ ...row, bucket: bucketOf(row) }))

  if (!options.bucket || options.bucket === 'all') return withBucket
  if (options.bucket === 'published') {
    return withBucket.filter((row) => row.status !== 'DRAFT' && row.status !== 'ARCHIVED')
  }
  return withBucket.filter((row) => row.bucket === options.bucket)
}

export type QuestionDetail = {
  id: string
  position: number
  section_id: string | null
  question_type: QuestionType
  prompt: string
  passage: string | null
  marks: number
  negative_marks: number
  allow_partial_credit: boolean
  explanation: string | null
  /** What full marks look like. Read by AI grading, which needs it. */
  rubric: string | null
  difficulty: string | null
  topic: string | null
  learning_objective: string | null
  accepted_answers: string[]
  case_sensitive: boolean
  numeric_answer: number | null
  numeric_tolerance: number | null
  numeric_unit: string | null
  allowed_mime_types: string[]
  max_file_bytes: number | null
  media_path: string | null
  assessment_options: {
    id: string
    position: number
    label: string
    match_label: string | null
    is_correct: boolean
  }[]
}

export type AssessmentDetail = {
  assessment: AssessmentSummary & {
    instructions: string | null
    auto_marking: boolean
    negative_marking: boolean
    shuffle_questions: boolean
    shuffle_options: boolean
    questions_to_serve: number | null
    allow_pause: boolean
    allow_late: boolean
    grace_minutes: number
    late_penalty_percent: number
    attempt_scoring: string
    release_policy: string
    reveal_answers: boolean
    difficulty: string | null
    class_id: string
    section_id: string | null
    subject_id: string | null
    academic_year_id: string
    version: number
  }
  sections: { id: string; position: number; title: string; instructions: string | null }[]
  questions: QuestionDetail[]
}

export async function getAssessment(id: string): Promise<AssessmentDetail | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data: assessment, error } = await supabase
    .from('assessments')
    .select(
      `${SUMMARY}, instructions, auto_marking, negative_marking, shuffle_questions, shuffle_options,
       questions_to_serve, allow_pause, allow_late, grace_minutes, late_penalty_percent,
       attempt_scoring, release_policy, reveal_answers, difficulty,
       class_id, section_id, subject_id, academic_year_id, version`,
    )
    .eq('id', id)
    .eq('teacher_id', session.userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw error
  if (!assessment) return null

  /*
   * The answer key travels to the teacher's own screen and nowhere else.
   * `options_owner_all` admits this select to the owning teacher alone — there
   * is no student policy and no oversight policy on that table.
   */
  const [sections, questions] = await Promise.all([
    supabase
      .from('assessment_sections')
      .select('id, position, title, instructions')
      .eq('assessment_id', id)
      .order('position'),
    supabase
      .from('assessment_questions')
      .select(
        `id, position, section_id, question_type, prompt, passage, marks, negative_marks,
         allow_partial_credit, explanation, rubric, difficulty, topic, learning_objective, accepted_answers,
         case_sensitive, numeric_answer, numeric_tolerance, numeric_unit,
         allowed_mime_types, max_file_bytes, media_path,
         assessment_options ( id, position, label, match_label, is_correct )`,
      )
      .eq('assessment_id', id)
      .order('position'),
  ])

  if (sections.error) throw sections.error
  if (questions.error) throw questions.error

  return {
    assessment: assessment as unknown as AssessmentDetail['assessment'],
    sections: sections.data ?? [],
    questions: (questions.data ?? []) as unknown as QuestionDetail[],
  }
}

// ── Creating and configuring ────────────────────────────────────────────────

export async function createAssessment(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'an assessment belongs to an institution')
    }

    const parsed = assessmentDetailsSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'assessment rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    // Defaults by kind. The engine is identical underneath; an exam simply
    // starts with different sensible answers than a practice paper.
    const defaults = KIND_DEFAULTS[values.kind as AssessmentKind]
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
        duration_minutes: values.duration_minutes ?? defaults.duration_minutes,
        max_attempts: values.max_attempts,
        pass_marks: values.pass_marks ?? null,
        opens_at: values.opens_at ? new Date(values.opens_at).toISOString() : null,
        closes_at: values.closes_at ? new Date(values.closes_at).toISOString() : null,
        difficulty: values.difficulty ?? null,
        release_policy: defaults.release_policy as never,
        negative_marking: defaults.negative_marking,
        // Never born published: it has no questions yet.
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

    await supabase.rpc('write_audit_log', {
      action: 'ASSESSMENT_CREATED',
      entity_type: 'assessment',
      entity_id: data.id,
      metadata: { kind: values.kind } as never,
    })

    revalidatePath('/teacher/assessments')
    return { id: data.id }
  })
}

export async function updateAssessmentDetails(
  assessmentId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })

    const parsed = assessmentDetailsSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'assessment rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    /*
     * Which class a paper is addressed to is fixed once students can see it.
     *
     * The rest of the detail stays editable after publication on purpose —
     * extending a deadline or correcting a typo in the instructions are things
     * a teacher legitimately needs to do mid-flight. Moving the paper to a
     * different class is not: attempts are already running against this one, and
     * `private.receives_content()` would stop matching the students sitting it.
     */
    const { data: current, error: readError } = await supabase
      .from('assessments')
      .select('status, class_id, section_id, academic_year_id')
      .eq('id', assessmentId)
      .eq('teacher_id', session.userId)
      .maybeSingle()

    if (readError) throw readError
    if (!current) throw notFound('assessment not found')

    const movingDelivery =
      current.class_id !== values.class_id ||
      (current.section_id ?? null) !== (values.section_id ?? null) ||
      current.academic_year_id !== values.academic_year_id

    if (current.status !== 'DRAFT' && movingDelivery) {
      throw new AppError('CONFLICT', 'cannot re-target a published paper', {
        publicMessage:
          'This paper is already published, so it cannot be moved to a different class. Take it back to draft first.',
      })
    }

    const { data, error } = await supabase
      .from('assessments')
      .update({
        kind: values.kind,
        title: values.title,
        instructions: values.instructions ?? null,
        class_id: values.class_id,
        section_id: values.section_id ?? null,
        subject_id: values.subject_id ?? null,
        academic_year_id: values.academic_year_id,
        duration_minutes: values.duration_minutes ?? null,
        max_attempts: values.max_attempts,
        pass_marks: values.pass_marks ?? null,
        opens_at: values.opens_at ? new Date(values.opens_at).toISOString() : null,
        closes_at: values.closes_at ? new Date(values.closes_at).toISOString() : null,
        difficulty: values.difficulty ?? null,
      })
      .eq('id', assessmentId)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('assessment not found')

    revalidatePath(`/teacher/assessments/${assessmentId}`)
    return { id: data.id }
  })
}

export async function updateAssessmentSettings(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })

    const parsed = assessmentSettingsSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'settings rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assessments')
      .update({
        auto_marking: values.auto_marking,
        negative_marking: values.negative_marking,
        shuffle_questions: values.shuffle_questions,
        shuffle_options: values.shuffle_options,
        questions_to_serve: values.questions_to_serve ?? null,
        allow_pause: values.allow_pause,
        allow_late: values.allow_late,
        grace_minutes: values.grace_minutes,
        late_penalty_percent: values.late_penalty_percent,
        attempt_scoring: values.attempt_scoring,
        release_policy: values.release_policy,
        reveal_answers: values.reveal_answers,
      })
      .eq('id', values.assessment_id)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('assessment not found')

    revalidatePath(`/teacher/assessments/${values.assessment_id}`)
    return { id: data.id }
  })
}

export async function createSection(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const parsed = sectionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'section rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data: last } = await supabase
      .from('assessment_sections')
      .select('position')
      .eq('assessment_id', parsed.data.assessment_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await supabase
      .from('assessment_sections')
      .insert({
        institution_id: session.institutionId,
        assessment_id: parsed.data.assessment_id,
        position: (last?.position ?? -1) + 1,
        title: parsed.data.title,
        instructions: parsed.data.instructions ?? null,
      })
      .select('id')
      .single()

    if (error) throw error

    revalidatePath(`/teacher/assessments/${parsed.data.assessment_id}`)
    return { id: data.id }
  })
}

// ── Questions ───────────────────────────────────────────────────────────────

/** Refuses to touch a paper students can already see. */
async function assertEditable(assessmentId: string, teacherId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('assessments')
    .select('id, status')
    .eq('id', assessmentId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!data) throw notFound('assessment not found')

  if (data.status !== 'DRAFT') {
    throw new AppError('CONFLICT', `cannot edit a ${data.status} paper`, {
      publicMessage:
        'Take this paper down to draft before changing its questions — students may be sitting it.',
    })
  }

  return data
}

export async function saveQuestion(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const parsed = assessmentQuestionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    await assertEditable(values.assessment_id, session.userId)

    const supabase = await createClient()
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
        section_id: values.section_id ?? null,
        position: (last?.position ?? -1) + 1,
        question_type: values.question_type,
        prompt: values.prompt,
        passage: values.passage ?? null,
        marks: values.marks,
        negative_marks: values.negative_marks,
        allow_partial_credit: values.allow_partial_credit,
        explanation: values.explanation ?? null,
        rubric: values.rubric ?? null,
        difficulty: values.difficulty ?? null,
        topic: values.topic ?? null,
        learning_objective: values.learning_objective ?? null,
        accepted_answers: values.accepted_answers,
        case_sensitive: values.case_sensitive,
        trim_whitespace: values.trim_whitespace,
        numeric_answer: values.numeric_answer ?? null,
        numeric_tolerance: values.numeric_tolerance ?? null,
        numeric_unit: values.numeric_unit ?? null,
        allowed_mime_types: values.allowed_mime_types,
        max_file_bytes: values.max_file_bytes ?? null,
      })
      .select('id')
      .single()

    if (error) throw error

    if (values.options.length > 0) {
      const { error: optionError } = await supabase.from('assessment_options').insert(
        values.options.map((option, index) => ({
          institution_id: session.institutionId!,
          question_id: question.id,
          position: index,
          label: option.label,
          match_label: option.match_label ?? null,
          is_correct: option.is_correct,
        })),
      )

      if (optionError) {
        /*
         * Without its options the question is unanswerable, so it does not
         * stay. PostgREST has no transaction across two statements, so the
         * compensation is explicit — the alternative is a paper with a question
         * nobody can answer.
         */
        await supabase.from('assessment_questions').delete().eq('id', question.id)
        throw optionError
      }
    }

    await supabase.rpc('write_audit_log', {
      action: 'QUESTION_CREATED',
      entity_type: 'assessment_question',
      entity_id: question.id,
      // The prompt and the answer key are deliberately not logged.
      metadata: { question_type: values.question_type, marks: values.marks } as never,
    })

    revalidatePath(`/teacher/assessments/${values.assessment_id}`)
    return { id: question.id }
  })
}

/**
 * Rewrites a question in place.
 *
 * Options are replaced wholesale rather than diffed: they are a small ordered
 * set, and a diff is more code with more ways to leave a stale answer key
 * behind. The question keeps its id and its position, so an edit does not
 * reorder the paper.
 *
 * Refused once the paper leaves DRAFT — `assertEditable` raises — for the same
 * reason adding one is: a student mid-attempt was served this exact question,
 * and a submitted attempt was marked against it.
 */
export async function updateQuestion(
  questionId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const parsed = assessmentQuestionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const values = parsed.data
    await assertEditable(values.assessment_id, session.userId)

    const supabase = await createClient()

    const { data: existing } = await supabase
      .from('assessment_questions')
      .select('id')
      .eq('id', questionId)
      .eq('assessment_id', values.assessment_id)
      .maybeSingle()

    if (!existing) throw notFound('question not found')

    const { error } = await supabase
      .from('assessment_questions')
      .update({
        section_id: values.section_id ?? null,
        question_type: values.question_type,
        prompt: values.prompt,
        passage: values.passage ?? null,
        marks: values.marks,
        negative_marks: values.negative_marks,
        allow_partial_credit: values.allow_partial_credit,
        explanation: values.explanation ?? null,
        rubric: values.rubric ?? null,
        difficulty: values.difficulty ?? null,
        topic: values.topic ?? null,
        learning_objective: values.learning_objective ?? null,
        accepted_answers: values.accepted_answers,
        case_sensitive: values.case_sensitive,
        trim_whitespace: values.trim_whitespace,
        numeric_answer: values.numeric_answer ?? null,
        numeric_tolerance: values.numeric_tolerance ?? null,
        numeric_unit: values.numeric_unit ?? null,
        allowed_mime_types: values.allowed_mime_types,
        max_file_bytes: values.max_file_bytes ?? null,
      })
      .eq('id', questionId)

    if (error) throw error

    // Replaced, not merged: the previous key must not survive a type change.
    await supabase.from('assessment_options').delete().eq('question_id', questionId)

    if (values.options.length > 0) {
      const { error: optionError } = await supabase.from('assessment_options').insert(
        values.options.map((option, index) => ({
          institution_id: session.institutionId!,
          question_id: questionId,
          position: index,
          label: option.label,
          match_label: option.match_label ?? null,
          is_correct: option.is_correct,
        })),
      )
      if (optionError) throw optionError
    }

    await supabase.rpc('write_audit_log', {
      action: 'QUESTION_EDITED',
      entity_type: 'assessment_question',
      entity_id: questionId,
      // The prompt and the answer key are deliberately not logged.
      metadata: { question_type: values.question_type, marks: values.marks } as never,
    })

    revalidatePath(`/teacher/assessments/${values.assessment_id}`)
    return { id: questionId }
  })
}

/** Copies one question within the same paper, placed at the end. */
export async function duplicateQuestion(input: {
  question_id: string
  assessment_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    await assertEditable(input.assessment_id, session.userId)
    const supabase = await createClient()

    const { data: source } = await supabase
      .from('assessment_questions')
      .select('*, assessment_options ( position, label, match_label, is_correct )')
      .eq('id', input.question_id)
      .eq('assessment_id', input.assessment_id)
      .maybeSingle()

    if (!source) throw notFound('question not found')

    const { data: last } = await supabase
      .from('assessment_questions')
      .select('position')
      .eq('assessment_id', input.assessment_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    const record = source as unknown as QuestionDetail & Record<string, unknown>

    const { data: copy, error } = await supabase
      .from('assessment_questions')
      .insert({
        institution_id: session.institutionId,
        assessment_id: input.assessment_id,
        position: (last?.position ?? -1) + 1,
        section_id: record.section_id,
        question_type: record.question_type,
        prompt: `${record.prompt} (copy)`,
        passage: record.passage,
        marks: record.marks,
        negative_marks: record.negative_marks,
        allow_partial_credit: record.allow_partial_credit,
        explanation: record.explanation,
        difficulty: record.difficulty,
        topic: record.topic,
        learning_objective: (record.learning_objective as string | null) ?? null,
        accepted_answers: record.accepted_answers,
        case_sensitive: record.case_sensitive,
        trim_whitespace: (record.trim_whitespace as boolean) ?? true,
        numeric_answer: record.numeric_answer,
        numeric_tolerance: record.numeric_tolerance,
        numeric_unit: record.numeric_unit,
        allowed_mime_types: record.allowed_mime_types,
        max_file_bytes: record.max_file_bytes,
      })
      .select('id')
      .single()

    if (error) throw error

    if (record.assessment_options?.length) {
      await supabase.from('assessment_options').insert(
        record.assessment_options.map((option) => ({
          institution_id: session.institutionId!,
          question_id: copy.id,
          position: option.position,
          label: option.label,
          match_label: option.match_label,
          is_correct: option.is_correct,
        })),
      )
    }

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { id: copy.id }
  })
}

export async function deleteQuestion(input: {
  question_id: string
  assessment_id: string
}): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    await assertEditable(input.assessment_id, session.userId)

    const supabase = await createClient()
    const { error } = await supabase
      .from('assessment_questions')
      .delete()
      .eq('id', input.question_id)

    if (error) throw error

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { removed: true as const }
  })
}

/**
 * Moves a question up or down.
 *
 * Swaps two positions rather than renumbering the paper, because `position` is
 * uniquely indexed per assessment — and a swap through a unique index needs a
 * free slot in between. The temporary negative is that slot.
 */
export async function moveQuestion(input: {
  assessment_id: string
  question_id: string
  direction: 'up' | 'down'
}): Promise<ActionResult<{ moved: boolean }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    await assertEditable(input.assessment_id, session.userId)

    const supabase = await createClient()
    const { data: questions } = await supabase
      .from('assessment_questions')
      .select('id, position')
      .eq('assessment_id', input.assessment_id)
      .order('position')

    const ordered = questions ?? []
    const index = ordered.findIndex((question) => question.id === input.question_id)
    const target = input.direction === 'up' ? index - 1 : index + 1

    if (index === -1 || target < 0 || target >= ordered.length) {
      return { moved: false }
    }

    const a = ordered[index]
    const b = ordered[target]

    await supabase.from('assessment_questions').update({ position: -1 }).eq('id', a.id)
    await supabase.from('assessment_questions').update({ position: a.position }).eq('id', b.id)
    await supabase.from('assessment_questions').update({ position: b.position }).eq('id', a.id)

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { moved: true }
  })
}

// ── Publishing ──────────────────────────────────────────────────────────────

export type PublishCheck = { ok: boolean; label: string; detail?: string }

/**
 * What must be true before a paper goes to a class.
 *
 * Read-only and callable at any time, so the builder can show the same list the
 * publish button enforces. A teacher should never press publish and be told no
 * without having been able to see why beforehand.
 */
export async function validateForPublish(assessmentId: string): Promise<PublishCheck[]> {
  const found = await getAssessment(assessmentId)
  if (!found) return [{ ok: false, label: 'The paper could not be read' }]

  const { assessment, questions } = found
  const checks: PublishCheck[] = []

  checks.push({
    ok: questions.length > 0,
    label: 'Has at least one question',
    detail: `${questions.length} question${questions.length === 1 ? '' : 's'}`,
  })

  const total = questions.reduce((sum, question) => sum + Number(question.marks), 0)
  checks.push({
    ok: total > 0,
    label: 'Marks are configured',
    detail: `${total} marks in total`,
  })

  /*
   * Every question that claims to be auto-marked must actually have something
   * to mark against. A multiple-choice question with no correct option, or a
   * numerical one with no value, would silently mark every student wrong.
   */
  const unanswerable = questions.filter((question) => {
    if (MANUAL_ONLY_TYPES.includes(question.question_type)) return false
    if (question.question_type === 'SHORT_ANSWER') return false
    if (question.question_type === 'NUMERICAL') return question.numeric_answer === null
    if (question.question_type === 'FILL_BLANK') return question.accepted_answers.length === 0
    if (question.question_type === 'ORDERING') return question.assessment_options.length < 2
    if (question.question_type === 'MATCHING') {
      return question.assessment_options.some((option) => !option.match_label)
    }
    if (OPTION_TYPES.includes(question.question_type)) {
      return !question.assessment_options.some((option) => option.is_correct)
    }
    return false
  })

  checks.push({
    ok: unanswerable.length === 0,
    label: 'Every auto-marked question has an answer key',
    detail:
      unanswerable.length > 0
        ? `${unanswerable.length} question${unanswerable.length === 1 ? '' : 's'} cannot be marked`
        : undefined,
  })

  checks.push({
    ok: assessment.duration_minutes === null || assessment.duration_minutes > 0,
    label: 'Duration is valid',
    detail: assessment.duration_minutes ? `${assessment.duration_minutes} minutes` : 'No time limit',
  })

  checks.push({ ok: Boolean(assessment.class_id), label: 'A class is selected' })

  checks.push({
    ok: assessment.pass_marks === null || Number(assessment.pass_marks) <= total,
    label: 'Passing marks are achievable',
    detail:
      assessment.pass_marks !== null
        ? `${assessment.pass_marks} of ${total}`
        : 'No pass mark set',
  })

  checks.push({
    ok:
      assessment.questions_to_serve === null ||
      assessment.questions_to_serve <= questions.length,
    label: 'The question pool is large enough',
    detail: assessment.questions_to_serve
      ? `serving ${assessment.questions_to_serve} of ${questions.length}`
      : 'serving every question',
  })

  checks.push({
    ok:
      !assessment.opens_at ||
      !assessment.closes_at ||
      new Date(assessment.closes_at) > new Date(assessment.opens_at),
    label: 'The availability window is coherent',
  })

  return checks
}

export async function publishAssessment(input: {
  assessment_id: string
}): Promise<ActionResult<{ status: string; notified: number }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const checks = await validateForPublish(input.assessment_id)
    const failed = checks.filter((check) => !check.ok)

    if (failed.length > 0) {
      throw new AppError('VALIDATION', 'assessment is not ready to publish', {
        publicMessage: `Not ready yet: ${failed.map((check) => check.label.toLowerCase()).join('; ')}.`,
        fieldErrors: { publish: failed.map((check) => check.label) },
      })
    }

    const found = await getAssessment(input.assessment_id)
    if (!found) throw notFound('assessment not found')

    const supabase = await createClient()

    // Scheduled if it opens in the future; otherwise available now.
    const opensLater =
      found.assessment.opens_at && new Date(found.assessment.opens_at) > new Date()

    const total = found.questions.reduce((sum, question) => sum + Number(question.marks), 0)

    const { data, error } = await supabase
      .from('assessments')
      .update({
        status: opensLater ? 'SCHEDULED' : 'PUBLISHED',
        total_marks: total,
      })
      .eq('id', input.assessment_id)
      .eq('teacher_id', session.userId)
      .select('status')
      .maybeSingle()

    if (error) {
      if (error.code === '23514') {
        throw new AppError('CONFLICT', error.message, { publicMessage: error.message })
      }
      throw error
    }
    if (!data) throw notFound('assessment not found')

    const notified = await notifyClass(found.assessment, session.institutionId)

    await supabase.rpc('write_audit_log', {
      action: 'ASSESSMENT_PUBLISHED',
      entity_type: 'assessment',
      entity_id: input.assessment_id,
      metadata: { status: data.status, questions: found.questions.length, notified } as never,
    })

    revalidatePath('/teacher/assessments')
    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { status: data.status, notified }
  })
}

/**
 * Tells the class a paper is waiting.
 *
 * One notification per student, at publication only — never on autosave, never
 * on an edit. Uses the platform's own notification table, so it appears
 * wherever notifications appear rather than in a parallel system.
 *
 * Two clients, deliberately.
 *
 * The recipients are read through the *teacher's* client, so RLS decides which
 * enrolments they may see — `enrollments_select` admits a teacher only to
 * classes they actually teach. That read is the security boundary.
 *
 * The insert is done with the service role. `notifications_broadcast` requires
 * `notification.broadcast`, which a teacher does not hold and should not: that
 * permission allows notifying *anyone* in the institution, not just a class.
 * The alternative to this split would be granting every teacher a general
 * broadcast power in order to let them tell their own class about a test.
 */
async function notifyClass(
  assessment: AssessmentDetail['assessment'],
  institutionId: string,
): Promise<number> {
  const supabase = await createClient()

  const { data: enrolled } = await supabase
    .from('student_enrollments')
    .select('student_id, section_id')
    .eq('institution_id', institutionId)
    .eq('class_id', assessment.class_id)
    .eq('status', 'ACTIVE')

  const recipients = (enrolled ?? []).filter(
    (row) => !assessment.section_id || row.section_id === assessment.section_id,
  )

  if (recipients.length === 0) return 0

  const when = (value: string | null) =>
    value
      ? new Date(value).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

  const due = when(assessment.closes_at)

  /*
   * A paper published with a future opening date is announced now and sat
   * later. Telling a student only when it closes leaves them to guess whether
   * they can start — so the opening time is named whenever it has not passed.
   */
  const opens =
    assessment.opens_at && new Date(assessment.opens_at).getTime() > Date.now()
      ? when(assessment.opens_at)
      : null

  const { error } = await createAdminClient().from('notifications').insert(
    recipients.map((row) => ({
      user_id: row.student_id,
      institution_id: institutionId,
      category: assessment.kind === 'ASSIGNMENT' ? ('ASSIGNMENT' as const) : ('EXAM' as const),
      priority: 'NORMAL' as const,
      title: `New ${assessment.kind.toLowerCase()}: ${assessment.title}`,
      body: [
        opens ? `Opens ${opens}.` : null,
        due ? `Closes ${due}.` : null,
        assessment.duration_minutes ? `${assessment.duration_minutes} minutes.` : null,
        `${assessment.max_attempts} attempt${assessment.max_attempts === 1 ? '' : 's'}.`,
      ]
        .filter(Boolean)
        .join(' '),
      deep_link: '/student/assessments',
    })),
  )

  // A failed notification must not fail a publication that has committed.
  if (error) {
    console.warn('[afi:assessment] could not notify the class', error.message)
    return 0
  }

  return recipients.length
}

export async function setAssessmentStatus(input: {
  assessment_id: string
  status: string
}): Promise<ActionResult<{ status: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('assessments')
      .update({ status: input.status as never })
      .eq('id', input.assessment_id)
      .eq('teacher_id', session.userId)
      .select('status')
      .maybeSingle()

    if (error) {
      // 23514 is the state machine refusing, which is a message worth showing.
      if (error.code === '23514') {
        throw new AppError('CONFLICT', error.message, { publicMessage: error.message })
      }
      throw error
    }
    if (!data) throw notFound('assessment not found')

    await supabase.rpc('write_audit_log', {
      action: `ASSESSMENT_${input.status}`,
      entity_type: 'assessment',
      entity_id: input.assessment_id,
      metadata: {} as never,
    })

    revalidatePath('/teacher/assessments')
    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { status: data.status }
  })
}

/**
 * Copies a paper into a new draft.
 *
 * The original is untouched — including any attempts against it. Questions and
 * their options are copied rather than referenced, for the same reason bank
 * questions are: a duplicate that shared rows with its source would change when
 * the source changed.
 */
export async function duplicateAssessment(input: {
  assessment_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const found = await getAssessment(input.assessment_id)
    if (!found) throw notFound('assessment not found')

    const supabase = await createClient()
    const source = found.assessment

    const { data: copy, error } = await supabase
      .from('assessments')
      .insert({
        institution_id: session.institutionId,
        teacher_id: session.userId,
        class_id: source.class_id,
        section_id: source.section_id,
        subject_id: source.subject_id,
        academic_year_id: source.academic_year_id,
        kind: source.kind as never,
        title: `${source.title} (copy)`,
        instructions: source.instructions,
        duration_minutes: source.duration_minutes,
        max_attempts: source.max_attempts,
        pass_marks: source.pass_marks,
        auto_marking: source.auto_marking,
        negative_marking: source.negative_marking,
        shuffle_questions: source.shuffle_questions,
        shuffle_options: source.shuffle_options,
        questions_to_serve: source.questions_to_serve,
        allow_pause: source.allow_pause,
        allow_late: source.allow_late,
        grace_minutes: source.grace_minutes,
        late_penalty_percent: source.late_penalty_percent,
        attempt_scoring: source.attempt_scoring as never,
        release_policy: source.release_policy as never,
        reveal_answers: source.reveal_answers,
        difficulty: source.difficulty,
        status: 'DRAFT',
      })
      .select('id')
      .single()

    if (error) throw error

    for (const question of found.questions) {
      const { data: newQuestion, error: questionError } = await supabase
        .from('assessment_questions')
        .insert({
          institution_id: session.institutionId,
          assessment_id: copy.id,
          position: question.position,
          question_type: question.question_type,
          prompt: question.prompt,
          passage: question.passage,
          marks: question.marks,
          negative_marks: question.negative_marks,
          allow_partial_credit: question.allow_partial_credit,
          explanation: question.explanation,
          difficulty: question.difficulty,
          topic: question.topic,
          accepted_answers: question.accepted_answers,
          case_sensitive: question.case_sensitive,
          numeric_answer: question.numeric_answer,
          numeric_tolerance: question.numeric_tolerance,
          numeric_unit: question.numeric_unit,
          allowed_mime_types: question.allowed_mime_types,
          max_file_bytes: question.max_file_bytes,
        })
        .select('id')
        .single()

      if (questionError) throw questionError

      if (question.assessment_options.length > 0) {
        await supabase.from('assessment_options').insert(
          question.assessment_options.map((option) => ({
            institution_id: session.institutionId!,
            question_id: newQuestion.id,
            position: option.position,
            label: option.label,
            match_label: option.match_label,
            is_correct: option.is_correct,
          })),
        )
      }
    }

    revalidatePath('/teacher/assessments')
    return { id: copy.id }
  })
}

/** The question types the engine marks by itself, for the builder to show. */
export async function getAutoMarkedTypes(): Promise<readonly QuestionType[]> {
  return AUTO_MARKED_TYPES
}


// ── Question images ─────────────────────────────────────────────────────────

/**
 * Mints a one-object signed upload URL for a question's image.
 *
 * The path is fixed here, under the institution's own prefix, so the URL cannot
 * be pointed anywhere else. `teacher_set_question_media` re-checks ownership and
 * the prefix when the path is recorded — this only signs.
 */
export async function requestQuestionMediaUpload(input: {
  question_id: string
  file_name: string
}): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    // Readable only if the paper is this teacher's, which is the check that
    // decides whether they may attach anything to it.
    const { data: question } = await supabase
      .from('assessment_questions')
      .select('id, assessment_id')
      .eq('id', input.question_id)
      .maybeSingle()

    if (!question) throw notFound('question not found')

    const extension = input.file_name.includes('.')
      ? input.file_name.split('.').pop()!.toLowerCase()
      : 'png'
    const safe = /^(png|jpg|jpeg|webp|gif)$/.test(extension) ? extension : 'png'
    const path = `${session.institutionId}/questions/${randomBytes(16).toString('hex')}.${safe}`

    const { data: signed, error } = await createAdminClient()
      .storage.from('learning-materials')
      .createSignedUploadUrl(path)

    if (error || !signed) {
      throw new AppError('STORAGE', error?.message ?? 'could not prepare the upload')
    }

    return { uploadUrl: signed.signedUrl, path }
  })
}

export async function setQuestionMedia(input: {
  question_id: string
  assessment_id: string
  path: string | null
  mime_type: string | null
}): Promise<ActionResult<{ saved: true }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { error } = await supabase.rpc('teacher_set_question_media', {
      target_question_id: input.question_id,
      path: input.path,
      content_type: input.mime_type,
    })

    if (error) throw error

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { saved: true as const }
  })
}

/**
 * A short-lived link to a question's image.
 *
 * The path comes from `assessment_question_media()`, which returns one only to
 * the owning teacher or to a student holding a live attempt that was served the
 * question. The bucket is private and the URL expires in ten minutes.
 */
export async function getQuestionMediaUrl(
  questionId: string,
): Promise<ActionResult<{ url: string | null }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    const { data: path, error } = await supabase.rpc('assessment_question_media', {
      target_question_id: questionId,
    })

    if (error) throw error
    if (!path) return { url: null }

    const { data: signed, error: signError } = await createAdminClient()
      .storage.from('learning-materials')
      .createSignedUrl(path as unknown as string, 600)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the image')
    }

    return { url: signed.signedUrl }
  })
}
