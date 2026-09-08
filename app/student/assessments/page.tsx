import { ListChecks } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { StartAttemptButton } from '@/components/student/student-actions'
import { Button } from '@/components/ui/button'
import { listAssessmentsForStudent } from '@/services/learning'
import Link from 'next/link'

export const metadata = { title: 'Quizzes & tests' }

function formatWhen(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const BUCKETS = [
  { id: 'available', label: 'Available' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
] as const

export default async function StudentAssessmentsPage({
  searchParams,
}: PageProps<'/student/assessments'>) {
  const params = await searchParams
  const bucket = typeof params.bucket === 'string' ? params.bucket : 'available'

  const all = await listAssessmentsForStudent()

  const counts = new Map<string, number>()
  for (const item of all) counts.set(item.bucket, (counts.get(item.bucket) ?? 0) + 1)

  /*
   * Available first, because that is what a student came to do. An empty
   * "Available" with work sitting in "Upcoming" is a useful thing to see, so
   * the tabs are always shown even when one is empty.
   */
  const assessments = all.filter((item) => item.bucket === bucket)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quizzes & tests"
        description="Papers set for your class. Your answers and score are yours and your teacher's alone."
        breadcrumbs={[{ label: 'Learning', href: '/student' }, { label: 'Quizzes & tests' }]}
      />

      <nav aria-label="Filter by status" className="border-b">
        <ul className="-mb-px flex flex-wrap gap-1">
          {BUCKETS.map((item) => {
            const active = bucket === item.id
            const count = counts.get(item.id) ?? 0

            return (
              <li key={item.id}>
                <Link
                  href={`/student/assessments?bucket=${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ' +
                    (active
                      ? 'border-primary text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent')
                  }
                >
                  {item.label}
                  <span
                    className={
                      'rounded-full px-1.5 py-0.5 font-mono text-[10px] ' +
                      (active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')
                    }
                  >
                    {count}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {assessments.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={all.length === 0 ? 'Nothing set yet' : `Nothing ${bucket.replace('_', ' ')}`}
          description={
            all.length === 0
              ? 'Quizzes and tests your teachers publish to your class appear here.'
              : 'Try another tab — you may have work waiting under a different heading.'
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {assessments.map((assessment) => {
            const attempts = assessment.assessment_attempts
            const inProgress = attempts.find((attempt) => attempt.status === 'IN_PROGRESS')
            const finished = attempts.filter((attempt) => attempt.status !== 'IN_PROGRESS')
            const best = finished.reduce<(typeof finished)[number] | null>(
              (top, attempt) => (!top || (attempt.score ?? 0) > (top.score ?? 0) ? attempt : top),
              null,
            )

            const { not_yet_open: notYetOpen, has_closed: closed } = assessment
            const used = assessment.attempts_used
            const exhausted = assessment.attempts_exhausted

            return (
              <li key={assessment.id} className="bg-card flex flex-col gap-4 rounded-lg border p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase">
                    {assessment.kind}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{assessment.title}</span>
                    <span className="text-muted-foreground text-xs">
                      {assessment.duration_minutes
                        ? `${assessment.duration_minutes} minutes`
                        : 'No time limit'}
                      {` · ${used} of ${assessment.max_attempts} attempt${assessment.max_attempts === 1 ? '' : 's'} used`}
                      {assessment.closes_at ? ` · closes ${formatWhen(assessment.closes_at)}` : ''}
                    </span>
                  </div>

                  {best ? <StatusBadge status={best.status} size="sm" /> : null}
                </div>

                {assessment.instructions ? (
                  <p className="bg-muted/40 rounded-md border p-3 text-sm whitespace-pre-wrap">
                    {assessment.instructions}
                  </p>
                ) : null}

                {best && best.score !== null ? (
                  <div className="border-success/40 bg-success/10 flex flex-wrap items-center gap-3 rounded-md border p-4">
                    <span className="text-sm font-medium">
                      Best score: {best.score} / {best.max_score}
                    </span>
                    {assessment.pass_marks !== null ? (
                      <span className="text-muted-foreground text-xs">
                        Pass mark {assessment.pass_marks}
                      </span>
                    ) : null}
                    <Button asChild size="sm" variant="outline" className="ml-auto">
                      <Link href={`/student/assessments/${best.id}`}>View result</Link>
                    </Button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  {notYetOpen ? (
                    <p className="text-muted-foreground text-sm">
                      Opens {formatWhen(assessment.opens_at)}
                    </p>
                  ) : closed ? (
                    <p className="text-muted-foreground text-sm">This paper has closed.</p>
                  ) : exhausted ? (
                    <p className="text-muted-foreground text-sm">
                      You have used all your attempts.
                    </p>
                  ) : (
                    <StartAttemptButton
                      assessmentId={assessment.id}
                      label={inProgress ? 'Resume attempt' : 'Start'}
                    />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
