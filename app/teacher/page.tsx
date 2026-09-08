import Link from 'next/link'

import {
  ClipboardList,
  FileText,
  GraduationCap,
  ListChecks,
  Network,
  TriangleAlert,
} from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { requireTenant } from '@/lib/auth/session'
import { getAssessmentDigest, getTeacherOverview, listOwnClasses } from '@/services/teacher/overview'

export const metadata = { title: 'Overview' }

export default async function TeacherOverviewPage() {
  const session = await requireTenant()
  const [overview, classes, digest] = await Promise.all([
    getTeacherOverview(),
    listOwnClasses(),
    getAssessmentDigest(),
  ])

  const awaiting = overview.assessments.awaitingMarking

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={session.institutionName ?? undefined}
        title={`Welcome, ${session.fullName.split(' ')[0]}`}
        description="Everything here is yours alone — your classes, your material, your marking."
      />

      <Section
        title="Assessments"
        description="Your papers and what they need."
        actions={
          <Button asChild size="sm" variant="outline">
            <Link href="/teacher/assessments">All assessments</Link>
          </Button>
        }
      >
        <StatGrid columns={3}>
          <StatCard
            label="Drafts"
            value={digest.drafts}
            hint={digest.drafts > 0 ? 'Not visible to students' : 'Nothing in progress'}
            icon={ClipboardList}
            href="/teacher/assessments?bucket=drafts"
          />
          <StatCard
            label="Scheduled"
            value={digest.scheduled}
            hint="Published, waiting to open"
            icon={ListChecks}
            href="/teacher/assessments?bucket=scheduled"
          />
          <StatCard
            label="Active now"
            value={digest.active}
            hint="Students can sit these"
            icon={ListChecks}
            href="/teacher/assessments?bucket=active"
          />
          <StatCard
            label="Pending grading"
            value={digest.pendingGrading}
            hint={
              digest.pendingGrading > 0
                ? `${digest.pendingGrading} submission${digest.pendingGrading === 1 ? '' : 's'} waiting on you`
                : 'Nothing waiting'
            }
            icon={TriangleAlert}
            tone={digest.pendingGrading > 0 ? 'attention' : 'default'}
            href="/teacher/assessments?bucket=grading"
          />
        </StatGrid>

        {digest.needsGrading.length > 0 || digest.upcoming.length > 0 || digest.recentResults.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <DigestList
              title="Needs grading"
              empty="Nothing waiting on you."
              items={digest.needsGrading.map((item) => ({
                id: item.id,
                href: `/teacher/assessments/${item.id}/grading`,
                primary: item.title,
                secondary: `${item.outstanding} paper${item.outstanding === 1 ? '' : 's'} to mark`,
              }))}
            />
            <DigestList
              title="Upcoming and active"
              empty="Nothing scheduled."
              items={digest.upcoming.map((item) => ({
                id: item.id,
                href: `/teacher/assessments/${item.id}`,
                primary: item.title,
                secondary: [
                  item.className,
                  item.closes_at
                    ? `closes ${new Date(item.closes_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
            <DigestList
              title="Recent results"
              empty="No results yet."
              items={digest.recentResults.map((item) => ({
                id: item.id,
                href: `/teacher/assessments/${item.id}/results`,
                primary: item.title,
                secondary: `${item.submitted} marked · ${item.averagePercent}% average`,
              }))}
            />
          </div>
        ) : null}
      </Section>

      {/*
       * Without a class assignment a teacher can publish nothing: the RLS
       * WITH CHECK on every content table calls `private.teaches_class()`.
       * Saying so here is better than letting them write a lesson and be
       * refused at the last step.
       */}
      {classes.length === 0 ? (
        <div className="border-warning/40 bg-warning/10 flex items-start gap-3 rounded-lg border p-5">
          <TriangleAlert className="text-warning mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">You are not assigned to any class yet</p>
            <p className="text-muted-foreground text-sm">
              Study material and assessments are published to a class, so your institution
              administrator needs to assign you to one before you can create anything. Your account
              is otherwise ready.
            </p>
          </div>
        </div>
      ) : null}

      <StatGrid columns={4}>
        <StatCard
          label="Study materials"
          value={overview.materials.total}
          hint={`${overview.materials.published} published`}
          icon={FileText}
          href="/teacher/materials"
        />
        <StatCard
          label="Assignments & tests"
          value={overview.assessments.total}
          hint={`${overview.assessments.published} published`}
          icon={ListChecks}
          href="/teacher/assessments"
        />
        <StatCard
          label="Awaiting marking"
          value={awaiting}
          hint={
            awaiting > 0
              ? `${awaiting} ${awaiting === 1 ? 'paper' : 'papers'} to mark`
              : 'Nothing waiting on you'
          }
          icon={TriangleAlert}
          tone={awaiting > 0 ? 'attention' : 'default'}
          href={awaiting > 0 ? '/teacher/assessments' : undefined}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="My classes"
          description="Where you are assigned to teach. You can publish to these and no others."
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/teacher/classes">View all</Link>
            </Button>
          }
        >
          {classes.length === 0 ? (
            <EmptyState
              icon={Network}
              title="No classes assigned"
              description="Ask your institution administrator to assign you to a class. Once they do, it appears here and you can start publishing."
            />
          ) : (
            <ul className="divide-border bg-card divide-y rounded-lg border">
              {classes.slice(0, 6).map((assignment) => (
                <li key={assignment.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">
                      {assignment.classes?.name ?? 'Class'}
                      {assignment.sections?.name ? (
                        <span className="text-muted-foreground"> · {assignment.sections.name}</span>
                      ) : null}
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
        </Section>

        <Section title="Quick actions" description="What you publish, and who to.">
          <div className="flex flex-col gap-2">
            <ActionLink
              href="/teacher/materials"
              icon={<FileText className="size-4" aria-hidden="true" />}
              label="Publish study material"
              hint="A file, a link, or a written note"
            />
            <ActionLink
              href="/teacher/assessments"
              icon={<ListChecks className="size-4" aria-hidden="true" />}
              label="Set an assignment, quiz or test"
              hint="One builder for all of them — the kind sets the defaults"
            />
            <ActionLink
              href="/teacher/students"
              icon={<GraduationCap className="size-4" aria-hidden="true" />}
              label={`My students (${overview.students})`}
              hint="Only the students in your classes"
            />
          </div>
        </Section>
      </div>
    </div>
  )
}

function ActionLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="hover:border-primary/40 hover:bg-primary/5 bg-card flex items-center gap-3 rounded-lg border p-3.5 transition-colors"
    >
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
        {icon}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-muted-foreground truncate text-xs">{hint}</span>
      </span>
    </Link>
  )
}


/**
 * One column of the assessment strip.
 *
 * Says "nothing" rather than rendering an empty box — a teacher should be able
 * to tell at a glance that there is genuinely nothing waiting, not that
 * something failed to load.
 */
function DigestList({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: { id: string; href: string; primary: string; secondary: string }[]
}) {
  return (
    <div className="bg-card flex flex-col gap-2 rounded-lg border p-4">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-xs">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-0.5">
              <Link href={item.href} className="truncate text-sm hover:underline">
                {item.primary}
              </Link>
              <span className="text-muted-foreground truncate text-xs">{item.secondary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
