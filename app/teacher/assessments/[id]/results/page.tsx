import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Table2 } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { ReleaseResultsButton } from '@/components/teacher/release-results-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAssessment } from '@/services/assessments/builder'
import { listResults } from '@/services/assessments/grading'

export const metadata = { title: 'Results' }

const FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'passed', label: 'Passed' },
  { id: 'failed', label: 'Not passed' },
  { id: 'pending', label: 'Awaiting grading' },
  { id: 'missing', label: 'Not attempted' },
  { id: 'expired', label: 'Ran out of time' },
] as const

function formatWhen(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function ResultsPage({
  params,
  searchParams,
}: PageProps<'/teacher/assessments/[id]/results'>) {
  const { id } = await params
  const query = await searchParams
  const filter = typeof query.filter === 'string' ? query.filter : 'all'

  const detail = await getAssessment(id)
  if (!detail) notFound()

  const { rows, scoring } = await listResults(id)
  const passMark = detail.assessment.pass_marks

  const visible = rows.filter((row) => {
    const best = row.best

    if (filter === 'missing') return row.status === 'NOT_STARTED'
    if (filter === 'expired') return best?.status === 'EXPIRED'
    if (filter === 'pending') return (best?.awaiting_manual ?? 0) > 0

    if (filter === 'passed' || filter === 'failed') {
      // Pass and fail are only meaningful once there is a pass mark and a score.
      if (passMark === null || !best || best.score === null) return false
      const passed = Number(best.score) >= Number(passMark)
      return filter === 'passed' ? passed : !passed
    }

    return true
  })

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={detail.assessment.title}
        title="Results"
        description={`${rows.length} student${rows.length === 1 ? '' : 's'} in this class · counting the ${scoring.toLowerCase()} attempt`}
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: detail.assessment.title, href: `/teacher/assessments/${id}` },
          { label: 'Results' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/assessments/${id}/analytics`}>Analytics</Link>
            </Button>
            <ReleaseResultsButton
              assessmentId={id}
              policy={detail.assessment.release_policy}
              alreadyReleased={Boolean(detail.assessment.results_released_at)}
            />
          </div>
        }
      />

      <nav aria-label="Filter results" className="border-b">
        <ul className="-mb-px flex flex-wrap gap-1">
          {FILTERS.map((item) => {
            const active = filter === item.id
            const href =
              item.id === 'all'
                ? `/teacher/assessments/${id}/results`
                : `/teacher/assessments/${id}/results?filter=${item.id}`

            return (
              <li key={item.id}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-block border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {visible.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="Nothing here"
          description={
            rows.length === 0
              ? 'No students are enrolled in this class yet.'
              : 'No student matches that filter.'
          }
        />
      ) : (
        // The table scrolls inside its own container so the page never scrolls
        // sideways on a phone.
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Results for {detail.assessment.title}</caption>
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Student
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Attempts
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Score
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Percentage
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Submitted
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {visible.map((row) => {
                const best = row.best
                const passed =
                  passMark !== null && best && best.score !== null
                    ? Number(best.score) >= Number(passMark)
                    : null

                return (
                  <tr key={row.student_id}>
                    <td className="px-4 py-3">
                      <span className="block font-medium">{row.full_name}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        {row.student_code}
                      </span>
                    </td>
                    <td className="px-4 py-3">{row.attempts}</td>
                    <td className="px-4 py-3 font-mono">
                      {best && best.score !== null ? `${best.score} / ${best.max_score}` : '—'}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {best && best.score !== null && best.max_score
                        ? `${Math.round((Number(best.score) / Number(best.max_score)) * 100)}%`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs">
                          {row.status === 'NOT_STARTED' ? 'Not attempted' : humaniseEnum(row.status)}
                        </span>

                        {/* Words as well as colour: a status conveyed only by
                            hue is invisible to a screen reader. */}
                        {(best?.awaiting_manual ?? 0) > 0 ? (
                          <span className="border-warning/50 text-warning rounded-full border px-1.5 py-px text-[10px]">
                            {best?.awaiting_manual} to mark
                          </span>
                        ) : passed === true ? (
                          <span className="border-success/40 text-success rounded-full border px-1.5 py-px text-[10px]">
                            Passed
                          </span>
                        ) : passed === false ? (
                          <span className="border-destructive/40 text-destructive rounded-full border px-1.5 py-px text-[10px]">
                            Not passed
                          </span>
                        ) : null}

                        {best?.is_late ? (
                          <span className="text-muted-foreground rounded-full border px-1.5 py-px text-[10px]">
                            Late
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="text-muted-foreground px-4 py-3 text-xs">
                      {formatWhen(best?.submitted_at ?? null)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
