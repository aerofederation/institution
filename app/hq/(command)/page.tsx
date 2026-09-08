import { Suspense } from 'react'

import Link from 'next/link'

import { Building2, FileCheck2, FileText, GraduationCap, ShieldAlert, Users } from 'lucide-react'

import { ActivityTimeline, formatDate } from '@/components/hq/activity-timeline'
import { EcosystemGraph } from '@/components/hq/ecosystem-graph'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState, StatSkeleton } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { humaniseEnum } from '@/lib/constants/enums'
import { getHqOverview, getRecentActivity, getRecentApplications } from '@/services/hq/overview'

export const metadata = { title: 'Overview' }

/**
 * The HQ command centre.
 *
 * Answers, in order: what needs attention, how large is the network, and what
 * just happened. Every figure is counted in PostgreSQL — there is no constant
 * on this page.
 *
 * Each region streams inside its own `Suspense` boundary, so the shell and
 * headings paint immediately and a slow count never blocks the rest of the
 * screen.
 */
export default function HqOverviewPage() {
  return (
    <>
      <PageHeader
        eyebrow="Aero Federation of India"
        title="Command Centre"
        description="Federation-wide oversight of institutions, applications, people and platform activity."
        actions={
          <Button asChild size="sm">
            <Link href="/hq/applications?status=SUBMITTED">Review applications</Link>
          </Button>
        }
      />

      <Suspense fallback={<StatSkeleton />}>
        <OverviewMetrics />
      </Suspense>

      <Suspense fallback={<Skeleton className="h-[420px] w-full rounded-lg" />}>
        <Topology />
      </Suspense>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
          <ApplicationQueue />
        </Suspense>

        <Suspense fallback={<Skeleton className="h-72 w-full rounded-lg" />}>
          <RecentActivity />
        </Suspense>
      </div>
    </>
  )
}

async function OverviewMetrics() {
  const overview = await getHqOverview()

  return (
    <div className="flex flex-col gap-4">
      <StatGrid>
        <StatCard
          label="Institutions"
          value={overview.institutions.total}
          hint={`${overview.institutions.active.toLocaleString('en-IN')} active`}
          icon={Building2}
          href="/hq/institutions"
        />
        <StatCard
          label="Open applications"
          value={overview.applications.open}
          hint={
            overview.applications.open > 0 ? 'Awaiting an HQ decision' : 'Nothing awaiting review'
          }
          icon={FileCheck2}
          href="/hq/applications"
          tone={overview.applications.open > 0 ? 'attention' : 'default'}
        />
        <StatCard
          label="Teachers"
          value={overview.people.teachers}
          hint={`${overview.people.activeTeachers.toLocaleString('en-IN')} active`}
          icon={Users}
          href="/hq/teachers"
        />
        <StatCard
          label="Students"
          value={overview.people.students}
          hint={`${overview.people.activeStudents.toLocaleString('en-IN')} active`}
          icon={GraduationCap}
          href="/hq/students"
        />
      </StatGrid>

      <StatGrid>
        <StatCard
          label="Suspended institutions"
          value={overview.institutions.suspended}
          hint={
            overview.institutions.suspended > 0
              ? 'Access revoked federation-wide'
              : 'None suspended'
          }
          icon={ShieldAlert}
          tone={overview.institutions.suspended > 0 ? 'attention' : 'default'}
          href="/hq/institutions?status=SUSPENDED"
        />
        <StatCard
          label="Awaiting applicant"
          value={overview.applications.awaitingApplicant}
          hint="Documents or resubmission requested"
          icon={FileCheck2}
          href="/hq/applications?status=DOCUMENTS_REQUIRED"
        />
        <StatCard
          label="Documents pending review"
          value={overview.documents.pending}
          hint={`${overview.documents.total.toLocaleString('en-IN')} submitted in total`}
          icon={FileText}
          href="/hq/documents?status=PENDING"
          tone={overview.documents.pending > 0 ? 'attention' : 'default'}
        />
        <StatCard
          label="Audited events · 7 days"
          value={overview.activity.auditEventsLast7Days}
          hint="Append-only security record"
          icon={ShieldAlert}
          href="/hq/audit-logs"
        />
      </StatGrid>
    </div>
  )
}

async function Topology() {
  const overview = await getHqOverview()

  return (
    <EcosystemGraph
      institutions={overview.institutions.total}
      activeInstitutions={overview.institutions.active}
      teachers={overview.people.teachers}
      students={overview.people.students}
    />
  )
}

async function ApplicationQueue() {
  const applications = await getRecentApplications(6)

  return (
    <Section
      title="Application queue"
      description="Most recent institution applications across the federation."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/hq/applications">View all</Link>
        </Button>
      }
    >
      {applications.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title="No applications yet"
          description="Institutions that apply through the public site appear here for review."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/apply">View the public application form</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {applications.map((application) => (
            <li key={application.id}>
              <Link
                href={`/hq/applications/${application.id}`}
                className="flex flex-wrap items-center gap-3 p-4 transition-colors hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{application.institution_name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{application.application_ref}</span>
                    {' · '}
                    {humaniseEnum(application.institution_type)}
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(application.submitted_at ?? application.created_at)}
                </span>
                <StatusBadge status={application.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

async function RecentActivity() {
  const events = await getRecentActivity(8)

  return (
    <Section
      title="Platform activity"
      description="Latest entries in the audit record."
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/hq/audit-logs">Audit centre</Link>
        </Button>
      }
    >
      <div className="rounded-lg border bg-card p-5">
        <ActivityTimeline events={events} />
      </div>
    </Section>
  )
}
