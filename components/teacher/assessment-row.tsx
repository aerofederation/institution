import Link from 'next/link'

import { BarChart3, CheckSquare, Clock, Users } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { AssessmentSummary } from '@/services/assessments/builder'

/**
 * One paper in the list.
 *
 * A card rather than a table row: an assessment has a type, a window, a
 * duration, an attempt limit and a status, and a teacher scanning for "which of
 * these needs me" reads that faster as a block than as eight columns.
 */

const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'border-border text-muted-foreground',
  SCHEDULED: 'border-primary/40 text-primary',
  PUBLISHED: 'border-success/40 text-success',
  ACTIVE: 'border-success/40 text-success',
  CLOSED: 'border-border text-muted-foreground',
  GRADING: 'border-warning/50 text-warning',
  COMPLETED: 'border-success/40 text-success',
  ARCHIVED: 'border-border text-muted-foreground/70',
}

function formatWhen(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AssessmentRow({ assessment }: { assessment: AssessmentSummary }) {
  const opens = formatWhen(assessment.opens_at)
  const closes = formatWhen(assessment.closes_at)
  const live = assessment.status !== 'DRAFT' && assessment.status !== 'ARCHIVED'

  return (
    <li className="bg-card flex flex-col gap-4 rounded-lg border p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tracking-wide uppercase">
          {assessment.kind}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Link
            href={`/teacher/assessments/${assessment.id}`}
            className="font-medium hover:underline"
          >
            {assessment.title}
          </Link>

          <span className="text-muted-foreground text-xs">
            {assessment.classes?.name ?? '—'}
            {assessment.sections?.name ? ` · ${assessment.sections.name}` : ' · whole class'}
            {assessment.subjects?.name ? ` · ${assessment.subjects.name}` : ''}
          </span>
        </div>

        {/*
          Status is a word, not only a colour — the brief asks for that and it
          is also the only version that works for a colour-blind reader or a
          screen reader.
        */}
        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
            STATUS_STYLE[assessment.status] ?? 'border-border text-muted-foreground',
          )}
        >
          {assessment.status.charAt(0) + assessment.status.slice(1).toLowerCase()}
        </span>
      </div>

      <dl className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5" aria-hidden="true" />
          <dt className="sr-only">Duration</dt>
          <dd>{assessment.duration_minutes ? `${assessment.duration_minutes} min` : 'No limit'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden="true" />
          <dt className="sr-only">Attempts</dt>
          <dd>
            {assessment.max_attempts} attempt{assessment.max_attempts === 1 ? '' : 's'}
          </dd>
        </div>
        {assessment.total_marks ? (
          <div className="flex items-center gap-1.5">
            <dt className="sr-only">Total marks</dt>
            <dd>{assessment.total_marks} marks</dd>
          </div>
        ) : null}
        {opens ? (
          <div>
            <dt className="sr-only">Opens</dt>
            <dd>Opens {opens}</dd>
          </div>
        ) : null}
        {closes ? (
          <div>
            <dt className="sr-only">Closes</dt>
            <dd>Closes {closes}</dd>
          </div>
        ) : null}
        {assessment.results_released_at ? (
          <div>
            <dt className="sr-only">Results</dt>
            <dd className="text-success">Results released</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/teacher/assessments/${assessment.id}`}>
            {assessment.status === 'DRAFT' ? 'Continue building' : 'Open'}
          </Link>
        </Button>

        {live ? (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/teacher/assessments/${assessment.id}/grading`}>
                <CheckSquare className="size-4" aria-hidden="true" />
                Grading
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/teacher/assessments/${assessment.id}/results`}>Results</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/teacher/assessments/${assessment.id}/analytics`}>
                <BarChart3 className="size-4" aria-hidden="true" />
                Analytics
              </Link>
            </Button>
          </>
        ) : null}
      </div>
    </li>
  )
}
