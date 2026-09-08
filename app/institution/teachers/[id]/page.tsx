import { notFound } from 'next/navigation'

import { CalendarDays, Mail, Phone } from 'lucide-react'

import { MemberActions } from '@/components/institution/member-actions'
import { TeacherEditForm } from '@/components/institution/member-edit-forms'
import { TeachingAssignmentControl } from '@/components/institution/teaching-assignment-control'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { getAcademicOptions } from '@/services/academics'
import { listTeachingAssignments } from '@/services/institution/teaching-assignments'
import { getTeacher } from '@/services/teachers'

export const metadata = { title: 'Teacher' }

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function TeacherDetailPage({
  params,
}: PageProps<'/institution/teachers/[id]'>) {
  const { id } = await params

  /*
   * `getTeacher` scopes to the caller's tenant, so a teacher at another
   * institution is indistinguishable from one that does not exist. That is the
   * intent: a 404 discloses nothing about who else is on the platform.
   */
  const teacher = await getTeacher(id)
  if (!teacher) notFound()

  const [assignments, academics] = await Promise.all([
    listTeachingAssignments(id),
    getAcademicOptions(),
  ])

  const profile = teacher.profiles as
    | { full_name: string; email: string; phone: string | null; last_login_at?: string | null }
    | null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={teacher.employee_id}
        title={profile?.full_name ?? teacher.employee_id}
        description={teacher.departments?.name ?? 'No department assigned'}
        breadcrumbs={[
          { label: 'Institution', href: '/institution' },
          { label: 'Teachers', href: '/institution/teachers' },
          { label: profile?.full_name ?? teacher.employee_id },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={teacher.status} />
            <MemberActions
              profileId={teacher.profile_id}
              name={profile?.full_name ?? teacher.employee_id}
              kind="teacher"
              status={teacher.status}
            />
          </div>
        }
      />

      {teacher.status === 'INVITED' ? (
        <div className="border-primary/25 bg-primary/5 flex items-start gap-3 rounded-lg border p-4">
          <Mail className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            This teacher has been invited but has not set a password yet. The activation link works
            once and expires 72 hours after it is issued — use{' '}
            <span className="font-medium">Resend invitation</span> if it has lapsed.
          </p>
        </div>
      ) : null}

      <Section
        title="Classes taught"
        description="What this teacher may publish to. Study material, assignments and quizzes are addressed to a class, so an unassigned teacher can create nothing."
      >
        <TeachingAssignmentControl
          teacherId={teacher.profile_id}
          teacherName={profile?.full_name ?? teacher.employee_id}
          assignments={assignments}
          classes={academics.classes.map((klass) => ({
            id: klass.id,
            name: klass.name,
            academic_year_id: klass.academic_year_id,
          }))}
          sections={academics.sections.map((section) => ({
            id: section.id,
            name: section.name,
            class_id: section.class_id,
          }))}
        />
      </Section>

      <Section
        title="Edit details"
        description="Corrections to this teacher's record. Their email is how they sign in and is changed through account recovery, not here."
      >
        <TeacherEditForm
          teacher={{
            profile_id: teacher.profile_id,
            employee_id: teacher.employee_id,
            department_id: teacher.department_id,
            qualification: teacher.qualification,
            specialization: teacher.specialization,
            experience_years: teacher.experience_years,
            joining_date: teacher.joining_date,
            bio: teacher.bio ?? null,
            full_name: profile?.full_name ?? '',
            phone: profile?.phone ?? null,
          }}
          departments={academics.departments.map((department) => ({
            id: department.id,
            name: department.name,
          }))}
        />
      </Section>

      <Section title="Details">
        <dl className="bg-card grid gap-x-8 gap-y-5 rounded-lg border p-5 sm:grid-cols-2">
          <Detail label="Email" icon={<Mail className="size-3.5" aria-hidden="true" />}>
            {profile?.email ?? '—'}
          </Detail>
          <Detail label="Phone" icon={<Phone className="size-3.5" aria-hidden="true" />}>
            {profile?.phone ?? '—'}
          </Detail>
          <Detail label="Staff number">
            <span className="font-mono text-sm">{teacher.employee_id}</span>
          </Detail>
          <Detail label="Department">{teacher.departments?.name ?? '—'}</Detail>
          <Detail label="Qualification">{teacher.qualification ?? '—'}</Detail>
          <Detail label="Specialisation">{teacher.specialization ?? '—'}</Detail>
          <Detail label="Experience">
            {teacher.experience_years !== null ? `${teacher.experience_years} years` : '—'}
          </Detail>
          <Detail label="Joined" icon={<CalendarDays className="size-3.5" aria-hidden="true" />}>
            {formatDate(teacher.joining_date)}
          </Detail>
          <Detail label="Added">{formatDate(teacher.created_at)}</Detail>
          <Detail label="Last signed in">{formatDate(profile?.last_login_at)}</Detail>
        </dl>
      </Section>
    </div>
  )
}

function Detail({
  label,
  icon,
  children,
}: {
  label: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground flex items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] uppercase">
        {icon}
        {label}
      </dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}
