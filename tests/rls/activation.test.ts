// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDatabase, seedFixtures, type Fixtures, type TestDatabase } from './harness'

/**
 * `activate_own_account()` is the single sanctioned exception to profile status
 * immutability, so it gets its own suite. The property that matters is not that
 * it works — it is that it refuses everything adjacent to what it is for.
 */

let t: TestDatabase
let f: Fixtures

beforeAll(async () => {
  t = await createTestDatabase()
  f = await seedFixtures(t)
}, 120_000)

afterAll(async () => {
  await t?.close()
})

/** Provisions an INVITED teacher and returns their id. */
async function invite(email: string, institutionId: string, confirmEmail = true) {
  const [row] = await t.sql<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_app_meta_data)
     values ($1, case when $2 then now() else null end, jsonb_build_object(
       'afi_role', 'TEACHER',
       'afi_institution_id', $3::text,
       'afi_full_name', 'Invited Teacher'))
     returning id`,
    [email, confirmEmail, institutionId],
  )
  return row.id
}

describe('activate_own_account', () => {
  it('moves an invited account to ACTIVE', async () => {
    const userId = await invite('invited-1@alpha.test', f.alpha.institutionId)
    await t.sql(
      `insert into public.teachers (profile_id, institution_id, employee_id) values ($1, $2, 'T-A1')`,
      [userId, f.alpha.institutionId],
    )

    const [before] = await t.sql<{ status: string }>(
      'select status from public.profiles where id = $1',
      [userId],
    )
    expect(before.status).toBe('INVITED')

    await t.asUser(userId, 'select public.activate_own_account()')

    const [after] = await t.sql<{ status: string }>(
      'select status from public.profiles where id = $1',
      [userId],
    )
    expect(after.status).toBe('ACTIVE')
  })

  it('brings the role extension row along', async () => {
    const [teacher] = await t.sql<{ status: string }>(
      `select t.status from public.teachers t
        join public.profiles p on p.id = t.profile_id
       where p.email = 'invited-1@alpha.test'`,
    )
    expect(teacher.status).toBe('ACTIVE')
  })

  it('writes an audit entry', async () => {
    const rows = await t.sql(
      `select id from public.audit_logs
        where action = 'ACCOUNT_ACTIVATED' and actor_email = 'invited-1@alpha.test'`,
    )
    expect(rows).toHaveLength(1)
  })

  it('is idempotent', async () => {
    const [row] = await t.sql<{ id: string }>(
      `select id from public.profiles where email = 'invited-1@alpha.test'`,
    )
    const result = await t.asUser<{ activate_own_account: string }>(
      row.id,
      'select public.activate_own_account()',
    )
    expect(result[0].activate_own_account).toBe('ACTIVE')
  })

  it('refuses an account whose email is not confirmed', async () => {
    const userId = await invite('invited-2@alpha.test', f.alpha.institutionId, false)
    await expect(
      t.asUser(userId, 'select public.activate_own_account()'),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('cannot revive a SUSPENDED account — the whole point of the immutability rule', async () => {
    const userId = await invite('suspended@alpha.test', f.alpha.institutionId)
    await t.sql(`update public.profiles set status = 'SUSPENDED' where id = $1`, [userId])

    const result = await t.asUser<{ activate_own_account: string }>(
      userId,
      'select public.activate_own_account()',
    )
    expect(result[0].activate_own_account).toBe('SUSPENDED')

    const [after] = await t.sql<{ status: string }>(
      'select status from public.profiles where id = $1',
      [userId],
    )
    expect(after.status).toBe('SUSPENDED')
  })

  it('cannot revive a DEACTIVATED account', async () => {
    const userId = await invite('deactivated@alpha.test', f.alpha.institutionId)
    await t.sql(`update public.profiles set status = 'DEACTIVATED' where id = $1`, [userId])

    await t.asUser(userId, 'select public.activate_own_account()')

    const [after] = await t.sql<{ status: string }>(
      'select status from public.profiles where id = $1',
      [userId],
    )
    expect(after.status).toBe('DEACTIVATED')
  })

  it('activates only the caller — it takes no target argument', async () => {
    const victim = await invite('victim@alpha.test', f.alpha.institutionId)

    // There is no signature that accepts someone else's id.
    await expect(
      t.asUser(f.alpha.adminId, 'select public.activate_own_account($1)', [victim]),
    ).rejects.toBeTruthy()

    const [after] = await t.sql<{ status: string }>(
      'select status from public.profiles where id = $1',
      [victim],
    )
    expect(after.status).toBe('INVITED')
  })

  it('is not callable by an anonymous visitor', async () => {
    await expect(t.asAnon('select public.activate_own_account()')).rejects.toMatchObject({
      code: '42501',
    })
  })

  it('an INVITED user still cannot read tenant data before activating', async () => {
    const userId = await invite('invited-3@alpha.test', f.alpha.institutionId)
    const rows = await t.asUser(userId, 'select profile_id from public.students')
    expect(rows).toHaveLength(0)
  })
})
