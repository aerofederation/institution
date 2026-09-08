import { Fragment } from 'react'

import Link from 'next/link'

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { cn } from '@/lib/utils'

export type Crumb = { label: string; href?: string }

/**
 * The top of every HQ page: where you are, what this is, what you can do.
 *
 * Defined once so that heading level, spacing and action placement are
 * consistent across fifteen screens. `h1` is always here and always the only
 * one on the page, which is what makes the heading outline navigable.
 */
export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
  className,
}: {
  title: string
  description?: string
  breadcrumbs?: Crumb[]
  actions?: React.ReactNode
  eyebrow?: string
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-4', className)}>
      {breadcrumbs?.length ? (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1

              /*
               * The separator is a SIBLING of the item, not a child.
               *
               * Both `BreadcrumbItem` and `BreadcrumbSeparator` render an
               * `<li>`, so nesting one inside the other produces `<li><li>` —
               * invalid HTML, which React resolves differently on the server
               * and the client and therefore reports as a hydration error.
               */
              return (
                <Fragment key={`${crumb.label}-${index}`}>
                  <BreadcrumbItem>
                    {isLast || !crumb.href ? (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {/* Between items only — never trailing. Keyed off position
                      rather than whether the crumb is a link, so a middle crumb
                      without an href still gets its separator. */}
                  {isLast ? null : <BreadcrumbSeparator />}
                </Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? <span className="afi-eyebrow">{eyebrow}</span> : null}
          <h1 className="font-heading truncate text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-muted-foreground max-w-2xl text-sm">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/** Groups a titled block of content inside a page. */
export function Section({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  /** Anchor target, so a section can be deep-linked (`/hq/settings#security`). */
  id?: string
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      id={id}
      className={cn('flex flex-col gap-4 scroll-mt-20', className)}
      aria-label={title}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-semibold">{title}</h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
        {actions ? <div className="flex gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  )
}
