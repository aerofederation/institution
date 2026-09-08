'use client'

import { useEffect, useRef, type ElementType } from 'react'

import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { cn } from '@/lib/utils'

/**
 * Masked type reveal, matching aerofederation.org.
 *
 * Each unit sits in an overflow-hidden box and rises into place, which reads
 * far cleaner at display sizes than fading a whole block.
 *
 * The text is always real text in the DOM — split into spans, never replaced by
 * canvas or images — so it stays selectable, searchable, and readable to a
 * screen reader. With `prefers-reduced-motion` set, or with JavaScript off,
 * nothing animates and the heading is simply there.
 */

const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function SplitText({
  children,
  as: Tag = 'div',
  className,
  mode = 'word',
  delay = 0,
  onLoad = false,
}: {
  children: string
  as?: ElementType
  className?: string
  /** `word` masks each word; `line` masks manual line breaks (split on \n). */
  mode?: 'word' | 'line'
  delay?: number
  /** Play on mount rather than on scroll — for anything above the fold. */
  onLoad?: boolean
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    gsap.registerPlugin(ScrollTrigger)
    const units = el.querySelectorAll('[data-unit]')
    if (units.length === 0) return

    const ctx = gsap.context(() => {
      gsap.set(units, { yPercent: 118 })
      gsap.to(units, {
        yPercent: 0,
        duration: mode === 'line' ? 1.05 : 0.85,
        ease: 'power3.out',
        delay,
        stagger: mode === 'line' ? 0.09 : 0.035,
        ...(onLoad ? {} : { scrollTrigger: { trigger: el, start: 'top 88%', once: true } }),
      })
    }, el)

    /*
     * The units are hidden the moment this runs, and only a running animation
     * frame brings them back. That is a fair trade below the fold — nothing is
     * visible there anyway — but above it, anything that starves
     * requestAnimationFrame would leave the page's main heading blank. So the
     * headline is force-revealed if the tween has not finished in time.
     *
     * Worth being clear that this is insurance, not the mechanism: in a browser
     * running frames normally the tween completes in about a second and this
     * timer finds nothing left to do.
     */
    const failsafe = onLoad
      ? window.setTimeout(() => gsap.set(units, { clearProps: 'transform' }), 3000)
      : undefined

    return () => {
      if (failsafe) window.clearTimeout(failsafe)
      ctx.revert()
    }
  }, [mode, delay, onLoad])

  const units = mode === 'line' ? children.split('\n') : children.split(' ')

  return (
    <Tag ref={ref} className={cn(mode === 'line' && 'afi-split-lines', className)}>
      {units.map((unit, index) => (
        <span key={index} className="afi-split-mask">
          <span data-unit>{unit}</span>
          {mode === 'word' && index < units.length - 1 ? ' ' : null}
        </span>
      ))}
    </Tag>
  )
}

/**
 * Reveals a block on scroll — a card, an image, a paragraph.
 *
 * The lighter companion to `SplitText`: no splitting, just a rise and fade for
 * things that are not headings.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: ElementType
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || prefersReducedMotion()) return

    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { y: 26, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.8,
          ease: 'power3.out',
          delay,
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        },
      )
    }, el)

    return () => ctx.revert()
  }, [delay])

  // Visible by default: if the effect never runs — reduced motion, no JS — the
  // content must not be stuck at zero opacity.
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  )
}

export { EASE }
