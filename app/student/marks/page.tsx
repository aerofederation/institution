import Link from 'next/link'

import { Award, ClipboardCheck, Hourglass, TrendingUp } from 'lucide-react'

import { AreaTrend, BarSeries, ChartCard } from '@/components/charts/afi-charts'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import { getStudentMarks } from '@/services/learning/marks'

export const metadata = { title: 'Marks' }

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function StudentMarksPage() {
  const marks = await getStudentMarks()
  const { overall } = marks

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learning"
        title="Marks"
        description="Every result your teachers have released, and what they add up to."
        breadcrumbs={[{ label: 'Learning', href: '/student' }, { label: 'Marks' }]}
      />

      {overall.papers === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No results yet"
          description={
            overall.awaitingRelease > 0
              ? `You have ${overall.awaitingRelease} paper${overall.awaitingRelease === 1 ? '' : 's'} sat and waiting on your teacher. Results appear here once they are released.`
              : 'When a teacher releases the result of a paper you have sat, it appears here with your averages and subject breakdown.'
          }
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/student/assessments">Assignments &amp; tests</Link>
            </Button>
          }
        />
      ) : (
        <>
          <StatGrid columns={4}>
            <StatCard
              label="Papers marked"
              value={overall.papers}
              hint={
                overall.awaitingRelease > 0
                  ? `${overall.awaitingRelease} awaiting release`
                  : 'All released'
              }
              icon={ClipboardCheck}
            />
            <StatCard
              label="Average"
              value={`${overall.average}%`}
              hint={`Across ${overall.papers} paper${overall.papers === 1 ? '' : 's'}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Best"
              value={`${overall.best}%`}
              hint={`Lowest ${overall.lowest}%`}
              icon={Award}
            />
            <StatCard
              label="Passed"
              value={overall.passed}
              hint={
                /*
                 * Only papers that set a pass mark can pass or fail. Saying so
                 * stops "0 passed" reading as failure when no paper had one.
                 */
                overall.passed + overall.failed === 0
                  ? 'No paper set a pass mark'
                  : `${overall.failed} not passed`
              }
              icon={Hourglass}
              tone={overall.failed > 0 ? 'attention' : 'default'}
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard
              title="How you are tracking"
              description="Percentage on each paper, in the order you sat them."
              footer={
                marks.trend.length < 2
                  ? 'One result so far — a trend needs at least two.'
                  : `${marks.trend.length} results`
              }
            >
              <AreaTrend data={marks.trend} valueLabel="%" colorIndex={1} />
            </ChartCard>

            <ChartCard
              title="By subject"
              description="Your average in each subject."
              footer={`${marks.subjects.length} subject${marks.subjects.length === 1 ? '' : 's'}`}
            >
              <BarSeries
                data={marks.subjects.map((subject) => ({
                  label: subject.subject,
                  value: subject.average,
                }))}
                valueLabel="% average"
                colorIndex={2}
              />
            </ChartCard>
          </div>

          {marks.kinds.length > 1 ? (
            <ChartCard
              title="By type of paper"
              description="Where you do better — quizzes, tests, exams or assignments."
            >
              <BarSeries
                data={marks.kinds.map((kind) => ({
                  label: humaniseEnum(kind.kind),
                  value: kind.average,
                }))}
                valueLabel="% average"
                colorIndex={3}
                height={200}
              />
            </ChartCard>
          ) : null}

          <Section
            title="Subject breakdown"
            description="Best and lowest in each subject, so a single bad paper does not hide behind an average."
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="py-2 pr-3 font-medium">Subject</th>
                    <th className="py-2 pr-3 font-medium">Papers</th>
                    <th className="py-2 pr-3 font-medium">Average</th>
                    <th className="py-2 pr-3 font-medium">Best</th>
                    <th className="py-2 font-medium">Lowest</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {marks.subjects.map((subject) => (
                    <tr key={subject.subject}>
                      <td className="py-2.5 pr-3 font-medium">{subject.subject}</td>
                      <td className="text-muted-foreground py-2.5 pr-3 tabular-nums">
                        {subject.papers}
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums">{subject.average}%</td>
                      <td className="text-success py-2.5 pr-3 tabular-nums">{subject.best}%</td>
                      <td className="text-muted-foreground py-2.5 tabular-nums">
                        {subject.lowest}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            title="Every result"
            description="Newest first. Open one to see the paper and, where your teacher allowed it, the answers."
          >
            <ul className="divide-border bg-card divide-y rounded-lg border">
              {marks.results.map((result) => (
                <li
                  key={result.attempt_id}
                  className="flex flex-wrap items-center gap-3 p-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{result.title}</span>
                      {result.attempt_no > 1 ? (
                        <span className="text-muted-foreground text-[10px]">
                          attempt {result.attempt_no}
                        </span>
                      ) : null}
                      {result.is_late ? (
                        <span className="border-warning/40 text-warning rounded-full border px-2 py-0.5 text-[10px]">
                          Late
                        </span>
                      ) : null}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {humaniseEnum(result.kind)} · {result.subject} ·{' '}
                      {formatDate(result.submitted_at)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex flex-col items-end">
                      <span className="font-medium tabular-nums">
                        {result.score} / {result.max_score}
                      </span>
                      <span
                        className={cn(
                          'text-xs tabular-nums',
                          result.passed === false ? 'text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {result.percentage}%
                        {result.passed === true ? ' · passed' : ''}
                        {result.passed === false ? ' · not passed' : ''}
                      </span>
                    </span>

                    <Button asChild size="sm" variant="outline">
                      <Link href={`/student/assessments/${result.attempt_id}`}>Open</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}
