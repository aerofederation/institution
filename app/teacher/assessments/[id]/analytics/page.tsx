import { notFound } from 'next/navigation'

import { BarChart3 } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAssessment } from '@/services/assessments/builder'
import { getAnalytics } from '@/services/assessments/grading'
import { getInsights } from '@/services/assessments/insights'
import { QuestionInsights } from '@/components/teacher/question-insights'

export const metadata = { title: 'Analytics' }

/**
 * What actually happened, from submitted attempts.
 *
 * Where there is no data the figure is a dash and the page says so. A confident
 * "0%" on a paper nobody has sat reads like a result, and would be the one kind
 * of dishonesty a dashboard can commit without anybody noticing.
 */
export default async function AnalyticsPage({
  params,
}: PageProps<'/teacher/assessments/[id]/analytics'>) {
  const { id } = await params

  const detail = await getAssessment(id)
  if (!detail) notFound()

  const [analytics, insights] = await Promise.all([getAnalytics(id), getInsights(id)])
  const hasData = analytics.completed > 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={detail.assessment.title}
        title="Analytics"
        description="Every figure below comes from a submitted attempt. Nothing is estimated."
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: detail.assessment.title, href: `/teacher/assessments/${id}` },
          { label: 'Analytics' },
        ]}
      />

      <StatGrid columns={4}>
        <StatCard
          label="In the class"
          value={analytics.cohort}
          hint={`${analytics.notAttempted} have not started`}
        />
        <StatCard
          label="Completed"
          value={analytics.completed}
          hint={`${analytics.started} attempt${analytics.started === 1 ? '' : 's'} in total`}
        />
        <StatCard
          label="Average score"
          value={analytics.averageScore ?? '—'}
          hint={
            hasData
              ? `lowest ${analytics.lowestScore} · highest ${analytics.highestScore}`
              : 'Nobody has submitted yet'
          }
        />
        <StatCard
          label="Pass rate"
          value={analytics.passRate === null ? '—' : `${analytics.passRate}%`}
          hint={
            detail.assessment.pass_marks === null
              ? 'No pass mark set'
              : `pass mark ${detail.assessment.pass_marks}`
          }
          tone={analytics.passRate !== null && analytics.passRate < 50 ? 'attention' : 'default'}
        />
      </StatGrid>

      {!hasData ? (
        <EmptyState
          icon={BarChart3}
          title="Nobody has sat this yet"
          description="Question-level analytics appear once students start submitting. Until then there is nothing to report, so nothing is shown."
        />
      ) : (
        <>
          <Section
            title="Question by question"
            description={
              analytics.averageMinutes !== null
                ? `Average completion time: ${analytics.averageMinutes} minutes.`
                : undefined
            }
          >
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <caption className="sr-only">Per-question performance</caption>
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Question
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Type
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Answered
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Correct
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      Average marks
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {analytics.questions.map((question, index) => (
                    <tr key={question.id}>
                      <td className="max-w-md px-4 py-3">
                        <span className="text-muted-foreground mr-2 font-mono text-xs">
                          {index + 1}
                        </span>
                        {question.prompt}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 text-xs">
                        {humaniseEnum(question.question_type)}
                      </td>
                      <td className="px-4 py-3">{question.answered}</td>
                      <td className="px-4 py-3">
                        {question.correctPercent === null ? (
                          <span className="text-muted-foreground text-xs">Marked by you</span>
                        ) : (
                          <span className="flex items-center gap-2">
                            {/* The bar is decoration; the number beside it is
                                what conveys the value. */}
                            <span
                              className="bg-muted h-1.5 w-16 overflow-hidden rounded-full"
                              aria-hidden="true"
                            >
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  question.correctPercent >= 70
                                    ? 'bg-success'
                                    : question.correctPercent >= 40
                                      ? 'bg-warning'
                                      : 'bg-destructive',
                                )}
                                style={{ width: `${question.correctPercent}%` }}
                              />
                            </span>
                            <span className="font-mono text-xs">{question.correctPercent}%</span>
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
          </Section>

          <QuestionInsights insights={insights} />
        </>
      )}
    </div>
  )
}
