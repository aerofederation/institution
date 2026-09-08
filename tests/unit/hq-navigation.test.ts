import { existsSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { HQ_NAV, isActiveRoute, type HqNavItem } from '@/components/hq/hq-nav'
import { HOME_BY_ROLE, PERMISSION_CODES, ROUTE_PREFIX_ROLE } from '@/lib/permissions/definitions'

const items = HQ_NAV.flatMap((group) => group.items)

describe('HQ navigation', () => {
  it('routes every item to a page that exists', () => {
    // A sidebar that links to a route with no page is a 404 an administrator
    // finds before anyone else does.
    const missing = items.filter((item) => {
      const relative = item.href === '/hq' ? '' : item.href.replace(/^\/hq\//, '')
      const file = path.join('app', 'hq', '(command)', relative, 'page.tsx')
      return !existsSync(file)
    })

    expect(missing.map((item) => item.href)).toEqual([])
  })

  it('gates each item on a permission that actually exists', () => {
    const declared = new Set<string>(PERMISSION_CODES)
    const unknown = items
      .filter((item) => item.permission && !declared.has(item.permission))
      .map((item) => `${item.href} → ${item.permission}`)

    expect(unknown).toEqual([])
  })

  it('has no duplicate destinations', () => {
    const hrefs = items.map((item) => item.href)
    expect(hrefs.length).toBe(new Set(hrefs).size)
  })

  it('marks every unbacked surface so the map does not overstate itself', () => {
    // These four have no database tables yet. If one loses its marker the
    // sidebar starts implying it works.
    const pending = items.filter((item) => item.status === 'pending').map((item) => item.href)
    expect(pending.sort()).toEqual(
      ['/hq/ai', '/hq/announcements', '/hq/certificates', '/hq/events'].sort(),
    )
  })
})

describe('active-route matching', () => {
  const overview: HqNavItem = { href: '/hq', label: 'Overview', icon: (() => null) as never }
  const institutions: HqNavItem = {
    href: '/hq/institutions',
    label: 'Institutions',
    icon: (() => null) as never,
    matchPrefix: true,
  }
  const settings: HqNavItem = {
    href: '/hq/settings',
    label: 'Settings',
    icon: (() => null) as never,
  }

  it('matches the overview only on an exact path', () => {
    // Without the special case, "/hq" prefix-matches every HQ route and the
    // whole sidebar highlights at once.
    expect(isActiveRoute('/hq', overview)).toBe(true)
    expect(isActiveRoute('/hq/institutions', overview)).toBe(false)
  })

  it('matches child routes when a section opts in', () => {
    expect(isActiveRoute('/hq/institutions', institutions)).toBe(true)
    expect(isActiveRoute('/hq/institutions/abc-123', institutions)).toBe(true)
    expect(isActiveRoute('/hq/institutions/abc-123?tab=documents', institutions)).toBe(true)
  })

  it('does not match a sibling whose path merely starts the same way', () => {
    expect(isActiveRoute('/hq/institutional-review', institutions)).toBe(false)
    expect(isActiveRoute('/hq/settings-old', settings)).toBe(false)
  })
})

describe('role routing', () => {
  it('gives every role a home inside its own prefix', () => {
    for (const [prefix, role] of Object.entries(ROUTE_PREFIX_ROLE)) {
      expect(HOME_BY_ROLE[role]).toBe(prefix)
    }
  })

  it('keeps /hq/login outside the guarded HQ prefixes', () => {
    // The HQ sign-in lives under /hq but must stay reachable while signed out.
    // If it were ever moved inside the (command) group it would guard itself.
    expect(existsSync(path.join('app', 'hq', 'login', 'page.tsx'))).toBe(true)
    expect(existsSync(path.join('app', 'hq', '(command)', 'login', 'page.tsx'))).toBe(false)
  })
})
