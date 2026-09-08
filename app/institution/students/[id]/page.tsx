import { notFound } from 'next/navigation'

import { CalendarDays, Mail, Phone, ShieldQuestion } from 'lucide-react'

import { MemberActions } from '@/components/institution/member-actions'
import { StudentEditForm } from '@/components/institution/member-edit-forms'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { getAcademicOptions } from '@/services/academics'
import { getStudent } from '@/services/students'

export const metadata = { title: 'Student' }

function formatDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function StudentDetailPage({
  params,
}: PageProps<'/institution/students/[id]'>) {
  const { id } = await params

  // Tenant-scoped: a student at another institution is indistinguishable from
  // one that does not exist.
  const student = await getStudent(id)
  if (!student) notFound()

  const academics = await getAcademicOptions()

  const profile = student.profiles as
    | { full_name: string; email: string; phone: string | null; last_login_at?: string | null }
    | null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={student.student_code}
        title={profile?.full_name ?? student.student_code}
        description={
          student.classes?.name
            ? `${student.classes.name}${student.sections?.name ? ` · Section ${student.sections.name}` : ''}`
            : 'No class assigned'
        }
        breadcrumbs={[
          { label: 'Institution', href: '/institution' },
          { label: 'Students', href: '/institution/students' },
          { label: profile?.full_name ?? student.student_code },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={student.status} />
            <MemberActions
              profileId={student.profile_id}
              name={profile?.full_name ?? student.student_code}
              kind="student"
              status={student.status}
            />
          </div>
        }
      />

      {student.status === 'INVITED' ? (
        <div className="border-primary/25 bg-primary/5 flex items-start gap-3 rounded-lg border p-4">
          <Mail className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="text-sm">
            This student has been invited but has not set a password yet. The activation link works
            once and expires 72 hours after it is issued — use{' '}
            <span className="font-medium">Resend invitation</span> if it has lapsed.
          </p>
        </div>
      ) : null}

      <Section
        title="Edit details"
        description="Corrections to this student's record and their enrolment. Their email is how they sign in and is changed through account recovery, not here."
      >
        <StudentEditForm
          student={{
            profile_id: student.profile_id,
            student_code: student.student_code,
            admission_number: student.admission_number,
            department_id: student.department_id,
            program_id: student.program_id,
            academic_year_id: student.academic_year_id,
            class_id: student.class_id,
            section_id: student.section_id,
            guardian_name: student.guardian_name,
            guardian_phone: student.guardian_phone,
            guardian_email: student.guardian_email,
            admission_date: student.admission_date,
            full_name: profile?.full_name ?? '',
            phone: profile?.phone ?? null,
          }}
          departments={academics.departments.map((d) => ({ id: d.id, name: d.name }))}
          programs={academics.programs.map((p) => ({ id: p.id, name: p.name }))}
          years={academics.years.map((y) => ({ id: y.id, name: y.name }))}
          classes={academics.classes.map((c) => ({ id: c.id, name: c.name }))}
          sections={academics.sections.map((sec) => ({
            id: sec.id,
            name: sec.name,
            class_id: sec.class_id,
          }))}
        />
      </Section>

      <Section title="Enrolment">
        <dl className="bg-card grid gap-x-8 gap-y-5 rounded-lg border p-5 sm:grid-cols-2">
          <Detail label="Email" icon={<Mail className="size-3.5" aria-hidden="true" />}>
            {profile?.email ?? '—'}
          </Detail>
          <Detail label="Phone" icon={<Phone className="size-3.5" aria-hidden="true" />}>
            {profile?.phone ?? '—'}
          </Detail>
          <Detail label="Roll number">
            <span className="font-mono text-sm">{student.student_code}</span>
          </Detail>
          <Detail label="Admission number">{student.admission_number ?? '—'}</Detail>
          <Detail label="Department">{student.departments?.name ?? '—'}</Detail>
          <Detail label="Programme">{student.programs?.name ?? '—'}</Detail>
          <Detail label="Class">{student.classes?.name ?? '—'}</Detail>
          <Detail label="Section">{student.sections?.name ?? '—'}</Detail>
          <Detail label="Admitted" icon={<CalendarDays className="size-3.5" aria-hidden="true" />}>
            {formatDate(student.admission_date)}
          </Detail>
          <Detail label="Last signed in">{formatDate(profile?.last_login_at)}</Detail>
        </dl>
      </Section>

      <Section
        title="Guardian"
        description="Contact for a student who may be a minor. Never shown publicly."
      >
        <dl className="bg-card grid gap-x-8 gap-y-5 rounded-lg border p-5 sm:grid-cols-3">
          <Detail
            label="Name"
            icon={<ShieldQuestion className="size-3.5" aria-hidden="true" />}
          >
            {student.guardian_name ?? '—'}
          </Detail>
          <Detail label="Phone">{student.guardian_phone ?? '—'}</Detail>
          <Detail label="Email">{student.guardian_email ?? '—'}</Detail>
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
