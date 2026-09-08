import { SplitText } from '@/components/motion/split-text'
import Link from 'next/link'

import type { LucideIcon } from 'lucide-react'
import { ArrowRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Layout primitives for the public site.
 *
 * Section rhythm, container width and heading treatment are decided once here.
 * Ten sections each choosing their own vertical padding is what makes a long
 * page feel assembled rather than designed.
 */

export function Container({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-7xl px-5 sm:px-8', className)}>{children}</div>
  )
}

export function PublicSection({
  children,
  className,
  tone = 'default',
  id,
  label,
}: {
  children: React.ReactNode
  className?: string
  tone?: 'default' | 'muted' | 'dark'
  id?: string
  /** Accessible name for the landmark. */
  label: string
}) {
  return (
    <section
      id={id}
      aria-label={label}
      className={cn(
        'relative scroll-mt-20 py-20 sm:py-24 lg:py-28',
        tone === 'muted' && 'bg-muted/40',
        tone === 'dark' && 'bg-navy-950 text-white',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  tone = 'default',
  as: Heading = 'h2',
  className,
}: {
  eyebrow?: string
  title: string
  description?: string
  align?: 'left' | 'center'
  tone?: 'default' | 'inverted'
  /**
   * Heading level. The first heading on a page must be `h1` — a page whose
   * primary heading is an `h2` has a broken outline for screen-reader
   * navigation and no top-level heading for search engines. Every other
   * section on the page stays `h2`.
   */
  as?: 'h1' | 'h2'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4',
        align === 'center' && 'mx-auto max-w-3xl text-center items-center',
        className,
      )}
    >
      {eyebrow ? (
        <span
          className={cn(
            'font-mono text-[11px] font-medium tracking-[0.18em] uppercase',
            tone === 'inverted' ? 'text-white/50' : 'text-muted-foreground',
          )}
        >
          {eyebrow}
        </span>
      ) : null}
      {/*
        Every section heading gets the masked word reveal on scroll, so the
        motion is a property of the design system rather than something applied
        by hand to whichever section somebody remembered. It reads as one
        treatment across the site because it is literally one component.
      */}
      <SplitText
        as={Heading}
        mode="word"
        className={cn(
          'font-heading text-3xl leading-[1.12] font-semibold tracking-tight sm:text-4xl lg:text-[2.75rem]',
          tone === 'inverted' && 'text-white',
        )}
      >
        {title}
      </SplitText>
      {description ? (
        <p
          className={cn(
            'max-w-2xl text-base leading-relaxed',
            tone === 'inverted' ? 'text-white/60' : 'text-muted-foreground',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  )
}

/** Understated card used across the marketing sections. */
export function FeatureCard({
  icon: Icon,
  title,
  description,
  tone = 'default',
  className,
}: {
  icon?: LucideIcon
  title: string
  description: string
  tone?: 'default' | 'inverted'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border p-6 transition-colors',
        tone === 'inverted'
          ? 'border-white/10 bg-white/[0.03] hover:border-white/20'
          : 'bg-card hover:border-primary/30',
        className,
      )}
    >
      {Icon ? (
        /*
         * The icon tile lifts and its glyph turns very slightly on hover. Held
         * deliberately small: an icon that leaps is noise on a page with twenty
         * cards, and the point is to confirm the card is interactive, not to
         * perform. `motion-reduce` drops it entirely.
         */
        <span
          className={cn(
            'afi-icon-tile flex size-10 items-center justify-center rounded-md',
            tone === 'inverted' ? 'bg-white/10 text-white' : 'bg-primary/10 text-primary',
          )}
        >
          <Icon className="afi-icon-glyph size-5" aria-hidden="true" />
        </span>
      ) : null}
      <h3
        className={cn(
          'font-heading text-base font-semibold',
          tone === 'inverted' && 'text-white',
        )}
      >
        {title}
      </h3>
      <p className={cn('text-sm leading-relaxed', tone === 'inverted' ? 'text-white/60' : 'text-muted-foreground')}>
        {description}
      </p>
    </div>
  )
}

export function SectionCta({
  href,
  children,
  variant = 'outline',
}: {
  href: string
  children: React.ReactNode
  variant?: 'default' | 'outline'
}) {
  return (
    <Button asChild variant={variant} className="w-fit">
      <Link href={href}>
        {children}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </Button>
  )
}
