import { cn } from '@/lib/utils'

/**
 * Status presentation, defined once.
 *
 * Every status the platform shows is one of a handful of *meanings* — settled,
 * in progress, waiting on someone, stopped, ended. Mapping each database enum
 * onto that small set here is what keeps `APPROVED`, `ACTIVE` and `VERIFIED`
 * looking like the same idea across four different tables, instead of three
 * developers picking three greens.
 */

type Tone = 'neutral' | 'positive' | 'progress' | 'attention' | 'critical' | 'dormant'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground ring-border',
  positive: 'bg-success/10 text-success ring-success/25',
  progress: 'bg-info/10 text-info ring-info/25',
  attention: 'bg-warning/12 text-warning ring-warning/30',
  critical: 'bg-destructive/10 text-destructive ring-destructive/25',
  dormant: 'bg-muted/60 text-muted-foreground/70 ring-border/60',
}

/**
 * Database value → tone and human label.
 *
 * Labels are title case rather than SCREAMING_SNAKE: the enum is an
 * implementation detail and a reviewer should not have to read one.
 */
const STATUS: Record<string, { tone: Tone; label: string }> = {
  // Institutions
  PENDING: { tone: 'attention', label: 'Pending' },
  ACTIVE: { tone: 'positive', label: 'Active' },
  SUSPENDED: { tone: 'critical', label: 'Suspended' },
  DEACTIVATED: { tone: 'dormant', label: 'Deactivated' },

  // Accounts
  INVITED: { tone: 'progress', label: 'Invited' },

  // Applications
  DRAFT: { tone: 'neutral', label: 'Draft' },
  SUBMITTED: { tone: 'progress', label: 'Submitted' },
  UNDER_REVIEW: { tone: 'progress', label: 'Under review' },
  DOCUMENTS_REQUIRED: { tone: 'attention', label: 'Documents required' },
  RESUBMISSION_REQUIRED: { tone: 'attention', label: 'Resubmission required' },
  APPROVED: { tone: 'positive', label: 'Approved' },
  REJECTED: { tone: 'critical', label: 'Rejected' },

  // Documents
  VERIFIED: { tone: 'positive', label: 'Verified' },

  // Academic records
  INACTIVE: { tone: 'dormant', label: 'Inactive' },
  ARCHIVED: { tone: 'dormant', label: 'Archived' },
  UPCOMING: { tone: 'progress', label: 'Upcoming' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
  WITHDRAWN: { tone: 'dormant', label: 'Withdrawn' },
  TRANSFERRED: { tone: 'neutral', label: 'Transferred' },
}

function humanise(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word, index) => (index === 0 ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export function StatusBadge({
  status,
  className,
  size = 'default',
}: {
  status: string | null | undefined
  className?: string
  size?: 'default' | 'sm'
}) {
  if (!status) {
    return <span className="text-muted-foreground text-sm">—</span>
  }

  // An unmapped status still renders legibly rather than crashing or showing
  // raw SCREAMING_SNAKE — new enum values appear before this map is updated.
  const entry = STATUS[status] ?? { tone: 'neutral' as Tone, label: humanise(status) }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        TONE_CLASS[entry.tone],
        className,
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
        aria-hidden="true"
      />
      {entry.label}
    </span>
  )
}

/** The same vocabulary as plain text, for dense table cells and CSV-like views. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return STATUS[status]?.label ?? humanise(status)
}
