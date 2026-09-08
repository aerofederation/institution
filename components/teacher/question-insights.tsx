import { Info } from 'lucide-react'

import { Section } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import type { Insights } from '@/services/assessments/insights'

/**
 * The psychometrics, explained where they are shown.
 *
 * A discrimination index means nothing to most teachers, and a column of
 * unexplained decimals is worse than no column — it looks authoritative and
 * conveys nothing. Each figure is defined next to itself, and each flag says
 * what to do about it.
 */

const FLAG_COPY: Record<
  NonNullable<Insights['questions'][number]['flag']>,
  { label: string; meaning: string; tone: string }
> = {
  MIS_KEYED: {
    label: 'Check the key',
    meaning:
      'Students who did well overall got this wrong more often than students who did badly. That usually means the answer key is wrong or the wording misleads.',
    tone: 'border-destructive/40 text-destructive',
  },
  POOR_DISCRIMINATION: {
    label: 'Separates poorly',
    meaning:
      'Strong and weak students performed about the same here, so this question is not telling you much about who has understood the material.',
    tone: 'border-warning/50 text-warning',
  },
  TOO_EASY: {
    label: 'Almost everyone got it',
    meaning: 'Fine as a warm-up; it is not distinguishing between students.',
    tone: 'border-border text-muted-foreground',
  },
  TOO_HARD: {
    label: 'Almost nobody got it',
    meaning:
      'Either the material was not covered, or the question is harder than intended. Worth reading the answers before assuming the former.',
    tone: 'border-warning/50 text-warning',
  },
}

export function QuestionInsights({ insights }: { insights: Insights }) {
  const flagged = insights.questions.filter((question) => question.flag !== null)

  return (
    <div className="flex flex-col gap-8">
      {/* ── Distribution ──────────────────────────────────────────────── */}
      <Section
        title="How the class did"
        description={
          insights.median !== null
            ? `Median ${insights.median}%${
                insights.spread ? ` · lowest ${insights.spread.lowest}%, highest ${insights.spread.highest}%` : ''
              }`
            : 'No fully marked papers yet.'
        }
      >
        {insights.scored === 0 ? (
          <p className="text-muted-foreground text-sm">
            The distribution appears once papers are completely marked.
          </p>
        ) : (
          <ul className="bg-card flex flex-col gap-2 rounded-lg border p-5">
            {insights.distribution.map((band) => {
              const share = insights.scored > 0 ? (band.count / insights.scored) * 100 : 0
              return (
                <li key={band.label} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 font-mono text-xs">{band.label}</span>
                  <span className="bg-muted h-3 flex-1 overflow-hidden rounded" aria-hidden="true">
                    <span
                      className={cn(
                        'block h-full rounded',
                        band.from >= 70 ? 'bg-success' : band.from >= 40 ? 'bg-warning' : 'bg-destructive',
                      )}
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-xs">
                    {band.count} {band.count === 1 ? 'student' : 'students'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Section>

      {/* ── Flags ─────────────────────────────────────────────────────── */}
      {flagged.length > 0 ? (
        <Section
          title="Questions worth a look"
          description="Flagged from how the class actually answered, not from the wording."
        >
          <ul className="flex flex-col gap-3">
            {flagged.map((question) => {
              const copy = FLAG_COPY[question.flag!]
              return (
                <li key={question.id} className="bg-card flex flex-col gap-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px]', copy.tone)}>
                      {copy.label}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">{question.prompt}</span>
                  </div>
                  <p className="text-muted-foreground text-xs">{copy.meaning}</p>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      {/* ── Per question ──────────────────────────────────────────────── */}
      <Section title="Question statistics">
        <div className="flex flex-col gap-3">
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              <strong>Facility</strong> is the share who answered correctly — higher means easier.{' '}
              <strong>Separation</strong> compares the strongest quarter of the class with the
              weakest: near 1 the question sorts them cleanly, near 0 it does not, below 0 something
              is wrong with it.
              {!insights.discriminationAvailable ? (
                <>
                  {' '}
                  Separation needs at least {insights.minimumForDiscrimination} fully marked papers
                  and this paper has {insights.scored}, so it is not shown.
                </>
              ) : null}
            </span>
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Facility and separation per question</caption>
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Question</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Type</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Answers</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Facility</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Separation</th>
                  <th scope="col" className="px-4 py-3 text-left font-medium">Average</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {insights.questions.map((question, index) => (
                  <tr key={question.id}>
                    <td className="max-w-md px-4 py-3">
                      <span className="text-muted-foreground mr-2 font-mono text-xs">
                        {index + 1}
                      </span>
                      {question.prompt}
                      {question.topic ? (
                        <span className="text-muted-foreground block text-xs">{question.topic}</span>
                      ) : null}
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {humaniseEnum(question.question_type)}
                    </td>
                    <td className="px-4 py-3">{question.responses}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {question.pValue === null ? (
                        <span className="text-muted-foreground">marked by you</span>
                      ) : (
                        `${Math.round(question.pValue * 100)}%`
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {question.discrimination === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span
                          className={cn(
                            question.discrimination < 0
                              ? 'text-destructive'
                              : question.discrimination < 0.2
                                ? 'text-warning'
                                : 'text-success',
                          )}
                        >
                          {question.discrimination.toFixed(2)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {question.averageMarks ?? '—'} / {question.marks}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── Topics ────────────────────────────────────────────────────── */}
      {insights.topics.length > 0 ? (
        <Section
          title="By topic"
          description="Marks achieved against marks available, for questions you tagged with a topic. Weakest first."
        >
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {insights.topics.map((topic) => (
              <li key={topic.topic} className="flex flex-wrap items-center gap-3 p-4">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{topic.topic}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {topic.questions} question{topic.questions === 1 ? '' : 's'}
                </span>
                <span className="bg-muted h-2 w-32 shrink-0 overflow-hidden rounded" aria-hidden="true">
                  <span
                    className={cn(
                      'block h-full rounded',
                      topic.masteryPercent >= 70
                        ? 'bg-success'
                        : topic.masteryPercent >= 40
                          ? 'bg-warning'
                          : 'bg-destructive',
                    )}
                    style={{ width: `${topic.masteryPercent}%` }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-sm">
                  {topic.masteryPercent}%
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  )
}
