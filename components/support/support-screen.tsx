import { LifeBuoy } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  CloseTicketButton,
  RaiseTicketDialog,
  TicketThread,
} from '@/components/support/support-forms'
import { requireTenant } from '@/lib/auth/session'
import { humaniseEnum } from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import { getTicket, listMyTickets } from '@/services/support'

/**
 * The support screen, shared by administrators, teachers and students.
 *
 * One component for all three because the capability is identical: raise a
 * query to HQ, read the replies, close it. The differences between those roles
 * are decided by the database — `tickets_select` returns a person their own
 * tickets whatever workspace they are standing in — so three copies of this
 * would be three places for that to drift.
 */

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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function SupportScreen({
  eyebrow,
  homeHref,
  openTicketId,
}: {
  eyebrow: string
  homeHref: string
  openTicketId: string | null
}) {
  const session = await requireTenant()
  // An administrator is the institution; there is nobody else for them to ask.
  const canChooseAudience = session.role !== 'INSTITUTION_ADMIN'
  const tickets = await listMyTickets()

  /*
   * An id from the query string is honoured only if it appears in this
   * person's own list. The database would refuse it anyway; resolving it here
   * means an unrecognised id shows the list rather than an empty thread.
   */
  const active = openTicketId && tickets.some((t) => t.id === openTicketId) ? openTicketId : null
  const detail = active ? await getTicket(active) : null

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={eyebrow}
        title="Support"
        description={
          canChooseAudience
            ? 'Raise a query with your institution, or with AFI headquarters. A query to HQ cannot be read by your institution.'
            : "Raise a query with AFI headquarters."
        }
        breadcrumbs={[{ label: eyebrow, href: homeHref }, { label: 'Support' }]}
        actions={<RaiseTicketDialog canChooseAudience={canChooseAudience} />}
      />

      {detail ? (
        <Section
          title={detail.ticket.subject}
          description={`${detail.ticket.reference} · raised ${formatWhen(detail.ticket.created_at)}`}
          actions={
            detail.ticket.status !== 'CLOSED' ? (
              <CloseTicketButton ticketId={detail.ticket.id} />
            ) : null
          }
        >
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.ticket.status} size="sm" />
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px]',
                  PRIORITY_STYLE[detail.ticket.priority] ?? PRIORITY_STYLE.NORMAL,
                )}
              >
                {humaniseEnum(detail.ticket.priority)}
              </span>
              <span className="text-muted-foreground text-xs">
                {humaniseEnum(detail.ticket.category)} ·{' '}
                {detail.ticket.raised_to === 'HQ' ? 'sent to AEROFEDERATION HEAD QUARTERS' : 'sent to your institution'}
              </span>
            </div>

            <div className="bg-card rounded-lg border p-4">
              <p className="text-sm whitespace-pre-wrap">{detail.ticket.body}</p>
            </div>

            <TicketThread
              ticketId={detail.ticket.id}
              messages={detail.messages}
              viewerId={session.userId}
              canReply={detail.ticket.status !== 'CLOSED'}
              handlerName={
                detail.ticket.raised_to === 'HQ'
                  ? 'AEROFEDERATION HEAD QUARTERS'
                  : (detail.ticket.institutions?.name ?? 'Your institution')
              }
            />
          </div>
        </Section>
      ) : null}

      <Section
        title="Your queries"
        description="Everything you have raised, newest activity first."
      >
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="No queries raised"
            description="If something is wrong — you cannot sign in, a record about you is incorrect, something is broken — raise it here and AEROFEDERATION HEAD QUARTERS will pick it up."
            action={<RaiseTicketDialog canChooseAudience={canChooseAudience} />}
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
                    {ticket.raised_to === 'HQ' ? 'To AEROFEDERATION HEAD QUARTERS' : 'To my institution'} ·{' '}
                    {humaniseEnum(ticket.category)} ·{' '}
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

                <a
                  href={`?ticket=${ticket.id}`}
                  className="text-primary shrink-0 text-sm hover:underline"
                >
                  {active === ticket.id ? 'Open' : 'View'}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
