import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  BarChart3,
  Building2,
  FileText,
  GraduationCap,
  Globe,
  Mail,
  MapPin,
  Network,
  Phone,
  Users,
} from 'lucide-react'

import { formatDate } from '@/components/hq/activity-timeline'
import { AdminInvitationControl } from '@/components/hq/admin-invitation-control'
import { InstitutionDetailsForm } from '@/components/hq/institution-details-form'
import { InstitutionStatusControl } from '@/components/hq/institution-status-control'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { ComingSoon, EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import {
  getInstitution,
  getInstitutionAdmins,
  getInstitutionSummary,
  listAuditLogs,
  listDocuments,
  listStudents,
  listTeachers,
} from '@/services/hq/directory'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Institution' }

/**
 * Tabs are URL state rather than client state.
 *
 * Each tab renders on the server and queries only what it needs, so opening
 * the institution record does not fetch its teachers, students, documents and
 * audit trail all at once. It also means every tab is linkable — an HQ reviewer
 * can send a colleague straight to the documents tab.
 */
const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'administrators', label: 'Administrators' },
  { id: 'teachers', label: 'Teachers' },
  { id: 'students', label: 'Students' },
  { id: 'documents', label: 'Documents' },
  { id: 'academics', label: 'Academics' },
  { id: 'activity', label: 'Activity' },
] as const

type TabId = (typeof TABS)[number]['id']

export default async function HqInstitutionDetailPage({
  params,
  searchParams,
}: PageProps<'/hq/institutions/[id]'>) {
  const { id } = await params
  const query = await searchParams
  const requested = typeof query.tab === 'string' ? query.tab : 'overview'
  const tab: TabId = (TABS.find((entry) => entry.id === requested)?.id ?? 'overview') as TabId

  const institution = await getInstitution(id)
  if (!institution) notFound()

  const summary = await getInstitutionSummary(id)

  return (
    <>
      <PageHeader
        eyebrow={humaniseEnum(institution.institution_type)}
        title={institution.name}
        description={
          [institution.city, institution.state, institution.country].filter(Boolean).join(', ') ||
          undefined
        }
        breadcrumbs={[
          { label: 'HQ', href: '/hq' },
          { label: 'Institutions', href: '/hq/institutions' },
          { label: institution.name },
        ]}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/institutions/${institution.slug}`} target="_blank">
                <Globe className="size-4" aria-hidden="true" />
                Public profile
              </Link>
            </Button>
            <InstitutionStatusControl
              institutionId={institution.id}
              institutionName={institution.name}
              status={institution.status}
            />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={institution.status} />
        <span className="text-sm text-muted-foreground">
          Joined {formatDate(institution.approved_at ?? institution.created_at)}
        </span>
        <span className="font-mono text-xs text-muted-foreground">/{institution.slug}</span>
      </div>

      {institution.status === 'SUSPENDED' ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="text-sm font-medium text-destructive">
            This institution is suspended — every one of its users is locked out federation-wide.
          </p>
          {institution.suspension_reason ? (
            <p className="text-sm text-muted-foreground">{institution.suspension_reason}</p>
          ) : null}
        </div>
      ) : null}

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <nav aria-label="Institution sections" className="border-b">
        <ul className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((entry) => (
            <li key={entry.id}>
              <Link
                href={`/hq/institutions/${id}${entry.id === 'overview' ? '' : `?tab=${entry.id}`}`}
                aria-current={tab === entry.id ? 'page' : undefined}
                className={cn(
                  'inline-block border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                  tab === entry.id
                    ? 'border-primary font-medium text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {entry.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === 'overview' ? (
        <>
          <StatGrid>
            <StatCard label="Teachers" value={summary.teachers} icon={Users} />
            <StatCard label="Students" value={summary.students} icon={GraduationCap} />
            <StatCard label="Programmes" value={summary.programs} icon={Network} />
            <StatCard label="Documents" value={summary.documents} icon={FileText} />
          </StatGrid>

          <Section title="Institution record">
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
              <Field label="Official email" value={institution.official_email} icon={Mail} />
              <Field label="Official phone" value={institution.official_phone} icon={Phone} />
              <Field label="Category" value={humaniseEnum(institution.category)} />
              <Field
                label="Year established"
                value={institution.year_established?.toString() ?? null}
              />
              <Field label="Registration number" value={institution.registration_number} />
              <Field label="Field of work" value={institution.field_of_work} />
              <Field
                label="Website"
                value={institution.website}
                href={institution.website}
                icon={Globe}
              />
              <Field
                label="Address"
                icon={MapPin}
                value={
                  [
                    institution.address_line,
                    institution.city,
                    institution.state,
                    institution.postal_code,
                    institution.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || null
                }
              />
              {institution.description ? (
                <Field label="Description" value={institution.description} span />
              ) : null}
            </dl>
          </Section>

          <Section title="Academic structure">
            <StatGrid columns={3}>
              <StatCard label="Departments" value={summary.departments} />
              <StatCard label="Classes" value={summary.classes} />
              <StatCard label="Courses" value={summary.courses} />
            </StatGrid>
          </Section>

          <Section
            title="Edit institution details"
            description="Corrections to the federation's record of this institution. Suspending or reactivating it is a separate action, above."
          >
            <InstitutionDetailsForm
              institution={{
                id: institution.id,
                name: institution.name,
                official_email: institution.official_email,
                official_phone: institution.official_phone,
                website: institution.website,
                description: institution.description,
                field_of_work: institution.field_of_work,
                registration_number: institution.registration_number,
                year_established: institution.year_established,
                address_line: institution.address_line,
                city: institution.city,
                state: institution.state,
                country: institution.country,
                postal_code: institution.postal_code,
                institution_type: institution.institution_type,
                category: institution.category,
              }}
            />
          </Section>
        </>
      ) : null}

      {tab === 'administrators' ? <Administrators institutionId={id} /> : null}
      {tab === 'teachers' ? <TeacherList institutionId={id} /> : null}
      {tab === 'students' ? <StudentList institutionId={id} /> : null}
      {tab === 'documents' ? <DocumentList institutionId={id} /> : null}
      {tab === 'academics' ? <Academics summary={summary} /> : null}
      {tab === 'activity' ? <ActivityLog institutionId={id} /> : null}
    </>
  )
}

async function Administrators({ institutionId }: { institutionId: string }) {
  const admins = await getInstitutionAdmins(institutionId)

  if (admins.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No administrators provisioned"
        description="Nobody can sign in on this institution's behalf yet. Sending the invitation creates the administrator account for the authorised representative named on its application and emails them a single-use link to set a password."
        action={<AdminInvitationControl institutionId={institutionId} />}
      />
    )
  }

  /*
   * Reissuing is offered only while somebody is still INVITED. Once every
   * administrator has activated, the link has served its purpose and the button
   * would just be a way to mint credentials nobody asked for.
   */
  const awaitingActivation = admins.some((admin) => admin.status === 'INVITED')

  return (
    <Section
      title="Administrators"
      actions={
        awaitingActivation ? (
          <AdminInvitationControl institutionId={institutionId} label="Resend invitation" />
        ) : null
      }
    >
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {admins.map((admin) => {
          const profile = admin.profiles as { full_name: string; email: string } | null
          return (
            <li key={admin.profile_id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{profile?.full_name ?? '—'}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {profile?.email ?? '—'}
                  {admin.designation ? ` · ${admin.designation}` : ''}
                </span>
              </div>
              {admin.is_primary ? (
                <span className="rounded-full border border-primary/30 px-2 py-0.5 text-[11px] text-primary">
                  Primary
                </span>
              ) : null}
              <StatusBadge status={admin.status} size="sm" />
            </li>
          )
        })}
      </ul>
    </Section>
  )
}

async function TeacherList({ institutionId }: { institutionId: string }) {
  const result = await listTeachers({ institutionId, page: 1 })

  if (result.rows.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No teachers yet"
        description="Teachers are provisioned by this institution's administrator."
      />
    )
  }

  return (
    <Section title={`Teachers (${result.total.toLocaleString('en-IN')})`}>
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {result.rows.map((teacher) => (
          <li key={teacher.profile_id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">
                {teacher.profiles?.full_name ?? 'Pending activation'}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {teacher.employee_id}
              </span>
            </div>
            <StatusBadge status={teacher.status} size="sm" />
          </li>
        ))}
      </ul>
      {result.total > result.rows.length ? (
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/hq/teachers?institution=${institutionId}`}>
            View all {result.total.toLocaleString('en-IN')} teachers
          </Link>
        </Button>
      ) : null}
    </Section>
  )
}

async function StudentList({ institutionId }: { institutionId: string }) {
  const result = await listStudents({ institutionId, page: 1 })

  if (result.rows.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No students enrolled"
        description="Students are enrolled by this institution's administrator."
      />
    )
  }

  return (
    <Section title={`Students (${result.total.toLocaleString('en-IN')})`}>
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {result.rows.map((student) => (
          <li key={student.profile_id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">
                {student.profiles?.full_name ?? 'Pending activation'}
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {student.student_code}
              </span>
            </div>
            <StatusBadge status={student.status} size="sm" />
          </li>
        ))}
      </ul>
      {result.total > result.rows.length ? (
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/hq/students?institution=${institutionId}`}>
            View all {result.total.toLocaleString('en-IN')} students
          </Link>
        </Button>
      ) : null}
    </Section>
  )
}

async function DocumentList({ institutionId }: { institutionId: string }) {
  const result = await listDocuments({ institutionId, page: 1 })

  if (result.rows.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents on file"
        description="Verification documents submitted by this institution appear here."
      />
    )
  }

  return (
    <Section title={`Documents (${result.total.toLocaleString('en-IN')})`}>
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {result.rows.map((document) => (
          <li key={document.id} className="flex flex-wrap items-center gap-3 p-4">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">{document.file_name}</span>
              <span className="text-xs text-muted-foreground">
                {humaniseEnum(document.document_type)} · {formatDate(document.created_at)}
              </span>
            </div>
            <StatusBadge status={document.verification_status} size="sm" />
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={`/hq/documents?institution=${institutionId}`}>Open in document centre</Link>
      </Button>
    </Section>
  )
}

function Academics({ summary }: { summary: Awaited<ReturnType<typeof getInstitutionSummary>> }) {
  return (
    <>
      <Section
        title="Academic structure"
        description="Counts of the academic hierarchy this institution has defined."
      >
        <StatGrid>
          <StatCard label="Departments" value={summary.departments} icon={Network} />
          <StatCard label="Programmes" value={summary.programs} icon={Network} />
          <StatCard label="Classes" value={summary.classes} icon={Building2} />
          <StatCard label="Courses" value={summary.courses} icon={BarChart3} />
        </StatGrid>
      </Section>

      <ComingSoon
        title="Academic detail and performance"
        description="Class rosters, subject mastery, attendance and assessment results become available once the academic, assignment and examination engines ship."
        phase="Phases 13–15"
        icon={BarChart3}
      />
    </>
  )
}

async function ActivityLog({ institutionId }: { institutionId: string }) {
  const result = await listAuditLogs({ institutionId, page: 1 })

  if (result.rows.length === 0) {
    return (
      <EmptyState
        title="No recorded activity"
        description="Audited actions involving this institution appear here."
      />
    )
  }

  return (
    <Section title="Audit trail">
      <ul className="divide-y divide-border rounded-lg border bg-card">
        {result.rows.map((entry) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-medium">
                {entry.action.replace(/_/g, ' ').toLowerCase()}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {entry.actor_email ?? 'System'} · {entry.entity_type}
              </span>
            </div>
            <time
              dateTime={entry.created_at}
              className="shrink-0 font-mono text-[11px] text-muted-foreground"
            >
              {new Date(entry.created_at).toLocaleString('en-IN')}
            </time>
          </li>
        ))}
      </ul>
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link href={`/hq/audit-logs?institution=${institutionId}`}>Open in audit centre</Link>
      </Button>
    </Section>
  )
}

function Field({
  label,
  value,
  icon: Icon,
  href,
  span,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  href?: string | null
  span?: boolean
}) {
  return (
    <div className={cn('flex flex-col gap-1 bg-card p-4', span && 'sm:col-span-2')}>
      <dt className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3" aria-hidden={true} /> : null}
        {label}
      </dt>
      <dd className="text-sm break-words">
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  )
}
