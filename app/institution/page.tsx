import Link from 'next/link'

import { CalendarDays, GraduationCap, MailWarning, Network, Users } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { requireTenant } from '@/lib/auth/session'
import { getInstitutionOverview, listRecentMembers } from '@/services/institution/overview'

export const metadata = { title: 'Overview' }

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default async function InstitutionOverviewPage() {
  const session = await requireTenant()
  const [overview, recent] = await Promise.all([getInstitutionOverview(), listRecentMembers()])

  const structureReady = overview.academics.departments > 0 && overview.academics.years > 0

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={session.institutionName ?? undefined}
        title="Operations Centre"
        description="Your institution's staff, students and academic structure."
      />

      <StatGrid columns={4}>
        <StatCard
          label="Teachers"
          value={overview.teachers.total}
          hint={`${overview.teachers.active} active · ${overview.teachers.invited} awaiting activation`}
          icon={Users}
          href="/institution/teachers"
        />
        <StatCard
          label="Students"
          value={overview.students.total}
          hint={`${overview.students.active} active · ${overview.students.invited} awaiting activation`}
          icon={GraduationCap}
          href="/institution/students"
        />
        <StatCard
          label="Classes"
          value={overview.academics.classes}
          hint={`${overview.academics.departments} departments · ${overview.academics.programs} programmes`}
          icon={Network}
          href="/institution/academics"
        />
        <StatCard
          label="Awaiting activation"
          value={overview.pendingActivations}
          hint={
            overview.pendingActivations > 0
              ? 'Invitations sent but not yet accepted'
              : 'Everyone invited has signed in'
          }
          icon={MailWarning}
          tone={overview.pendingActivations > 0 ? 'attention' : 'default'}
        />
      </StatGrid>

      {/*
       * Setup guidance appears only while it is true. A dashboard that keeps
       * telling a fully configured institution to get started is noise.
       */}
      {!structureReady ? (
        <Section
          title="Finish setting up"
          description="Teachers and students are assigned to departments and classes, so the academic structure comes first."
        >
          <div className="border-primary/25 bg-primary/5 flex flex-col gap-4 rounded-lg border p-5">
            <ol className="flex flex-col gap-3 text-sm">
              <li className="flex items-start gap-3">
                <span className="bg-primary/15 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                  1
                </span>
                <span>
                  <span className="font-medium">Create an academic year</span> — classes belong to
                  one, so nothing else can be created first.
                  {overview.academics.years > 0 ? (
                    <span className="text-success ml-2 font-mono text-[11px] uppercase">Done</span>
                  ) : null}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-primary/15 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                  2
                </span>
                <span>
                  <span className="font-medium">Add departments</span> — teachers and programmes
                  are organised by them.
                  {overview.academics.departments > 0 ? (
                    <span className="text-success ml-2 font-mono text-[11px] uppercase">Done</span>
                  ) : null}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="bg-primary/15 text-primary mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                  3
                </span>
                <span>
                  <span className="font-medium">Invite teachers and enrol students</span> — each
                  receives an activation link to set their own password.
                </span>
              </li>
            </ol>

            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/institution/academics">Set up academic structure</Link>
              </Button>
            </div>
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Section
          title="Recently added"
          description="The most recent teacher and student accounts."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/institution/teachers">All teachers</Link>
            </Button>
          }
        >
          {recent.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nobody added yet"
              description="Teachers and students you add will appear here, along with whether they have activated their account."
              action={
                <Button asChild size="sm">
                  <Link href="/institution/teachers">Add a teacher</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-border bg-card divide-y rounded-lg border">
              {recent.map((member) => (
                <li key={member.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{member.full_name}</span>
                    <span className="text-muted-foreground truncate text-xs">{member.email}</span>
                  </div>
                  <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wide uppercase">
                    {humaniseEnum(member.role)}
                  </span>
                  <StatusBadge status={member.status} size="sm" />
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Academic year" description="The year new classes default to.">
          {overview.currentYear ? (
            <div className="bg-card flex flex-col gap-3 rounded-lg border p-5">
              <div className="flex items-center gap-2.5">
                <CalendarDays className="text-primary size-5 shrink-0" aria-hidden="true" />
                <span className="font-heading text-lg font-semibold">
                  {overview.currentYear.name}
                </span>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                    Starts
                  </dt>
                  <dd>{formatDate(overview.currentYear.starts_on)}</dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                    Ends
                  </dt>
                  <dd>{formatDate(overview.currentYear.ends_on)}</dd>
                </div>
              </dl>
            </div>
          ) : (
            <EmptyState
              icon={CalendarDays}
              title="No current academic year"
              description="Mark one year as current and new classes will default to it."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/institution/academics">Manage years</Link>
                </Button>
              }
            />
          )}
        </Section>
      </div>
    </div>
  )
}
