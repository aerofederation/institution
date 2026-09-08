import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Structural guarantees about HQ authorisation.
 *
 * These assert the *shape* of the code rather than its runtime behaviour,
 * because the properties they protect are architectural and are exactly the
 * kind that erode one careless edit at a time: a new page that forgets to
 * guard, a service that reads the tenant from a request, a role check
 * duplicated inline instead of going through the guard.
 *
 * Runtime authorisation is covered elsewhere — `tests/rls/` proves the database
 * refuses cross-tenant reads even when the application is wrong, which is the
 * layer that actually has to hold.
 */

const HQ_COMMAND_DIR = path.join('app', 'hq', '(command)')

async function pageFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await pageFiles(full)))
    else if (entry.name === 'page.tsx') files.push(full)
  }
  return files
}

describe('every HQ surface is behind the guard', () => {
  it('places the authorisation check in the layout, not in each page', async () => {
    const layout = await readFile(path.join(HQ_COMMAND_DIR, 'layout.tsx'), 'utf8')

    // The guard belongs in the layout so a new page under this group is
    // protected the moment the file exists — there is no per-page opt-in to
    // forget.
    expect(layout).toMatch(/resolveHqAccess\(/)
    expect(layout).toMatch(/HqAccessDenied/)
  })

  it('has HQ pages that reach data go through requireHq via the service layer', async () => {
    const pages = await pageFiles(HQ_COMMAND_DIR)
    expect(pages.length).toBeGreaterThan(10)

    const offenders: string[] = []
    for (const file of pages) {
      const source = await readFile(file, 'utf8')

      // A page that builds its own Supabase client must also assert HQ itself;
      // otherwise it is relying purely on the layout, which is one refactor
      // away from being wrong.
      const buildsOwnClient = /createClient\(\)/.test(source)
      const assertsHq = /requireHq\(/.test(source)
      if (buildsOwnClient && !assertsHq) offenders.push(file)
    }

    expect(offenders, `these query directly without requireHq(): ${offenders.join(', ')}`).toEqual(
      [],
    )
  })

  it('never lets an HQ page read a tenant id from the request', async () => {
    const pages = await pageFiles(HQ_COMMAND_DIR)
    const offenders: string[] = []

    for (const file of pages) {
      const source = await readFile(file, 'utf8')
      // `institution_id` arriving from searchParams would be a tenant chosen by
      // the caller. HQ legitimately filters by institution, but that value is
      // only ever a filter on an already-authorised global read.
      if (/searchParams[\s\S]{0,400}institution_id/.test(source)) offenders.push(file)
    }

    expect(offenders).toEqual([])
  })
})

describe('the HQ service layer authorises before it reads', () => {
  it('asserts HQ in every exported data function', async () => {
    const files = ['overview.ts', 'directory.ts', 'analytics.ts', 'storage.ts', 'applications.ts']

    for (const name of files) {
      const source = await readFile(path.join('services', 'hq', name), 'utf8')
      const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1])
      expect(exported.length, `${name} exports nothing`).toBeGreaterThan(0)

      // Each exported function body should call requireHq before touching data.
      for (const fn of exported) {
        const body = source.slice(source.indexOf(`export async function ${fn}`))
        const nextExport = body.indexOf('export async function', 24)
        const scoped = nextExport === -1 ? body : body.slice(0, nextExport)
        expect(scoped, `services/hq/${name}: ${fn}() does not call requireHq`).toMatch(
          /requireHq\(/,
        )
      }
    }
  })

  it('requires the specific permission for each high-impact decision', async () => {
    const source = await readFile(path.join('services', 'hq', 'applications.ts'), 'utf8')

    // Being HQ is not the same as being allowed to approve an institution.
    for (const permission of [
      'institution.approve',
      'institution.reject',
      'application.review',
      'application.request_documents',
      'document.verify',
      'institution.suspend',
    ]) {
      expect(source, `applications.ts never requires ${permission}`).toContain(permission)
    }
  })

  it('keeps the service-role client out of everything except tenant provisioning', async () => {
    const dir = path.join('services', 'hq')
    const entries = await readdir(dir)

    const usingAdmin: string[] = []
    for (const name of entries) {
      const source = await readFile(path.join(dir, name), 'utf8')
      if (/createAdminClient\(/.test(source)) usingAdmin.push(name)
    }

    /*
     * Two files, and the reason is the same in both: bringing a tenant into
     * existence cannot run under the reviewer's own RLS context.
     *
     *   applications.ts       inserts `institutions`, which has no INSERT
     *                         policy for `authenticated`, by design.
     *   institution-admin.ts  creates the auth user, calls `provision_profile`
     *                         (granted to service_role only) and writes the
     *                         `institution_admins` row.
     *
     * The list is asserted exactly rather than loosely so that a third file
     * reaching for the service role has to be justified here first.
     */
    expect(usingAdmin.sort()).toEqual(['applications.ts', 'institution-admin.ts'])
  })

  it('does not expose provisioning as a callable Server Action', async () => {
    /*
     * `institution-admin.ts` runs with the service role and assigns a role, and
     * unlike every other file in this directory it does not authorise for
     * itself — its callers do. What makes that safe is that it is not reachable
     * from a browser.
     *
     * A `'use server'` directive would turn every export into a POST endpoint
     * callable by any visitor, handing out a provisioning primitive that
     * creates INSTITUTION_ADMIN accounts. The directive is one line and looks
     * like boilerplate next to its neighbours, which is exactly why its absence
     * is asserted rather than assumed.
     */
    const source = await readFile(path.join('services', 'hq', 'institution-admin.ts'), 'utf8')

    expect(
      /^s*['"]use server['"]/m.test(source),
      'institution-admin.ts must not be a Server Action module — it would expose account provisioning to the public.',
    ).toBe(false)

    expect(
      source,
      'institution-admin.ts must import server-only so it can never be bundled for the client.',
    ).toContain("import 'server-only'")
  })

  it('reaches provisioning only from an authorised entry point', async () => {
    const source = await readFile(path.join('services', 'hq', 'applications.ts'), 'utf8')

    // Both entry points authorise before they provision.
    expect(source).toContain("requireHq('institution.approve')")
    expect(source).toContain('inviteAdminForInstitution')
  })
})

describe('the 403 surface discloses nothing', () => {
  it('fetches no federation data', async () => {
    const source = await readFile(path.join('components', 'hq', 'hq-shell.tsx'), 'utf8')
    const denied = source.slice(source.indexOf('export function HqAccessDenied'))

    expect(denied).not.toMatch(/from\(['"`]/)
    expect(denied).not.toMatch(/createClient/)
    expect(denied).toMatch(/403/)
  })
})
