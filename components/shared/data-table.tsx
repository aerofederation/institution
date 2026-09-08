import Link from 'next/link'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

/**
 * Server-rendered data table.
 *
 * Deliberately not a client-side table library. Every HQ list is paginated in
 * PostgreSQL and rendered on the server, so sorting, filtering and paging are
 * URL state — which means they survive a refresh, can be linked to a colleague,
 * and never ship a row of data the viewer is not allowed to see. A client table
 * would have to receive the whole set to filter it.
 *
 * Below `md` the table becomes a stack of cards. Columns opt in with
 * `primary`/`secondary` so the card shows a meaningful title and subtitle
 * rather than a squashed grid.
 */

export type Column<T> = {
  /** Stable key, also used as the React key. */
  id: string
  header: string
  cell: (row: T) => React.ReactNode
  /** Extra classes for the cell and header (alignment, width). */
  className?: string
  /** Hide on narrower viewports; the card layout still shows it as a field. */
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  /** Shown as the card title on mobile. Exactly one column should set this. */
  primary?: boolean
  /** Shown under the title on mobile. */
  secondary?: boolean
  /** Right-aligned action cell; suppressed from the mobile field list. */
  action?: boolean
}

const HIDE_CLASS = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowHref,
  caption,
  className,
}: {
  columns: Column<T>[]
  rows: T[]
  getRowKey: (row: T) => string
  /** Makes the whole row navigable; the row also gets a keyboard-reachable link. */
  getRowHref?: (row: T) => string
  /** Screen-reader description of what the table contains. */
  caption: string
  className?: string
}) {
  const primary = columns.find((column) => column.primary) ?? columns[0]
  const secondary = columns.find((column) => column.secondary)
  const fields = columns.filter(
    (column) => column !== primary && column !== secondary && !column.action,
  )
  const actions = columns.filter((column) => column.action)

  return (
    <>
      {/* ── Table, md and up ─────────────────────────────────────────────── */}
      <div className={cn('hidden overflow-hidden rounded-lg border md:block', className)}>
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">{caption}</caption>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    scope="col"
                    className={cn(
                      'text-muted-foreground h-10 text-xs font-medium tracking-wide whitespace-nowrap uppercase',
                      column.action && 'text-right',
                      column.hideBelow && HIDE_CLASS[column.hideBelow],
                      column.className,
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={getRowKey(row)} className="group">
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        'py-3 align-middle',
                        column.action && 'text-right',
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                        column.className,
                      )}
                    >
                      {column === primary && getRowHref ? (
                        <Link
                          href={getRowHref(row)}
                          className="hover:text-primary font-medium underline-offset-4 hover:underline"
                        >
                          {column.cell(row)}
                        </Link>
                      ) : (
                        column.cell(row)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ── Cards, below md ──────────────────────────────────────────────── */}
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowKey(row)} className="bg-card rounded-lg border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="font-heading truncate font-semibold">
                  {getRowHref ? (
                    <Link href={getRowHref(row)} className="underline-offset-4 hover:underline">
                      {primary.cell(row)}
                    </Link>
                  ) : (
                    primary.cell(row)
                  )}
                </div>
                {secondary ? (
                  <div className="text-muted-foreground truncate text-sm">
                    {secondary.cell(row)}
                  </div>
                ) : null}
              </div>
              {actions.length ? (
                <div className="flex shrink-0 gap-1">
                  {actions.map((column) => (
                    <span key={column.id}>{column.cell(row)}</span>
                  ))}
                </div>
              ) : null}
            </div>

            {fields.length ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3">
                {fields.map((column) => (
                  <div key={column.id} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">
                      {column.header}
                    </dt>
                    <dd className="truncate text-sm">{column.cell(row)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}

/**
 * Link-based pagination.
 *
 * Anchors rather than buttons so pages are shareable and the browser's back
 * button behaves. `baseParams` carries the current search and filters forward,
 * which is the bug this component exists to prevent — paging that silently
 * drops the filter you just applied.
 */
export function TablePagination({
  page,
  pageSize,
  total,
  basePath,
  baseParams,
}: {
  page: number
  pageSize: number
  total: number
  basePath: string
  baseParams?: Record<string, string | undefined>
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const hrefFor = (target: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(baseParams ?? {})) {
      if (value) params.set(key, value)
    }
    if (target > 1) params.set('page', String(target))
    const query = params.toString()
    return query ? `${basePath}?${query}` : basePath
  }

  if (total === 0) return null

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-muted-foreground text-sm">
        Showing <span className="afi-metric text-foreground">{from.toLocaleString('en-IN')}</span>–
        <span className="afi-metric text-foreground">{to.toLocaleString('en-IN')}</span> of{' '}
        <span className="afi-metric text-foreground">{total.toLocaleString('en-IN')}</span>
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          asChild={page > 1}
          disabled={page <= 1}
          aria-disabled={page <= 1}
        >
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} rel="prev">
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span>
              <ChevronLeft className="size-4" aria-hidden="true" />
              Previous
            </span>
          )}
        </Button>

        <span className="text-muted-foreground px-1 text-sm">
          Page <span className="afi-metric text-foreground">{page}</span> of{' '}
          <span className="afi-metric text-foreground">{pageCount}</span>
        </span>

        <Button
          variant="outline"
          size="sm"
          asChild={page < pageCount}
          disabled={page >= pageCount}
          aria-disabled={page >= pageCount}
        >
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} rel="next">
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span>
              Next
              <ChevronRight className="size-4" aria-hidden="true" />
            </span>
          )}
        </Button>
      </div>
    </nav>
  )
}
