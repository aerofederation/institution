import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SESSION_COMPLETION_ROUTES, SIGNED_OUT_ROUTES } from '@/lib/supabase/middleware'

/**
 * Where an emailed link is allowed to land.
 *
 * This exists because of a bug that made account activation impossible.
 * `/activate` was classed as a sign-in surface, and middleware redirects an
 * *authenticated* visitor away from those — but redeeming an activation link
 * signs you in and then sends you to `/activate` to choose a password. The one
 * page the invitation exists to reach was the one page the session disqualified
 * you from seeing. `/reset-password` had the same defect.
 *
 * Nothing caught it: the middleware typechecks, the routes exist, the pages
 * render in isolation, and every test passed. It only appears when a real link
 * is redeemed against a running server.
 *
 * So the classification is asserted directly, and the invariant is stated as a
 * rule rather than a list: a route that finishes an authenticated flow must
 * never be treated as a route for signed-out visitors.
 */

/** Every `next=` target this codebase mints into an emailed link. */
const EMAILED_DESTINATIONS = ['/activate', '/reset-password']

describe('routes that complete an emailed flow stay reachable', () => {
  it.each(EMAILED_DESTINATIONS)(
    '%s is a completion route, so a signed-in visitor is not bounced off it',
    (route) => {
      expect(SESSION_COMPLETION_ROUTES).toContain(route)
    },
  )

  it.each(EMAILED_DESTINATIONS)('%s is never treated as a signed-out surface', (route) => {
    expect(
      SIGNED_OUT_ROUTES,
      `${route} redirects authenticated users away, which is exactly who arrives there ` +
        'after redeeming a link — the page would be unreachable.',
    ).not.toContain(route)
  })

  it('keeps the two classifications disjoint', () => {
    const overlap = SIGNED_OUT_ROUTES.filter((route) => SESSION_COMPLETION_ROUTES.includes(route))
    expect(overlap).toEqual([])
  })

  it('still bounces authenticated visitors off the actual sign-in forms', () => {
    // The original behaviour is deliberate and must survive the fix: someone
    // already signed in has no business on a login form.
    expect(SIGNED_OUT_ROUTES).toContain('/login')
    expect(SIGNED_OUT_ROUTES).toContain('/hq/login')
    expect(SIGNED_OUT_ROUTES).toContain('/forgot-password')
  })
})

describe('the links the application mints agree with that classification', () => {
  /**
   * Walks the source tree rather than naming files.
   *
   * An earlier version of this test listed the two files that built activation
   * links. Moving that code one directory made the assertion vacuous while
   * still passing its own existence check — the list had gone stale, not the
   * property. Searching for the call means the test follows the code.
   */
  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(full)
      return /\.tsx?$/.test(entry.name) ? [full] : []
    })
  }

  /** The `next` argument of every `verificationUrl(...)` call in the codebase. */
  function mintedDestinations() {
    const found = new Set<string>()

    for (const file of [...walk('services'), ...walk('app'), ...walk('lib')]) {
      const source = readFileSync(file, 'utf8')
      // No `s` flag: `[^)]` already spans newlines, and dotAll needs es2018.
      for (const match of source.matchAll(/verificationUrl\(([^)]*)\)/g)) {
        const literals = [...match[1].matchAll(/'(\/[A-Za-z0-9/_-]*)'/g)].map((m) => m[1])
        const last = literals.at(-1)
        if (last) found.add(last)
      }
    }

    return found
  }

  it('finds the calls at all (the scanner is not silently broken)', () => {
    expect(mintedDestinations().size).toBeGreaterThan(0)
  })

  it('every next= destination in an emailed link is a completion route', () => {
    for (const destination of mintedDestinations()) {
      expect(
        SESSION_COMPLETION_ROUTES,
        `an emailed link targets ${destination}, which middleware would redirect an ` +
          'authenticated visitor away from — the link would be unusable.',
      ).toContain(destination)
    }
  })
})
