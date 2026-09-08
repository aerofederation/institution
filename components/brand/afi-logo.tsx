import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The official Aero Federation of India emblem mark.
 *
 * Renders the official `/logo.png` circular emblem. Pinned to a square
 * aspect ratio and circular border, scaling cleanly with `size-*` utility classes.
 */
export function AfiMark({
  className,
  alt = 'Aero Federation of India',
  accent,
}: {
  className?: string
  alt?: string
  /** Preserved for backward compatibility */
  accent?: boolean
}) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={48}
      height={48}
      className={cn('rounded-full object-contain shrink-0 aspect-square', className)}
      priority
    />
  )
}

/**
 * Full official lock-up: emblem mark, bilingual organization name, and optional descriptor.
 *
 * `href` makes it a link; omit it where the lock-up is already inside one
 * (nesting an anchor inside an anchor is invalid and breaks keyboard order).
 */
export function AfiLogo({
  href = '/',
  className,
  tone = 'default',
  showDescriptor = true,
  descriptor = 'Digital Institution & AI Education Platform',
}: {
  href?: string | null
  className?: string
  tone?: 'default' | 'inverted'
  showDescriptor?: boolean
  descriptor?: string
}) {
  const content = (
    <span className={cn('afi-lockup inline-flex items-center gap-2.5 leading-none', className)}>
      <AfiMark
        className="size-9 shrink-0"
        alt="Aero Federation of India"
      />
      <span className="flex min-w-0 flex-col gap-[2px]">
        <span
          className={cn(
            'afi-lockup-hi',
            tone === 'inverted' ? 'text-white' : 'text-navy-900',
          )}
        >
          भारतीय एयरो फेडरेशन
        </span>
        <span
          className={cn(
            'afi-lockup-en',
            tone === 'inverted' ? 'text-white/70' : 'text-muted-foreground',
          )}
        >
          AERO FEDERATION OF INDIA
        </span>
        {showDescriptor && descriptor ? (
          <span
            className={cn(
              'mt-0.5 font-mono text-[9px] leading-none font-medium tracking-[0.16em] uppercase',
              tone === 'inverted' ? 'text-white/55' : 'text-muted-foreground',
            )}
          >
            {descriptor}
          </span>
        ) : null}
      </span>
    </span>
  )

  if (!href) return content

  return (
    <Link
      href={href}
      className="inline-flex rounded-md focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      aria-label="Aero Federation of India — home"
    >
      {content}
    </Link>
  )
}
