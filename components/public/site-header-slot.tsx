'use client'

import { usePathname } from 'next/navigation'

import { SiteHeader } from '@/components/public/site-header'

/**
 * Chooses the header treatment for the current route.
 *
 * Only the homepage has a dark full-bleed hero for the header to sit over.
 * Every other public page starts with light content, where a transparent
 * header would render white-on-white until the first scroll.
 */
const OVER_HERO = new Set(['/'])

export function SiteHeaderSlot() {
  const pathname = usePathname()
  return <SiteHeader overHero={OVER_HERO.has(pathname)} />
}
