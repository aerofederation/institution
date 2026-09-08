import type { LucideIcon } from 'lucide-react'

import type { PermissionCode } from '@/lib/permissions/definitions'

/**
 * The shape every workspace's navigation is declared in.
 *
 * Institution, teacher and student surfaces differ in what they contain, not in
 * how they are put together — so the chrome is written once and each workspace
 * supplies a nav and a home. Three near-identical sidebars would drift apart on
 * the first change to any of them.
 *
 * `permission` decides whether a link is worth showing. It is never what
 * decides access: every layout re-derives the session per request and RLS
 * refuses the rows underneath, so hiding a link is a courtesy.
 */

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  permission?: PermissionCode
  /** Matches child routes for active state, e.g. /teacher/materials/[id]. */
  matchPrefix?: boolean
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

/**
 * Active-state matching.
 *
 * A workspace root such as `/teacher` is deliberately never prefix-matched:
 * every route below it starts with the same string, so Overview would render as
 * active on every page.
 */
export function isActiveRoute(
  pathname: string,
  item: Pick<NavItem, 'href' | 'matchPrefix'>,
): boolean {
  if (pathname === item.href) return true
  if (!item.matchPrefix) return false
  return pathname.startsWith(`${item.href}/`)
}
