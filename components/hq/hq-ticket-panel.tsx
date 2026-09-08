'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import { Section } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { TicketThread } from '@/components/support/support-forms'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/validation/support'
import { triageTicket, type TicketDetail } from '@/services/support'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * One ticket, from HQ's side: the original report, the trail, and triage.
 *
 * Triage is HQ's alone. `guard_ticket_columns` refuses a priority, category or
 * assignment change from anybody else, so these controls existing is not what
 * makes them safe — the database is.
 */
export function HqTicketPanel({
  detail,
  viewerId,
}: {
  detail: TicketDetail
  viewerId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const change = (patch: Record<string, string | boolean>) =>
    startTransition(async () => {
      const result = await triageTicket({ ticket_id: detail.ticket.id, ...patch })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Ticket updated')
      router.refresh()
    })

  return (
    <Section
      title={detail.ticket.subject}
      description={`${detail.ticket.reference} · ${detail.ticket.profiles?.full_name ?? 'A member'} (${humaniseEnum(detail.ticket.raised_as)}) · ${detail.ticket.institutions?.name ?? ''}`}
      actions={<StatusBadge status={detail.ticket.status} size="sm" />}
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Status
            <select
              className={SELECT_CLASS}
              value={detail.ticket.status}
              disabled={pending}
              onChange={(event) => change({ status: event.target.value })}
            >
              {TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {humaniseEnum(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Priority
            <select
              className={SELECT_CLASS}
              value={detail.ticket.priority}
              disabled={pending}
              onChange={(event) => change({ priority: event.target.value })}
            >
              {TICKET_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {humaniseEnum(priority)}
                </option>
              ))}
            </select>
          </label>

          {detail.ticket.assigned_to === viewerId ? (
            <span className="text-muted-foreground pb-2 text-xs">Assigned to you</span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => change({ assign_to_me: true })}
            >
              Assign to me
            </Button>
          )}
        </div>

        <div className="bg-muted/40 rounded-lg border p-4">
          <p className="text-muted-foreground mb-1 text-xs">What they reported</p>
          <p className="text-sm whitespace-pre-wrap">{detail.ticket.body}</p>
        </div>

        <TicketThread
          ticketId={detail.ticket.id}
          messages={detail.messages}
          viewerId={viewerId}
          canReply={detail.ticket.status !== 'CLOSED'}
          isHandler
          handlerName={
            detail.ticket.raised_to === 'HQ'
              ? 'AEROFEDERATION HEAD QUARTERS'
              : (detail.ticket.institutions?.name ?? 'This institution')
          }
        />
      </div>
    </Section>
  )
}
