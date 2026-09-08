'use server'

import { requireTenant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'
import { MANUAL_ONLY_TYPES, type QuestionType } from '@/lib/validation/assessment'

/**
 * Deeper analysis of one paper's results.
 *
 * Everything here is computed from submitted attempts. Where there is not
 * enough data for a figure to mean anything, the figure is `null` and the page
 * says why — a discrimination index from four students is noise wearing the
 * costume of a statistic, and presenting it would be worse than presenting
 * nothing.
 *
 * The two psychometrics are the standard ones:
 *
 *   * **Difficulty (p)** — the proportion who answered correctly. Despite the
 *     name, a *high* p means an easy question.
 *   * **Discrimination (D)** — how well a question separates students who did
 *     well overall from those who did not, using the classic upper/lower 27%
 *     split. A question everyone gets right discriminates at 0; one that the
 *     weakest students pass and the strongest fail scores negative, which
 *     usually means it is ambiguous or mis-keyed.
 */

/** Below this, an upper/lower split is too small to say anything. */
const MIN_FOR_DISCRIMINATION = 10

export type QuestionInsight = {
  id: string
  prompt: string
  question_type: string
  marks: number
  topic: string | null
  learning_objective: string | null
  difficulty: string | null

  responses: number
  /** Proportion correct, 0–1. Null for questions a person marks. */
  pValue: number | null
  /** Upper 27% correct rate minus lower 27%, −1 to 1. Null when the cohort is small. */
  discrimination: number | null
  averageMarks: number | null
  /** A judgement the teacher can act on, or null when there is not enough data. */
  flag: 'TOO_EASY' | 'TOO_HARD' | 'POOR_DISCRIMINATION' | 'MIS_KEYED' | null
}

export type TopicInsight = {
  topic: string
  questions: number
  marksAvailable: number
  marksAchieved: number
  masteryPercent: number
}

export type ScoreBand = { label: string; from: number; to: number; count: number }

export type Insights = {
  cohort: number
  scored: number
  /** Null until enough papers exist for the split to mean anything. */
  discriminationAvailable: boolean
  minimumForDiscrimination: number
  questions: QuestionInsight[]
  topics: TopicInsight[]
  distribution: ScoreBand[]
  median: number | null
  spread: { lowest: number; highest: number } | null
}

export async function getInsights(assessmentId: string): Promise<Insights> {
  await requireTenant()
  const supabase = await createClient()

  const [{ data: questions }, { data: attempts }] = await Promise.all([
    supabase
      .from('assessment_questions')
      .select('id, prompt, question_type, marks, topic, learning_objective, difficulty')
      .eq('assessment_id', assessmentId)
      .order('position'),
    supabase
      .from('assessment_attempts')
      .select('id, score, max_score, percentage, awaiting_manual')
      .eq('assessment_id', assessmentId)
      .neq('status', 'IN_PROGRESS'),
  ])

  const papers = attempts ?? []
  const scored = papers.filter(
    (attempt) => attempt.percentage !== null && attempt.awaiting_manual === 0,
  )

  const { data: answers } = await supabase
    .from('assessment_answers')
    .select('attempt_id, question_id, is_correct, marks_awarded')
    .in(
      'attempt_id',
      papers.length ? papers.map((attempt) => attempt.id) : ['00000000-0000-0000-0000-000000000000'],
    )

  const rows = answers ?? []

  /*
   * The upper and lower 27% by overall score — the split Kelley showed
   * maximises the difference between groups while keeping each large enough to
   * be stable.
   */
  const ranked = [...scored].sort((a, b) => Number(b.percentage) - Number(a.percentage))
  const groupSize = Math.max(1, Math.floor(ranked.length * 0.27))
  const canDiscriminate = ranked.length >= MIN_FOR_DISCRIMINATION

  const upper = new Set(ranked.slice(0, groupSize).map((attempt) => attempt.id))
  const lower = new Set(ranked.slice(-groupSize).map((attempt) => attempt.id))

  const questionInsights: QuestionInsight[] = (questions ?? []).map((question) => {
    const own = rows.filter((answer) => answer.question_id === question.id)
    const marked = own.filter((answer) => answer.is_correct !== null)

    // "Correct" only means something where there is a key to be correct
    // against — see the note in `getAnalytics`.
    const objective = !MANUAL_ONLY_TYPES.includes(question.question_type as QuestionType)

    const pValue =
      objective && marked.length > 0
        ? marked.filter((answer) => answer.is_correct === true).length / marked.length
        : null

    let discrimination: number | null = null

    if (objective && canDiscriminate) {
      const rateIn = (group: Set<string>) => {
        const inGroup = marked.filter((answer) => group.has(answer.attempt_id))
        if (inGroup.length === 0) return null
        return inGroup.filter((answer) => answer.is_correct === true).length / inGroup.length
      }

      const top = rateIn(upper)
      const bottom = rateIn(lower)
      if (top !== null && bottom !== null) {
        discrimination = Math.round((top - bottom) * 100) / 100
      }
    }

    /*
     * One flag at most, chosen by what a teacher would act on first. A
     * negative discrimination is the most serious — it usually means the key is
     * wrong or the wording misleads — so it wins over difficulty.
     */
    let flag: QuestionInsight['flag'] = null
    if (discrimination !== null && discrimination < 0) flag = 'MIS_KEYED'
    else if (discrimination !== null && discrimination < 0.2 && pValue !== null && pValue < 0.9) {
      flag = 'POOR_DISCRIMINATION'
    } else if (pValue !== null && pValue >= 0.95) flag = 'TOO_EASY'
    else if (pValue !== null && pValue <= 0.2) flag = 'TOO_HARD'

    return {
      id: question.id,
      prompt: question.prompt,
      question_type: question.question_type,
      marks: Number(question.marks),
      topic: question.topic,
      learning_objective: question.learning_objective,
      difficulty: question.difficulty,
      responses: own.length,
      pValue: pValue === null ? null : Math.round(pValue * 100) / 100,
      discrimination,
      averageMarks:
        own.length > 0
          ? Math.round(
              (own.reduce((sum, answer) => sum + Number(answer.marks_awarded), 0) / own.length) *
                100,
            ) / 100
          : null,
      flag,
    }
  })

  // ── Mastery by topic ──────────────────────────────────────────────────────
  const byTopic = new Map<string, { questions: number; available: number; achieved: number }>()

  for (const question of questionInsights) {
    if (!question.topic) continue

    const own = rows.filter((answer) => answer.question_id === question.id)
    if (own.length === 0) continue

    const entry = byTopic.get(question.topic) ?? { questions: 0, available: 0, achieved: 0 }
    entry.questions += 1
    entry.available += question.marks * own.length
    entry.achieved += own.reduce((sum, answer) => sum + Number(answer.marks_awarded), 0)
    byTopic.set(question.topic, entry)
  }

  const topics: TopicInsight[] = [...byTopic.entries()]
    .map(([topic, entry]) => ({
      topic,
      questions: entry.questions,
      marksAvailable: Math.round(entry.available * 100) / 100,
      marksAchieved: Math.round(entry.achieved * 100) / 100,
      masteryPercent:
        entry.available > 0 ? Math.round((entry.achieved / entry.available) * 100) : 0,
    }))
    .sort((a, b) => a.masteryPercent - b.masteryPercent)

  // ── Distribution ──────────────────────────────────────────────────────────
  const bands: ScoreBand[] = [
    { label: '0–39%', from: 0, to: 39, count: 0 },
    { label: '40–54%', from: 40, to: 54, count: 0 },
    { label: '55–69%', from: 55, to: 69, count: 0 },
    { label: '70–84%', from: 70, to: 84, count: 0 },
    { label: '85–100%', from: 85, to: 100, count: 0 },
  ]

  for (const attempt of scored) {
    const percent = Number(attempt.percentage)
    const band = bands.find((entry) => percent >= entry.from && percent <= entry.to)
    if (band) band.count += 1
  }

  const percentages = scored.map((attempt) => Number(attempt.percentage)).sort((a, b) => a - b)
  const median =
    percentages.length === 0
      ? null
      : percentages.length % 2 === 1
        ? percentages[(percentages.length - 1) / 2]
        : Math.round(
            ((percentages[percentages.length / 2 - 1] + percentages[percentages.length / 2]) / 2) *
              100,
          ) / 100

  return {
    cohort: papers.length,
    scored: scored.length,
    discriminationAvailable: canDiscriminate,
    minimumForDiscrimination: MIN_FOR_DISCRIMINATION,
    questions: questionInsights,
    topics,
    distribution: bands,
    median,
    spread:
      percentages.length > 0
        ? { lowest: percentages[0], highest: percentages[percentages.length - 1] }
        : null,
  }
}

// ── What the assistant has cost ─────────────────────────────────────────────

export type AiSpend = {
  calls: number
  failed: number
  inputTokens: number
  outputTokens: number
  byFeature: { feature: string; calls: number; inputTokens: number; outputTokens: number }[]
}

/**
 * Token spend for this institution.
 *
 * Counted from `ai_usage_events`, which records one row per call — including
 * the failures, so an assistant that is erroring rather than working shows up
 * as calls that cost tokens and produced nothing.
 *
 * No money figure is shown. Prices change, they differ per model and per
 * contract, and a number that is quietly six months out of date is worse than
 * the token counts it was derived from.
 */
export async function getAiSpend(days = 30): Promise<AiSpend> {
  const session = await requireTenant()
  const supabase = await createClient()

  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('feature, input_tokens, output_tokens, succeeded')
    .eq('institution_id', session.institutionId)
    .gte('created_at', since)

  if (error) throw error

  const rows = data ?? []
  const byFeature = new Map<string, { calls: number; input: number; output: number }>()

  for (const row of rows) {
    const entry = byFeature.get(row.feature) ?? { calls: 0, input: 0, output: 0 }
    entry.calls += 1
    entry.input += row.input_tokens
    entry.output += row.output_tokens
    byFeature.set(row.feature, entry)
  }

  return {
    calls: rows.length,
    failed: rows.filter((row) => !row.succeeded).length,
    inputTokens: rows.reduce((sum, row) => sum + row.input_tokens, 0),
    outputTokens: rows.reduce((sum, row) => sum + row.output_tokens, 0),
    byFeature: [...byFeature.entries()]
      .map(([feature, entry]) => ({
        feature,
        calls: entry.calls,
        inputTokens: entry.input,
        outputTokens: entry.output,
      }))
      .sort((a, b) => b.calls - a.calls),
  }
}
