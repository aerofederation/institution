'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import {
  assessmentQuestionSchema,
  bankFilterSchema,
  bankQuestionSchema,
} from '@/lib/validation/assessment'

/**
 * The question bank.
 *
 * The rule that makes it safe to reuse a question is that adding one to a paper
 * **copies** it. `assessment_questions.source_bank_id` records where it came
 * from and nothing else — there is no live link, so editing a bank question can
 * never alter a paper that students have already sat, or one they are sitting
 * now.
 *
 * That is a deliberate trade: correcting a typo in the bank does not propagate.
 * The alternative is a published assessment changing underneath a class, which
 * is far worse than retyping a fix.
 *
 * Filtering and pagination are done in the database. A teacher with two thousand
 * questions should not ship two thousand rows to a browser to find four.
 */

const PAGE_SIZE = 20

export type BankItem = {
  id: string
  question_type: string
  prompt: string
  marks: number
  negative_marks: number
  difficulty: string | null
  topic: string | null
  learning_objective: string | null
  tags: string[]
  times_used: number
  created_at: string
  subjects: { name: string } | null
  question_bank_options: { id: string; position: number; label: string; match_label: string | null; is_correct: boolean }[]
}

export async function listBankItems(input: unknown): Promise<{
  rows: BankItem[]
  total: number
  page: number
  pageSize: number
}> {
  const session = await requireTenant()

  const parsed = bankFilterSchema.safeParse(input ?? {})
  const filters = parsed.success ? parsed.data : { page: 1 as const }

  const supabase = await createClient()
  const page = Math.max(1, filters.page ?? 1)
  const from = (page - 1) * PAGE_SIZE

  let query = supabase
    .from('question_bank_items')
    .select(
      `id, question_type, prompt, marks, negative_marks, difficulty, topic,
       learning_objective, tags, times_used, created_at,
       subjects ( name ),
       question_bank_options ( id, position, label, match_label, is_correct )`,
      { count: 'exact' },
    )
    // Redundant against `bank_items_select`, and kept: if that policy were ever
    // loosened this query would still return only this teacher's own questions.
    .eq('teacher_id', session.userId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1)

  if ('q' in filters && filters.q) query = query.ilike('prompt', `%${filters.q}%`)
  if ('subject_id' in filters && filters.subject_id) {
    query = query.eq('subject_id', filters.subject_id)
  }
  if ('question_type' in filters && filters.question_type) {
    query = query.eq('question_type', filters.question_type as never)
  }
  if ('difficulty' in filters && filters.difficulty) {
    query = query.eq('difficulty', filters.difficulty)
  }
  if ('topic' in filters && filters.topic) query = query.ilike('topic', `%${filters.topic}%`)

  const { data, error, count } = await query
  if (error) throw error

  return {
    rows: (data ?? []) as unknown as BankItem[],
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
  }
}

/**
 * Saves a question to the bank.
 *
 * Validated against the same schema an assessment question uses, so a question
 * that is unusable in a paper cannot be stored as if it were fine. The bank's
 * own fields — subject, tags — are validated separately and merged.
 */
export async function saveBankItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const payload = (input ?? {}) as Record<string, unknown>

    /*
     * `assessmentQuestionSchema` requires an `assessment_id`, which a bank
     * question has no business carrying. A placeholder satisfies the shape so
     * every marking rule is still checked, and it is discarded below.
     */
    const asQuestion = assessmentQuestionSchema.safeParse({
      ...payload,
      assessment_id: '00000000-0000-4000-8000-000000000000',
    })

    if (!asQuestion.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(asQuestion.error),
      })
    }

    const asBank = bankQuestionSchema.safeParse(payload)
    if (!asBank.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(asBank.error),
      })
    }

    const values = asQuestion.data
    const supabase = await createClient()

    const { data: item, error } = await supabase
      .from('question_bank_items')
      .insert({
        institution_id: session.institutionId,
        teacher_id: session.userId,
        subject_id: asBank.data.subject_id ?? null,
        question_type: values.question_type,
        prompt: values.prompt,
        passage: values.passage ?? null,
        marks: values.marks,
        negative_marks: values.negative_marks,
        allow_partial_credit: values.allow_partial_credit,
        explanation: values.explanation ?? null,
        rubric: values.rubric ?? null,
        accepted_answers: values.accepted_answers,
        case_sensitive: values.case_sensitive,
        trim_whitespace: values.trim_whitespace,
        numeric_answer: values.numeric_answer ?? null,
        numeric_tolerance: values.numeric_tolerance ?? null,
        numeric_unit: values.numeric_unit ?? null,
        allowed_mime_types: values.allowed_mime_types,
        max_file_bytes: values.max_file_bytes ?? null,
        difficulty: values.difficulty ?? null,
        topic: values.topic ?? null,
        learning_objective: values.learning_objective ?? null,
        tags: asBank.data.tags,
      })
      .select('id')
      .single()

    if (error) throw error

    if (values.options.length > 0) {
      const { error: optionError } = await supabase.from('question_bank_options').insert(
        values.options.map((option, index) => ({
          institution_id: session.institutionId!,
          bank_item_id: item.id,
          position: index,
          label: option.label,
          match_label: option.match_label ?? null,
          is_correct: option.is_correct,
        })),
      )

      if (optionError) {
        await supabase.from('question_bank_items').delete().eq('id', item.id)
        throw optionError
      }
    }

    revalidatePath('/teacher/question-bank')
    return { id: item.id }
  })
}

/**
 * Rewrites a bank question.
 *
 * This never reaches an assessment. Adding a bank question to a paper copies
 * it, so editing here changes what future papers will get and nothing that has
 * already been set — which is the property that makes the bank safe to reuse.
 */
export async function updateBankItem(
  itemId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const payload = (input ?? {}) as Record<string, unknown>

    // Validated against the same rules an assessment question obeys, so a
    // question that could not be answered cannot be stored as though it could.
    const asQuestion = assessmentQuestionSchema.safeParse({
      ...payload,
      assessment_id: '00000000-0000-4000-8000-000000000000',
    })
    if (!asQuestion.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(asQuestion.error),
      })
    }

    const asBank = bankQuestionSchema.safeParse(payload)
    if (!asBank.success) {
      throw new AppError('VALIDATION', 'question rejected', {
        fieldErrors: toFieldErrors(asBank.error),
      })
    }

    const values = asQuestion.data
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('question_bank_items')
      .update({
        subject_id: asBank.data.subject_id ?? null,
        question_type: values.question_type,
        prompt: values.prompt,
        passage: values.passage ?? null,
        marks: values.marks,
        negative_marks: values.negative_marks,
        allow_partial_credit: values.allow_partial_credit,
        explanation: values.explanation ?? null,
        rubric: values.rubric ?? null,
        accepted_answers: values.accepted_answers,
        case_sensitive: values.case_sensitive,
        trim_whitespace: values.trim_whitespace,
        numeric_answer: values.numeric_answer ?? null,
        numeric_tolerance: values.numeric_tolerance ?? null,
        numeric_unit: values.numeric_unit ?? null,
        allowed_mime_types: values.allowed_mime_types,
        max_file_bytes: values.max_file_bytes ?? null,
        difficulty: values.difficulty ?? null,
        topic: values.topic ?? null,
        learning_objective: values.learning_objective ?? null,
        tags: asBank.data.tags,
      })
      .eq('id', itemId)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('question not found')

    // Options replaced wholesale, so a type change cannot leave a stale key.
    await supabase.from('question_bank_options').delete().eq('bank_item_id', itemId)

    if (values.options.length > 0) {
      const { error: optionError } = await supabase.from('question_bank_options').insert(
        values.options.map((option, index) => ({
          institution_id: session.institutionId!,
          bank_item_id: itemId,
          position: index,
          label: option.label,
          match_label: option.match_label ?? null,
          is_correct: option.is_correct,
        })),
      )
      if (optionError) throw optionError
    }

    revalidatePath('/teacher/question-bank')
    return { id: itemId }
  })
}

export async function archiveBankItem(input: {
  item_id: string
}): Promise<ActionResult<{ archived: true }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    // Archived, not deleted: papers built from it keep their provenance.
    const { data, error } = await supabase
      .from('question_bank_items')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', input.item_id)
      .eq('teacher_id', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('question not found')

    revalidatePath('/teacher/question-bank')
    return { archived: true as const }
  })
}

export async function duplicateBankItem(input: {
  item_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()
    const { data: source } = await supabase
      .from('question_bank_items')
      .select('*, question_bank_options ( position, label, match_label, is_correct )')
      .eq('id', input.item_id)
      .eq('teacher_id', session.userId)
      .maybeSingle()

    if (!source) throw notFound('question not found')

    /*
     * Copied field by field rather than spread.
     *
     * A spread would carry `id`, `created_at` and anything a later migration
     * adds straight into the insert — including columns that must not be
     * inherited. Naming them is longer and cannot silently acquire a field.
     */
    const record = source as unknown as BankItem & Record<string, unknown> & {
      question_bank_options: {
        position: number
        label: string
        match_label: string | null
        is_correct: boolean
      }[]
    }
    const options = record.question_bank_options ?? []

    const { data: copy, error } = await supabase
      .from('question_bank_items')
      .insert({
        institution_id: session.institutionId,
        teacher_id: session.userId,
        subject_id: (record.subject_id as string | null) ?? null,
        question_type: record.question_type as never,
        prompt: `${record.prompt} (copy)`,
        passage: (record.passage as string | null) ?? null,
        marks: record.marks,
        negative_marks: record.negative_marks,
        allow_partial_credit: record.allow_partial_credit as boolean,
        explanation: (record.explanation as string | null) ?? null,
        rubric: (record.rubric as string | null) ?? null,
        accepted_answers: (record.accepted_answers as string[]) ?? [],
        case_sensitive: record.case_sensitive as boolean,
        trim_whitespace: record.trim_whitespace as boolean,
        numeric_answer: (record.numeric_answer as number | null) ?? null,
        numeric_tolerance: (record.numeric_tolerance as number | null) ?? null,
        numeric_unit: (record.numeric_unit as string | null) ?? null,
        allowed_mime_types: (record.allowed_mime_types as string[]) ?? [],
        max_file_bytes: (record.max_file_bytes as number | null) ?? null,
        difficulty: record.difficulty,
        topic: record.topic,
        learning_objective: record.learning_objective,
        tags: record.tags ?? [],
        times_used: 0,
      })
      .select('id')
      .single()

    if (error) throw error

    if (options?.length) {
      await supabase.from('question_bank_options').insert(
        options.map((option) => ({
          institution_id: session.institutionId!,
          bank_item_id: copy.id,
          position: option.position,
          label: option.label,
          match_label: option.match_label,
          is_correct: option.is_correct,
        })),
      )
    }

    revalidatePath('/teacher/question-bank')
    return { id: copy.id }
  })
}

/**
 * Copies bank questions into a paper.
 *
 * A copy, not a reference — see the note at the top of this file. `times_used`
 * is incremented so the bank can show which questions earn their keep.
 */
export async function addBankItemsToAssessment(input: {
  assessment_id: string
  item_ids: string[]
}): Promise<ActionResult<{ added: number }>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    const { data: assessment } = await supabase
      .from('assessments')
      .select('id, status')
      .eq('id', input.assessment_id)
      .eq('teacher_id', session.userId)
      .maybeSingle()

    if (!assessment) throw notFound('assessment not found')
    if (assessment.status !== 'DRAFT') {
      throw new AppError('CONFLICT', 'paper is not editable', {
        publicMessage: 'Take this paper back to draft before adding questions.',
      })
    }

    const { data: items } = await supabase
      .from('question_bank_items')
      .select('*, question_bank_options ( position, label, match_label, is_correct )')
      .in('id', input.item_ids)
      .eq('teacher_id', session.userId)

    if (!items?.length) return { added: 0 }

    const { data: last } = await supabase
      .from('assessment_questions')
      .select('position')
      .eq('assessment_id', input.assessment_id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    let position = (last?.position ?? -1) + 1
    let added = 0

    for (const item of items) {
      const source = item as unknown as BankItem & Record<string, unknown>

      const { data: question, error } = await supabase
        .from('assessment_questions')
        .insert({
          institution_id: session.institutionId,
          assessment_id: input.assessment_id,
          position: position++,
          question_type: source.question_type as never,
          prompt: source.prompt,
          passage: (source.passage as string | null) ?? null,
          marks: source.marks,
          negative_marks: source.negative_marks,
          allow_partial_credit: source.allow_partial_credit as boolean,
          explanation: (source.explanation as string | null) ?? null,
          rubric: (source.rubric as string | null) ?? null,
          accepted_answers: (source.accepted_answers as string[]) ?? [],
          case_sensitive: source.case_sensitive as boolean,
          trim_whitespace: source.trim_whitespace as boolean,
          numeric_answer: (source.numeric_answer as number | null) ?? null,
          numeric_tolerance: (source.numeric_tolerance as number | null) ?? null,
          numeric_unit: (source.numeric_unit as string | null) ?? null,
          allowed_mime_types: (source.allowed_mime_types as string[]) ?? [],
          max_file_bytes: (source.max_file_bytes as number | null) ?? null,
          difficulty: source.difficulty,
          topic: source.topic,
          learning_objective: source.learning_objective,
          // Provenance only. Nothing reads this to resolve content.
          source_bank_id: source.id,
        })
        .select('id')
        .single()

      if (error) throw error

      const options = source.question_bank_options ?? []
      if (options.length > 0) {
        await supabase.from('assessment_options').insert(
          options.map((option) => ({
            institution_id: session.institutionId!,
            question_id: question.id,
            position: option.position,
            label: option.label,
            match_label: option.match_label,
            is_correct: option.is_correct,
          })),
        )
      }

      await supabase
        .from('question_bank_items')
        .update({ times_used: Number(source.times_used ?? 0) + 1 })
        .eq('id', source.id)

      added += 1
    }

    revalidatePath(`/teacher/assessments/${input.assessment_id}`)
    return { added }
  })
}
