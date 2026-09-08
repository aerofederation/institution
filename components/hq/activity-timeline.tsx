import { Activity } from 'lucide-react'

import { EmptyState } from '@/components/shared/states'
import { cn } from '@/lib/utils'

export type ActivityEvent = {
  id: string
  action: string
  entity_type: string
  entity_id: string | null
  actor_email: string | null
  actor_role: string | null
  created_at: string
}

/**
 * Recent audited actions.
 *
 * Reads straight from `audit_logs`, which is append-only at the database level
 * — there are no UPDATE or DELETE policies on that table for any role — so this
 * is a record of what happened rather than a summary someone can revise.
 */
export function ActivityTimeline({
  events,
  className,
}: {
  events: ActivityEvent[]
  className?: string
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No recorded activity yet"
        description="Sign-ins, application decisions and administrative changes appear here as they happen."
      />
    )
  }

  return (
    <ol className={cn('flex flex-col', className)}>
      {events.map((event, index) => (
        <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
          {/* Connector, omitted on the final item so the line does not dangle. */}
          {index < events.length - 1 ? (
            <span
              className="bg-border absolute top-6 bottom-0 left-[7px] w-px"
              aria-hidden="true"
            />
          ) : null}

          <span
            className={cn(
              'mt-1.5 size-3.5 shrink-0 rounded-full border-2',
              toneFor(event.action),
            )}
            aria-hidden="true"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-sm font-medium">{humaniseAction(event.action)}</p>
            <p className="text-muted-foreground truncate text-xs">
              {event.actor_email ?? 'System'}
              {event.actor_role ? ` · ${event.actor_role.replace(/_/g, ' ').toLowerCase()}` : ''}
              {' · '}
              <span className="font-mono">{event.entity_type}</span>
            </p>
          </div>

          <time
            dateTime={event.created_at}
            className="text-muted-foreground shrink-0 font-mono text-[11px]"
            title={new Date(event.created_at).toLocaleString('en-IN')}
          >
            {relativeTime(event.created_at)}
          </time>
        </li>
      ))}
    </ol>
  )
}

function toneFor(action: string) {
  if (/FAIL|REJECT|BLOCK|DENIED|SUSPEND/i.test(action)) {
    return 'border-destructive bg-destructive/25'
  }
  if (/APPROV|ACTIVAT|SUCCE|CREATED|PROVISION/i.test(action)) {
    return 'border-success bg-success/25'
  }
  return 'border-primary bg-primary/25'
}

/** `INSTITUTION_APPROVED` → `Institution approved`. */
export function humaniseAction(action: string) {
  const words = action.toLowerCase().replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Compact relative time. Absolute time stays in the `title` and `dateTime`
 * attributes so precision is never actually lost.
 */
export function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  const seconds = Math.round((Date.now() - then) / 1000)

  if (!Number.isFinite(seconds)) return '—'
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`

  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** Shared date formatter for tables. */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
