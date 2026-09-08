import Link from 'next/link'

import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { cn } from '@/lib/utils'

/**
 * A single headline metric.
 *
 * `value` is always a number the caller counted in the database — there is no
 * default and no placeholder, so a card cannot render without one. `hint` is
 * where the card explains what it is counting, because "412" means nothing on
 * its own and a reader should never have to guess whether it includes
 * suspended records.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  href,
  trend,
  tone = 'default',
  className,
}: {
  label: string
  value: number | string
  hint?: string
  icon?: LucideIcon
  href?: string
  /** Percentage change against the previous period, if one was computed. */
  trend?: { value: number; label: string } | null
  tone?: 'default' | 'attention' | 'positive'
  className?: string
}) {
  const formatted = typeof value === 'number' ? value.toLocaleString('en-IN') : value

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="afi-eyebrow">{label}</span>
        {Icon ? (
          <Icon
            className={cn(
              'size-4 shrink-0',
              tone === 'attention'
                ? 'text-warning'
                : tone === 'positive'
                  ? 'text-success'
                  : 'text-muted-foreground',
            )}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <p className="afi-metric mt-3 text-3xl leading-none font-semibold">{formatted}</p>

      <div className="mt-2.5 flex min-h-5 items-center gap-2">
        {trend ? <TrendPill trend={trend} /> : null}
        {hint ? <span className="text-muted-foreground truncate text-xs">{hint}</span> : null}
      </div>

      {href ? (
        <span className="text-primary mt-3 inline-flex items-center gap-1 text-xs font-medium">
          View
          <ArrowRight className="size-3" aria-hidden="true" />
        </span>
      ) : null}
    </>
  )

  const shell = cn(
    'group bg-card relative flex flex-col rounded-lg border p-5 transition-colors',
    tone === 'attention' && 'border-warning/35 bg-warning/[0.04]',
    href && 'hover:border-primary/40 hover:bg-accent/40',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    )
  }

  return <div className={shell}>{body}</div>
}

function TrendPill({ trend }: { trend: { value: number; label: string } }) {
  const rising = trend.value > 0
  const flat = trend.value === 0
  const Icon = flat ? Minus : rising ? TrendingUp : TrendingDown

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium',
        flat
          ? 'bg-muted text-muted-foreground'
          : rising
            ? 'bg-success/10 text-success'
            : 'bg-destructive/10 text-destructive',
      )}
      title={trend.label}
    >
      <Icon className="size-3" aria-hidden="true" />
      <span className="afi-metric">
        {rising ? '+' : ''}
        {trend.value}
      </span>
      <span className="sr-only"> {trend.label}</span>
    </span>
  )
}

/** Responsive row of stat cards. */
export function StatGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode
  columns?: 3 | 4
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-4 sm:grid-cols-2',
        columns === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
