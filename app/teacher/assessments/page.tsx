import Link from 'next/link'

import { ClipboardList, ListChecks, Plus } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { AssessmentRow } from '@/components/teacher/assessment-row'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { listAssessments } from '@/services/assessments/builder'

export const metadata = { title: 'Assessments' }

/**
 * The lifecycle buckets, as a teacher thinks about them.
 *
 * `active`, `scheduled` and `completed` are derived from the availability
 * window rather than stored — a paper is active when now falls inside it.
 * Persisting that would need a scheduler moving rows at the right minute, and a
 * status that is an hour stale is worse than one computed on read.
 */
const BUCKETS = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'active', label: 'Active' },
  { id: 'grading', label: 'Grading' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
] as const

export default async function TeacherAssessmentsPage({
  searchParams,
}: PageProps<'/teacher/assessments'>) {
  const params = await searchParams
  const bucket = typeof params.bucket === 'string' ? params.bucket : 'all'

  const [rows, all] = await Promise.all([
    listAssessments({ bucket }),
    listAssessments({ bucket: 'all' }),
  ])

  const counts = new Map<string, number>()
  for (const row of all) {
    const key = (row as { bucket?: string }).bucket ?? 'all'
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assessments"
        description="Assignments, quizzes, tests, exams and practice papers. One engine underneath; each type simply starts with different defaults."
        breadcrumbs={[{ label: 'Teaching', href: '/teacher' }, { label: 'Assessments' }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/teacher/question-bank">Question bank</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/teacher/assessments/new">
                <Plus className="size-4" aria-hidden="true" />
                Create assessment
              </Link>
            </Button>
          </div>
        }
      />

      {/*
        A tab list rather than a select: seven buckets is few enough to show at
        once, and a teacher checking "is anything waiting on me" should be able
        to see the answer without opening a menu.
      */}
      <nav aria-label="Filter by status" className="border-b">
        <ul className="-mb-px flex flex-wrap gap-1">
          {BUCKETS.map((item) => {
            const active = bucket === item.id
            const count = item.id === 'all' ? all.length : (counts.get(item.id) ?? 0)

            return (
              <li key={item.id}>
                <Link
                  href={item.id === 'all' ? '/teacher/assessments' : `/teacher/assessments?bucket=${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors',
                    active
                      ? 'border-primary text-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground border-transparent',
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      'rounded-full px-1.5 py-0.5 font-mono text-[10px]',
                      active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={bucket === 'drafts' ? ClipboardList : ListChecks}
          title={bucket === 'all' ? 'No assessments yet' : `Nothing in ${bucket}`}
          description={
            bucket === 'all'
              ? 'Create your first paper. Choose a type, add questions, then publish it to your class.'
              : 'Try another filter, or create a new assessment.'
          }
          action={
            <Button asChild size="sm">
              <Link href="/teacher/assessments/new">Create assessment</Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <AssessmentRow key={row.id} assessment={row} />
          ))}
        </ul>
      )}
    </div>
  )
}
