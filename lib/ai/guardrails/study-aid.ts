import 'server-only'

import { z } from 'zod'

/**
 * What the application will accept from a model for a study aid.
 *
 * Structured outputs make the shape reliable, not the content sane. A schema
 * that says "array of strings" is satisfied by forty empty strings, and by one
 * key point that is nine thousand characters long. This parses the response and
 * bounds it before a student ever sees it.
 *
 * Unlike the grading guardrail there is no number to clamp — nothing here can
 * become a mark. The risk is different: a student revising from an empty or
 * malformed aid would waste their time and not know why. So an aid that does
 * not parse is rejected outright rather than stored half-formed.
 */

export const studyAidResponseSchema = z.object({
  summary: z.string().trim().min(1).max(8000),
  key_points: z
    .array(z.string().trim().min(1).max(600))
    .max(12)
    .default([]),
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(1000),
        answer: z.string().trim().min(1).max(2000),
        difficulty: z.enum(['EASY', 'MODERATE', 'HARD']),
      }),
    )
    .max(12)
    .default([]),
})

export type StudyAidResponse = z.infer<typeof studyAidResponseSchema>

/**
 * Parses and bounds a model response.
 *
 * Empty strings survive a `type: string` schema, so they are dropped here
 * rather than rendered as blank bullets. A response with a summary but no
 * usable questions is still worth keeping — the summary is the main thing, and
 * a short material may genuinely not support twelve questions.
 */
export function checkStudyAidResponse(raw: unknown): StudyAidResponse {
  const parsed = studyAidResponseSchema.parse(raw)

  return {
    summary: parsed.summary,
    key_points: parsed.key_points.filter((point) => point.length > 0),
    questions: parsed.questions.filter(
      (item) => item.question.length > 0 && item.answer.length > 0,
    ),
  }
}
