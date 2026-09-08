import Image from 'next/image'
import Link from 'next/link'

import { cn } from '@/lib/utils'

/**
 * The official AFI lockup: the emblem from `/public/logo.png` beside the
 * bilingual wordmark, matching the organisation's own logo.
 *
 * Two things here are load-bearing and easy to undo by accident.
 *
 * **The emblem box is pinned in CSS, not by the `width`/`height` props.** The
 * source is a 12142px square master. `next/image` emits those props as
 * presentational hints, which any class beats — so if the optimizer ever serves
 * the master instead of a resized copy, an unpinned emblem renders at full size
 * and takes over the page. `.afi-emblem` fixes the rendered box regardless of
 * what comes back from the server.
 *
 * **The two wordmark lines are set to the same length**, which is what the
 * organisation's lockup does. That is achieved by a measured ratio rather than
 * by eye: the Devanagari run grows 8.50px of width per px of font-size and the
 * letter-spaced English run grows 16.99px — almost exactly double. So one
 * variable drives both and the Hindi is set at twice it. Change
 * `--afi-en-size` alone and the lockup stays aligned.
 */
export function AfiLockup({
  href = '/',
  tone = 'default',
  size = 38,
  className,
  showWords = true,
  descriptor,
}: {
  /** `null` renders it unlinked — for use inside an existing anchor. */
  href?: string | null
  /** `inverted` is the white treatment for navy grounds. */
  tone?: 'default' | 'inverted'
  /** Emblem edge length in pixels. The wordmark does not scale with it. */
  size?: number
  className?: string
  showWords?: boolean
  /** Optional third line, e.g. "Institution portal". */
  descriptor?: string
}) {
  const content = (
    <span
      className={cn('afi-lockup inline-flex items-center gap-2.5 leading-none', className)}
      style={{ '--afi-emblem-size': `${size}px` } as React.CSSProperties}
    >
      <Image
        className="afi-emblem"
        src="/logo.png"
        /*
         * Decorative: the wordmark beside it already names the organisation, so
         * a screen reader announcing the logo too would read it twice. When the
         * words are hidden the alt text carries the name instead.
         */
        alt={showWords ? '' : 'Aero Federation of India'}
        width={size}
        height={size}
        sizes={`${size}px`}
        priority
      />

      {showWords ? (
        <span className="flex min-w-0 flex-col gap-[3px]">
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
              tone === 'inverted' ? 'text-[#8fb0c7]' : 'text-muted-foreground',
            )}
          >
            AERO FEDERATION OF INDIA
          </span>
          {descriptor ? (
            <span
              className={cn(
                'font-mono text-[9px] leading-none font-medium tracking-[0.16em] uppercase',
                tone === 'inverted' ? 'text-white/45' : 'text-muted-foreground/80',
              )}
            >
              {descriptor}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  )

  if (!href) return content

  return (
    <Link href={href} className="inline-flex rounded-md focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none">
      {content}
    </Link>
  )
}
