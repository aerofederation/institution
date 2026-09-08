'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { checkGradingResponse } from '@/lib/ai/guardrails/grading'
import { GRADING_SCHEMA, GRADING_SYSTEM, gradingMessage } from '@/lib/ai/prompts/grading'
import { aiClient, modelFor } from '@/lib/ai/provider/client'
import { recordUsage } from '@/lib/ai/usage/record'

/**
 * AI-assisted grading.
 *
 * What this does: reads one answer, asks a model to judge it against the
 * teacher's rubric, and stores the reply as a suggestion.
 *
 * What it does not do, at any point: write a mark. `assessment_answers` is not
 * touched here. The teacher accepts a suggestion by calling the ordinary
 * grading path, which is the same code that runs when there is no AI involved.
 * A suggestion nobody accepts changes nothing about the result.
 *
 * The model is asked only where a rubric exists. Grading free text against an
 * unstated standard is the failure mode that makes AI marking untrustworthy —
 * it produces confident marks against a rubric the teacher never wrote, and the
 * teacher has no way to tell that is what happened.
 */

export type Suggestion = {
  id: string
  suggested_marks: number
  rationale: string
  rubric_points: string[]
  confidence: string | null
  model: string
  accepted_at: string | null
  created_at: string
}

export async function listSuggestions(answerId: string): Promise<Suggestion[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('ai_grade_suggestions')
    .select('id, suggested_marks, rationale, rubric_points, confidence, model, accepted_at, created_at')
    .eq('answer_id', answerId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as Suggestion[]
}

export type SuggestionResult = {
  id: string
  suggestedMarks: number
  rationale: string
  pointsMet: string[]
  pointsMissed: string[]
  confidence: string
  clamped: boolean
  model: string
}

export async function suggestMark(input: {
  answer_id: string
  assessment_id: string
}): Promise<ActionResult<SuggestionResult>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.manage' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    /*
     * Read through the teacher's own client. If RLS will not return the answer,
     * it is not theirs to grade — and `answers_select` admits a teacher only to
     * answers on a paper they own.
     */
    const { data: answer, error } = await supabase
      .from('assessment_answers')
      .select(
        `id, text_answer, marks_awarded, is_correct,
         assessment_questions ( id, prompt, passage, marks, rubric, question_type )`,
      )
      .eq('id', input.answer_id)
      .maybeSingle()

    if (error) throw error
    if (!answer) throw notFound('answer not found')

    const question = answer.assessment_questions as unknown as {
      prompt: string
      passage: string | null
      marks: number
      rubric: string | null
      question_type: string
    } | null

    if (!question) throw notFound('question not found')

    if (!question.rubric?.trim()) {
      throw new AppError('VALIDATION', 'no rubric on this question', {
        publicMessage:
          'Add a rubric to this question first. Without one there is no standard to mark against, and a suggestion would be the model inventing its own.',
      })
    }

    const submitted = answer.text_answer?.trim()
    if (!submitted) {
      throw new AppError('VALIDATION', 'nothing to mark', {
        publicMessage: 'This answer is empty, so there is nothing to assess.',
      })
    }

    const model = modelFor('reasoning')
    const maxMarks = Number(question.marks)

    let inputTokens = 0
    let outputTokens = 0

    try {
      const response = await aiClient().messages.create({
        model,
        max_tokens: 4000,
        system: GRADING_SYSTEM,
        // Marking to a rubric is exactly the kind of judgement that benefits
        // from the model reasoning before it answers.
        thinking: { type: 'adaptive' },
        output_config: {
          effort: 'high',
          format: { type: 'json_schema', schema: GRADING_SCHEMA },
        },
        messages: [
          {
            role: 'user',
            content: gradingMessage({
              questionPrompt: question.prompt,
              rubric: question.rubric,
              maxMarks,
              studentAnswer: submitted,
              passage: question.passage,
            }),
          },
        ],
      })

      inputTokens = response.usage.input_tokens
      outputTokens = response.usage.output_tokens

      /*
       * A safety decline is a legitimate outcome, not a crash. The teacher is
       * told plainly and marks it themselves.
       */
      if (response.stop_reason === 'refusal') {
        await recordUsage({
          institutionId: session.institutionId,
          actorId: session.userId,
          feature: 'grading.suggest',
          model,
          inputTokens,
          outputTokens,
          succeeded: false,
          errorCode: 'refusal',
        })

        throw new AppError('VALIDATION', 'model declined', {
          publicMessage:
            'The model declined to assess this answer. Mark it yourself — nothing has been recorded.',
        })
      }

      const text = response.content.find((block) => block.type === 'text')
      if (!text || text.type !== 'text') {
        throw new AppError('INTERNAL', 'no text block in the model response')
      }

      const checked = checkGradingResponse(JSON.parse(text.text), maxMarks)

      const { data: stored, error: storeError } = await supabase
        .from('ai_grade_suggestions')
        .insert({
          institution_id: session.institutionId,
          answer_id: input.answer_id,
          model,
          suggested_marks: checked.suggested_marks,
          rationale: checked.rationale,
          // Both lists are kept, tagged, so the teacher sees the reasoning on
          // each side rather than only what the model liked.
          rubric_points: [
            ...checked.rubric_points_met.map((point) => `MET: ${point}`),
            ...checked.rubric_points_missed.map((point) => `MISSED: ${point}`),
          ],
          confidence: checked.confidence,
          requested_by: session.userId,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        })
        .select('id')
        .single()

      if (storeError) throw storeError

      await recordUsage({
        institutionId: session.institutionId,
        actorId: session.userId,
        feature: 'grading.suggest',
        model,
        inputTokens,
        outputTokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        succeeded: true,
      })

      await supabase.rpc('write_audit_log', {
        action: 'AI_GRADE_SUGGESTED',
        entity_type: 'assessment_answer',
        entity_id: input.answer_id,
        // The rationale is not logged: it quotes the student's work.
        metadata: { model, suggested_marks: checked.suggested_marks } as never,
      })

      revalidatePath(`/teacher/assessments/${input.assessment_id}/grading`)

      return {
        id: stored.id,
        suggestedMarks: checked.suggested_marks,
        rationale: checked.rationale,
        pointsMet: checked.rubric_points_met,
        pointsMissed: checked.rubric_points_missed,
        confidence: checked.confidence,
        clamped: checked.clamped,
        model,
      }
    } catch (thrown) {
      if (thrown instanceof AppError) throw thrown

      await recordUsage({
        institutionId: session.institutionId,
        actorId: session.userId,
        feature: 'grading.suggest',
        model,
        inputTokens,
        outputTokens,
        succeeded: false,
        /*
         * The SDK's error classes leave `name` as "Error", so the constructor
         * name is what actually distinguishes a rate limit from a bad request
         * when somebody later reads this column.
         */
        errorCode:
          thrown instanceof Error ? (thrown.constructor?.name ?? thrown.name) : 'unknown',
      })

      // The provider's message may carry request detail; the teacher gets a
      // sentence they can act on and the rest stays in the server log.
      console.error('[afi:ai] grading suggestion failed', thrown)

      /*
       * Two provider failures deserve their own message, because the remedy is
       * an administrator's rather than the teacher's. "Could not be reached"
       * would send a teacher to check their connection when the account is out
       * of credit or the key has been revoked.
       */
      const detail = thrown instanceof Error ? thrown.message : ''

      if (/credit balance|billing|quota|payment/i.test(detail)) {
        throw new AppError('CONFIGURATION', 'ai account has no credit', {
          publicMessage:
            'The grading assistant is unavailable: this institution’s AI account has no remaining credit. Mark this answer yourself and ask your administrator to top it up.',
        })
      }

      if (/authentication|invalid.*api.?key|401/i.test(detail)) {
        throw new AppError('CONFIGURATION', 'ai credentials rejected', {
          publicMessage:
            'The grading assistant is not configured correctly — its credentials were rejected. Mark this answer yourself and tell your administrator.',
        })
      }

      throw new AppError('INTERNAL', 'ai grading failed', {
        publicMessage:
          'The grading assistant could not be reached. Mark this answer yourself — nothing has been recorded.',
      })
    }
  })
}

/**
 * Notes that a teacher acted on a suggestion.
 *
 * Called *after* the mark has been awarded through the ordinary path, so this
 * records agreement rather than causing it. The mark exists because a person
 * submitted it either way.
 */
export async function noteSuggestionAccepted(input: {
  suggestion_id: string
  marks: number
}): Promise<ActionResult<{ noted: true }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.manage' })
    const supabase = await createClient()

    const { error } = await supabase
      .from('ai_grade_suggestions')
      .update({ accepted_at: new Date().toISOString(), accepted_marks: input.marks })
      .eq('id', input.suggestion_id)

    if (error) throw error
    return { noted: true as const }
  })
}
