import Link from 'next/link'

import { ArrowUpRight, Building2, MapPin } from 'lucide-react'

import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import type { DirectoryEntry } from '@/services/public/network'

/**
 * The public institution directory.
 *
 * Renders only what `public_institution_directory()` returns — approved,
 * active institutions and a fixed set of non-sensitive columns. There is no
 * placeholder card and no example institution: an empty network shows an empty
 * state that invites an application, which is both honest and the more useful
 * thing to put in front of a visitor.
 */
export function InstitutionDirectory({
  entries,
  compact = false,
}: {
  entries: DirectoryEntry[]
  /** Homepage variant: fewer details, tighter grid. */
  compact?: boolean
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="The founding cohort is being admitted"
        description="Institutions appear here once AFI headquarters has reviewed and approved their application. No sample institutions are shown."
        action={
          <Button asChild size="sm">
            <Link href="/apply">Register your institution</Link>
          </Button>
        }
      />
    )
  }

  return (
    <ul
      className={
        compact
          ? 'grid gap-4 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
      }
    >
      {entries.map((entry) => (
        <li key={entry.slug}>
          <Link
            href={`/institutions/${entry.slug}`}
            className="group bg-card hover:border-primary/40 flex h-full flex-col gap-3 rounded-lg border p-5 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-md">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <ArrowUpRight
                className="text-muted-foreground/40 group-hover:text-primary size-4 shrink-0 transition-colors"
                aria-hidden="true"
              />
            </div>

            <div className="flex flex-col gap-1">
              <h3 className="font-heading leading-snug font-semibold">{entry.name}</h3>
              <p className="text-muted-foreground text-xs">
                {humaniseEnum(entry.institution_type)}
              </p>
            </div>

            {entry.city || entry.state ? (
              <p className="text-muted-foreground mt-auto flex items-center gap-1.5 text-xs">
                <MapPin className="size-3 shrink-0" aria-hidden="true" />
                {[entry.city, entry.state].filter(Boolean).join(', ')}
              </p>
            ) : null}

            {!compact && entry.field_of_work ? (
              <p className="text-muted-foreground border-t pt-3 text-sm">{entry.field_of_work}</p>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  )
}
