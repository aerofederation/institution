import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CheckSquare } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { GradingConsole } from '@/components/teacher/grading-console'
import { ReleaseResultsButton } from '@/components/teacher/release-results-button'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAssessment } from '@/services/assessments/builder'
import {
  getAttemptForGrading,
  listAttemptsToGrade,
  listIntegrityEvents,
} from '@/services/assessments/grading'

export const metadata = { title: 'Grading' }

export default async function GradingPage({
  params,
  searchParams,
}: PageProps<'/teacher/assessments/[id]/grading'>) {
  const { id } = await params
  const query = await searchParams

  const detail = await getAssessment(id)
  if (!detail) notFound()

  const attempts = await listAttemptsToGrade(id)
  const requested = typeof query.attempt === 'string' ? query.attempt : null

  // Default to the first attempt that still needs a person, so opening the page
  // lands on work rather than on a list.
  const target =
    requested ?? attempts.find((attempt) => attempt.awaiting_manual > 0)?.id ?? attempts[0]?.id ?? null

  const [loaded, integrity] = await Promise.all([
    target ? getAttemptForGrading(target) : Promise.resolve(null),
    target ? listIntegrityEvents(target) : Promise.resolve([]),
  ])
  const outstanding = attempts.filter((attempt) => attempt.awaiting_manual > 0).length

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={detail.assessment.title}
        title="Grading"
        description={
          attempts.length === 0
            ? 'Nobody has submitted this yet.'
            : outstanding > 0
              ? `${outstanding} of ${attempts.length} submitted papers still need you.`
              : `All ${attempts.length} submitted papers are marked.`
        }
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: detail.assessment.title, href: `/teacher/assessments/${id}` },
          { label: 'Grading' },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/assessments/${id}/results`}>Results</Link>
            </Button>
            <ReleaseResultsButton
              assessmentId={id}
              policy={detail.assessment.release_policy}
              alreadyReleased={Boolean(detail.assessment.results_released_at)}
            />
          </div>
        }
      />

      {attempts.length === 0 || !loaded ? (
        <EmptyState
          icon={CheckSquare}
          title="Nothing to grade yet"
          description="Submitted papers appear here. Objective questions are already marked by the time you see them; what waits for you is the writing."
        />
      ) : (
        <>
          <GradingConsole
            assessmentId={id}
            attempts={attempts}
            current={loaded.attempt}
            answers={loaded.answers}
          />

          {integrity.length > 0 ? (
            <section className="flex flex-col gap-3" aria-labelledby="integrity-heading">
              <h2 id="integrity-heading" className="font-heading text-base font-semibold">
                What the browser reported
              </h2>

              {/*
                Stated plainly, because the alternative is a teacher reading
                these as proof of something. They are not: a second device
                produces none of them, and leaving a tab is not cheating.
              */}
              <p className="text-muted-foreground text-sm">
                Context only. These note when the tab lost focus during the attempt — they do not
                detect cheating, and a great deal of cheating would leave no trace here at all.
              </p>

              <ul className="divide-border bg-card divide-y rounded-lg border text-sm">
                {integrity.map((event) => (
                  <li key={event.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-muted-foreground font-mono text-xs">
                      {new Date(event.occurred_at).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span>{humaniseEnum(event.event)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
