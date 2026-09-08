import Link from 'next/link'

import { Bell, CalendarClock, CheckCircle2, FileText, ListChecks } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { NotificationList } from '@/components/student/notification-list'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { requireTenant } from '@/lib/auth/session'
import { listAssessmentsForStudent, listMaterialsForStudent } from '@/services/learning'
import { listNotifications } from '@/services/notifications'

export const metadata = { title: 'Overview' }

function formatWhen(value: string | null, prefix: string) {
  if (!value) return 'No date set'
  return `${prefix} ${new Date(value).toLocaleString('en-IN', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** Soonest first; anything open-ended sits at the end. */
function bySoonest<T extends { opens_at: string | null; closes_at: string | null }>(
  key: 'opens_at' | 'closes_at',
) {
  return (a: T, b: T) => {
    const left = a[key]
    const right = b[key]
    if (!left) return right ? 1 : 0
    if (!right) return -1
    return new Date(left).getTime() - new Date(right).getTime()
  }
}

export default async function StudentOverviewPage() {
  const session = await requireTenant()
  const [materials, assessments, notifications] = await Promise.all([
    listMaterialsForStudent(),
    listAssessmentsForStudent(),
    listNotifications(6),
  ])

  /*
   * Assignments, quizzes, tests and exams are one thing with one engine — the
   * `kind` is what differs. There is no separate assignments surface, so these
   * count together and each row names its own kind.
   */
  const open = assessments.filter(
    (assessment) => assessment.bucket === 'available' || assessment.bucket === 'in_progress',
  )
  /*
   * Published, but the opening time has not arrived. Without this a student
   * cannot see that anything is coming until the morning it opens, which
   * defeats the point of setting a date in advance.
   */
  const upcoming = assessments.filter((assessment) => assessment.bucket === 'upcoming')
  const completed = assessments.filter((assessment) => assessment.bucket === 'completed')

  const dueSoon = [...open].sort(bySoonest('closes_at'))
  const comingUp = [...upcoming].sort(bySoonest('opens_at'))
  const unread = notifications.filter((item) => !item.read_at).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={session.institutionName ?? undefined}
        title={`Hello, ${session.fullName.split(' ')[0]}`}
        description="Everything your teachers have published to your class."
      />

      <StatGrid columns={4}>
        <StatCard
          label="Study materials"
          value={materials.length}
          hint="Published to your class"
          icon={FileText}
          href="/student/materials"
        />
        <StatCard
          label="To do"
          value={open.length}
          hint={open.length > 0 ? 'Open to you now' : 'Nothing outstanding'}
          icon={ListChecks}
          tone={open.length > 0 ? 'attention' : 'default'}
          href="/student/assessments"
        />
        <StatCard
          label="Upcoming"
          value={upcoming.length}
          hint={
            comingUp[0]?.opens_at
              ? formatWhen(comingUp[0].opens_at, 'Next opens')
              : 'Nothing scheduled'
          }
          icon={CalendarClock}
          href="/student/assessments"
        />
        <StatCard
          label="Completed"
          value={completed.length}
          hint="Finished or closed"
          icon={CheckCircle2}
          href="/student/assessments"
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section
            title="Due soon"
            description="Assignments, quizzes and tests you have not finished."
            actions={
              <Button asChild variant="outline" size="sm">
                <Link href="/student/assessments">View all</Link>
              </Button>
            }
          >
            {dueSoon.length === 0 ? (
              <EmptyState
                icon={ListChecks}
                title="Nothing outstanding"
                description="You have finished everything that is currently set. New work appears here."
              />
            ) : (
              <ul className="divide-border bg-card divide-y rounded-lg border">
                {dueSoon.slice(0, 5).map((assessment) => (
                  <li key={assessment.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{assessment.title}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {humaniseEnum(assessment.kind)}
                        {assessment.closes_at
                          ? ` · ${formatWhen(assessment.closes_at, 'closes')}`
                          : ' · no closing date'}
                      </span>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href="/student/assessments">
                        {assessment.bucket === 'in_progress' ? 'Resume' : 'Open'}
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Coming up" description="Set for your class, but not open yet.">
            {comingUp.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Nothing scheduled"
                description="When a teacher sets work with a future opening date, you see it here before it starts."
              />
            ) : (
              <ul className="divide-border bg-card divide-y rounded-lg border">
                {comingUp.slice(0, 5).map((assessment) => (
                  <li key={assessment.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{assessment.title}</span>
                      <span className="text-muted-foreground truncate text-xs">
                        {humaniseEnum(assessment.kind)} · {formatWhen(assessment.opens_at, 'opens')}
                        {assessment.duration_minutes ? ` · ${assessment.duration_minutes} min` : ''}
                      </span>
                    </div>
                    {/* No Open button, because it is not open. Saying so is the point. */}
                    <span className="text-muted-foreground shrink-0 text-xs">Not open yet</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section
          title="Notifications"
          description={unread > 0 ? `${unread} unread` : 'Notices addressed to you.'}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href="/student/notifications">
                <Bell className="size-4" aria-hidden="true" />
                All
              </Link>
            </Button>
          }
        >
          <NotificationList
            notifications={notifications}
            emptyHint="When a teacher publishes work to your class, you are told here."
          />
        </Section>
      </div>
    </div>
  )
}
