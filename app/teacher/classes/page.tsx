import { Network } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { listOwnClasses } from '@/services/teacher/overview'

export const metadata = { title: 'My classes' }

export default async function TeacherClassesPage() {
  const classes = await listOwnClasses()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My classes"
        description="Set by your institution administrator. You can publish to these and no others — the database checks it on every write."
        breadcrumbs={[{ label: 'Teaching', href: '/teacher' }, { label: 'My classes' }]}
      />

      {classes.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No classes assigned"
          description="Ask your institution administrator to assign you to a class. Until then you cannot publish material, set assignments or build quizzes."
        />
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {classes.map((assignment) => (
            <li key={assignment.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">
                  {assignment.classes?.name ?? 'Class'}
                  {assignment.sections?.name ? (
                    <span className="text-muted-foreground"> · Section {assignment.sections.name}</span>
                  ) : (
                    <span className="text-muted-foreground"> · whole class</span>
                  )}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {assignment.academic_years?.name ?? '—'}
                </span>
              </div>
              {assignment.is_class_teacher ? (
                <span className="border-primary/30 text-primary shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                  Class teacher
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
