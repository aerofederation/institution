import 'server-only'

import { z } from 'zod'

/**
 * What the application will accept from a model.
 *
 * Structured outputs make the *shape* reliable. They do not make the *content*
 * sane — a schema that says "number" is satisfied by 9000 on a five-mark
 * question. So the response is parsed here, and the one value that could do
 * damage if it were wrong is clamped rather than trusted.
 *
 * Nothing downstream treats this as a mark, so a bad suggestion is a bad
 * sentence on a teacher's screen rather than a bad grade. These checks exist so
 * that it is not even that.
 */

export const gradingResponseSchema = z.object({
  suggested_marks: z.number().finite(),
  rationale: z.string().trim().min(1).max(5000),
  rubric_points_met: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  rubric_points_missed: z.array(z.string().trim().min(1).max(500)).max(30).default([]),
  confidence: z.enum(['LOW', 'MEDIUM', 'HIGH']),
})

export type GradingResponse = z.infer<typeof gradingResponseSchema>

export type CheckedSuggestion = GradingResponse & {
  /** True when the model's number was outside the question's range and was clamped. */
  clamped: boolean
}

/**
 * Parses and bounds a model response.
 *
 * The clamp is reported rather than hidden. A model that suggested 12 on a
 * 5-mark question got something badly wrong, and a teacher looking at a
 * suspiciously round "5" deserves to know it was not the model's answer.
 */
export function checkGradingResponse(raw: unknown, maxMarks: number): CheckedSuggestion {
  const parsed = gradingResponseSchema.parse(raw)

  const bounded = Math.min(Math.max(parsed.suggested_marks, 0), maxMarks)
  // Rounded to the half mark, which is the smallest unit the marking UI accepts.
  const rounded = Math.round(bounded * 2) / 2

  return {
    ...parsed,
    suggested_marks: rounded,
    clamped: rounded !== parsed.suggested_marks,
  }
}
