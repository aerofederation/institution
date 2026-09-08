import { GraduationCap } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { listTaughtStudents } from '@/services/teacher/overview'

export const metadata = { title: 'My students' }

export default async function TeacherStudentsPage() {
  const students = await listTaughtStudents()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My students"
        description="Only students enrolled in a class you teach. The list comes from the database's own rule, not from a filter on this page."
        breadcrumbs={[{ label: 'Teaching', href: '/teacher' }, { label: 'My students' }]}
      />

      {students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students yet"
          description="Students appear here once they are enrolled in a class you are assigned to."
        />
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {students.map((student) => (
            <li key={student.profile_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">
                  {student.profiles?.full_name ?? student.student_code}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {student.student_code}
                  {student.classes?.name ? ` · ${student.classes.name}` : ''}
                  {student.sections?.name ? ` · ${student.sections.name}` : ''}
                </span>
              </div>
              <StatusBadge status={student.status} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
