import Link from 'next/link'

import { LifeBuoy } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { HqTicketPanel } from '@/components/hq/hq-ticket-panel'
import { requireHq } from '@/lib/auth/hq'
import { humaniseEnum } from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import { getTicket, listAllTickets } from '@/services/support'

export const metadata = { title: 'Support' }

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: 'border-destructive/40 text-destructive',
  HIGH: 'border-warning/40 text-warning',
  NORMAL: 'border-border text-muted-foreground',
  LOW: 'border-border text-muted-foreground',
}

function formatWhen(value: string) {
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * The HQ support queue.
 *
 * Every ticket in the federation, because `tickets_select` has an `is_hq()`
 * branch. Nobody else has one — an institution's administrators cannot see
 * their own members' tickets, which is what makes this a channel somebody can
 * use to report a problem with their institution.
 */
export default async function HqSupportPage({ searchParams }: PageProps<'/hq/support'>) {
  const session = await requireHq('institution.read_all')
  const query = await searchParams

  const status = typeof query.status === 'string' ? query.status : undefined
  const openTicketId = typeof query.ticket === 'string' ? query.ticket : null

  const tickets = await listAllTickets({ status })
  const detail = openTicketId ? await getTicket(openTicketId) : null

  const waiting = tickets.filter((t) => t.status === 'OPEN').length
  const active = tickets.filter((t) => t.status === 'IN_PROGRESS').length
  const urgent = tickets.filter(
    (t) => t.priority === 'URGENT' && !['RESOLVED', 'CLOSED'].includes(t.status),
  ).length

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Oversight"
        title="Support"
        description="Queries raised by institution administrators, teachers and students across the federation."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Support' }]}
      />

      <StatGrid columns={4}>
        <StatCard label="Unclaimed" value={waiting} hint="Nobody has picked these up" icon={LifeBuoy} tone={waiting > 0 ? 'attention' : 'default'} />
        <StatCard label="In progress" value={active} hint="Being worked on" />
        <StatCard label="Urgent open" value={urgent} hint="Marked urgent and unresolved" tone={urgent > 0 ? 'attention' : 'default'} />
        <StatCard label="Total shown" value={tickets.length} hint={status ? humaniseEnum(status) : 'All statuses'} />
      </StatGrid>

      {detail ? (
        <HqTicketPanel detail={detail} viewerId={session.userId} />
      ) : null}

      <Section
        title="Queue"
        description="Newest activity first."
        actions={
          <div className="flex flex-wrap gap-2 text-xs">
            {[undefined, 'OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'].map(
              (value) => (
                <Link
                  key={value ?? 'all'}
                  href={value ? `/hq/support?status=${value}` : '/hq/support'}
                  className={cn(
                    'rounded-full border px-2.5 py-1',
                    (status ?? undefined) === value
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {value ? humaniseEnum(value) : 'All'}
                </Link>
              ),
            )}
          </div>
        }
      >
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Nothing in the queue"
            description="Queries raised by anybody in the federation appear here."
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{ticket.subject}</span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {ticket.reference}
                    </span>
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {ticket.profiles?.full_name ?? 'A member'} ·{' '}
                    {humaniseEnum(ticket.raised_as)} · {ticket.institutions?.name ?? 'Institution'} ·{' '}
                    {ticket.last_reply_at
                      ? `last reply ${formatWhen(ticket.last_reply_at)}`
                      : `raised ${formatWhen(ticket.created_at)}`}
                  </span>
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2 py-0.5 text-[11px]',
                    PRIORITY_STYLE[ticket.priority] ?? PRIORITY_STYLE.NORMAL,
                  )}
                >
                  {humaniseEnum(ticket.priority)}
                </span>
                <StatusBadge status={ticket.status} size="sm" />

                <Link
                  href={`/hq/support?ticket=${ticket.id}${status ? `&status=${status}` : ''}`}
                  className="text-primary shrink-0 text-sm hover:underline"
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
