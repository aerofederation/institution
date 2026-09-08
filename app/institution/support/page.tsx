import Link from 'next/link'

import { LifeBuoy } from 'lucide-react'

import { HqTicketPanel } from '@/components/hq/hq-ticket-panel'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { SupportScreen } from '@/components/support/support-screen'
import { requireTenant } from '@/lib/auth/session'
import { humaniseEnum } from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import { getTicket, listInstitutionTickets } from '@/services/support'

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
 * Two things on one page, because an administrator does both.
 *
 * The queue is what their own teachers and students have raised to them. Below
 * it, the same support screen everybody else gets — because an administrator
 * also needs to raise things, and theirs go to HQ.
 *
 * What is NOT here is any sight of a member's ticket to HQ. `tickets_select`
 * admits an administrator only to `raised_to = 'INSTITUTION'` rows, so a
 * complaint about this institution never appears in this queue.
 */
export default async function InstitutionSupportPage({
  searchParams,
}: PageProps<'/institution/support'>) {
  const session = await requireTenant()
  const query = await searchParams

  const status = typeof query.status === 'string' ? query.status : undefined
  const openTicketId = typeof query.ticket === 'string' ? query.ticket : null

  const queue = await listInstitutionTickets({ status })

  // Only open the panel for a ticket that is actually in this queue; the
  // raiser's own tickets are opened by the screen below instead.
  const handling = openTicketId && queue.some((t) => t.id === openTicketId) ? openTicketId : null
  const detail = handling ? await getTicket(handling) : null

  const unclaimed = queue.filter((t) => t.status === 'OPEN').length
  const active = queue.filter((t) => t.status === 'IN_PROGRESS').length

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Institution"
          title="Support queue"
          description="Issues your teachers and students have raised to you."
          breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Support' }]}
        />

        <StatGrid columns={3}>
          <StatCard
            label="Unclaimed"
            value={unclaimed}
            hint="Nobody has picked these up"
            icon={LifeBuoy}
            tone={unclaimed > 0 ? 'attention' : 'default'}
          />
          <StatCard label="In progress" value={active} hint="Being worked on" />
          <StatCard
            label="Total shown"
            value={queue.length}
            hint={status ? humaniseEnum(status) : 'All statuses'}
          />
        </StatGrid>

        {detail ? <HqTicketPanel detail={detail} viewerId={session.userId} /> : null}

        <Section
          title="Raised to you"
          description="Newest activity first."
          actions={
            <div className="flex flex-wrap gap-2 text-xs">
              {[undefined, 'OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'RESOLVED', 'CLOSED'].map(
                (value) => (
                  <Link
                    key={value ?? 'all'}
                    href={value ? `/institution/support?status=${value}` : '/institution/support'}
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
          {queue.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="Nothing raised to you"
              description="When a teacher or student raises an issue with your institution, it appears here."
            />
          ) : (
            <ul className="divide-border bg-card divide-y rounded-lg border">
              {queue.map((ticket) => (
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
                      {humaniseEnum(ticket.raised_as)} ·{' '}
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
                    href={`/institution/support?ticket=${ticket.id}${status ? `&status=${status}` : ''}`}
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

      {/* The administrator's own queries, which go to HQ. */}
      <div className="border-t pt-10">
        <SupportScreen eyebrow="Institution" homeHref="/institution" openTicketId={openTicketId} />
      </div>
    </div>
  )
}
