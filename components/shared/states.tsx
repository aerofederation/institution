import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * The four states every data surface owes its reader.
 *
 * They live together because they are one decision, not four: a page that has
 * a beautiful loaded state and a bare "no results" line is not finished. Each
 * of these says what happened, why, and what to do next — an empty table that
 * offers no next action is a dead end, not an empty state.
 */

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center',
        className,
      )}
    >
      <span className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-base font-semibold">{title}</p>
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  retry,
  className,
}: {
  title?: string
  description: string
  /** A Server Action or client handler that re-runs the failed work. */
  retry?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'border-destructive/30 bg-destructive/5 flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-12 text-center',
        className,
      )}
    >
      <span className="bg-destructive/10 text-destructive flex size-11 items-center justify-center rounded-full">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-heading text-base font-semibold">{title}</p>
        {/* Always the safe public message — never a database or stack detail. */}
        <p className="text-muted-foreground mx-auto max-w-sm text-sm">{description}</p>
      </div>
      {retry ? <div className="mt-2">{retry}</div> : null}
    </div>
  )
}

export function LoadingState({
  label = 'Loading',
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'text-muted-foreground flex items-center justify-center gap-2.5 py-12 text-sm',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}…
    </div>
  )
}

/** Table-shaped skeleton, so the page does not reflow when data arrives. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border" aria-hidden="true">
      <div className="bg-muted/40 flex gap-4 border-b px-4 py-3">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4 border-b px-4 py-4 last:border-b-0">
          {Array.from({ length: columns }).map((_, column) => (
            <Skeleton key={column} className={cn('h-4 flex-1', column === 0 && 'max-w-[40%]')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-lg border p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

/**
 * For a surface whose backing tables land in a later phase.
 *
 * Used instead of inventing data. It names the phase so the reader knows this
 * is sequencing rather than breakage — the brief is explicit that a feature
 * which does not work must say so rather than pretend.
 */
export function ComingSoon({
  title,
  description,
  phase,
  icon: Icon = Inbox,
  action,
}: {
  title: string
  description: string
  phase?: string
  icon?: LucideIcon
  action?: React.ReactNode
}) {
  return (
    <div className="bg-muted/20 flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-6 py-16 text-center">
      <span className="border-border bg-background text-muted-foreground flex size-12 items-center justify-center rounded-full border">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col items-center gap-2">
        <span className="afi-eyebrow">Coming soon{phase ? ` · ${phase}` : ''}</span>
        <p className="font-heading text-lg font-semibold">{title}</p>
        <p className="text-muted-foreground max-w-md text-sm">{description}</p>
      </div>
      {action}
    </div>
  )
}

/** Convenience retry button for `ErrorState`, used from Client error boundaries. */
export function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onRetry}>
      Try again
    </Button>
  )
}
