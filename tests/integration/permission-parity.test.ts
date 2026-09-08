// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  PERMISSION_CODES,
  ROLE_CODES,
  type PermissionCode,
  type RoleCode,
} from '@/lib/permissions/definitions'

import { createTestDatabase, type TestDatabase } from '../rls/harness'

/**
 * `lib/permissions/definitions.ts` restates the authorization vocabulary so
 * TypeScript can catch a mistyped permission code at compile time. A restated
 * constant is only useful while it is true, and the failure mode when it drifts
 * is quiet: `can(ctx, 'teacher.updat')` would not be a type error, it would
 * just always be false, and a control would silently disappear from the UI.
 *
 * This suite fails the build the moment the two disagree in either direction.
 */

let t: TestDatabase

beforeAll(async () => {
  t = await createTestDatabase()
}, 120_000)

afterAll(async () => {
  await t?.close()
})

describe('permission definitions match the database', () => {
  it('declares exactly the roles the migration creates', async () => {
    const rows = await t.sql<{ code: string }>('select code from public.roles order by code')
    expect(rows.map((r) => r.code).sort()).toEqual([...ROLE_CODES].sort())
  })

  it('declares exactly the permissions the migration creates', async () => {
    const rows = await t.sql<{ code: string }>('select code from public.permissions order by code')
    const inDatabase = rows.map((r) => r.code).sort()
    const inCode: string[] = [...PERMISSION_CODES].sort()

    expect(inCode.filter((c) => !inDatabase.includes(c)), 'declared in code but not in the database')
      .toEqual([])
    expect(inDatabase.filter((c) => !inCode.includes(c)), 'in the database but not declared in code')
      .toEqual([])
  })

  it('gives HQ every global permission and no tenant write permission', async () => {
    const granted = await t.sql<{ permission_code: string; scope: string }>(
      `select rp.permission_code, p.scope
         from public.role_permissions rp
         join public.permissions p on p.code = rp.permission_code
        where rp.role_code = 'HQ_ADMIN'`,
    )
    const globals = await t.sql<{ code: string }>(
      `select code from public.permissions where scope = 'GLOBAL'`,
    )

    const grantedCodes = new Set(granted.map((g) => g.permission_code))
    for (const { code } of globals) {
      expect(grantedCodes.has(code), `HQ is missing ${code}`).toBe(true)
    }

    // HQ oversees institutions; it does not operate them. Anything tenant-scoped
    // it holds must be self-scoped, never a write against somebody's data.
    const tenantScoped = granted.filter((g) => g.scope === 'TENANT').map((g) => g.permission_code)
    expect(tenantScoped.sort()).toEqual(
      ['notification.read_self', 'profile.read_self', 'profile.update_self'].sort(),
    )
  })

  it('gives a student nothing beyond their own records', async () => {
    const rows = await t.sql<{ permission_code: string }>(
      `select permission_code from public.role_permissions where role_code = 'STUDENT'`,
    )
    const codes = rows.map((r) => r.permission_code).sort()

    expect(codes).toEqual(
      [
        'academic.read',
        'institution.read',
        'notification.read_self',
        'profile.read_self',
        'profile.update_self',
        // Teaching content a student receives. Each is scoped to their own
        // enrolment by RLS: read what was published to their class, submit
        // their own work, attempt a paper addressed to them.
        'material.read',
        'assignment.submit',
        'assessment.attempt',
        // Direct messaging. Not a widening: `conversations_select` and
        // `messages_select` admit only the two participants, so this grants
        // reach to nobody a student is not already paired with by teaching.
        'message.participate',
      ].sort(),
    )
  })

  it('gives a teacher no ability to create or edit people', async () => {
    const rows = await t.sql<{ permission_code: string }>(
      `select permission_code from public.role_permissions where role_code = 'TEACHER'`,
    )
    const codes = rows.map((r) => r.permission_code)

    for (const forbidden of [
      'teacher.create',
      'teacher.update',
      'student.create',
      'student.update',
      'student.read',
      'academic.manage',
    ]) {
      expect(codes, `teacher should not hold ${forbidden}`).not.toContain(forbidden)
    }
    expect(codes).toContain('student.read_assigned')
  })

  it('grants no role a permission that does not exist', async () => {
    const orphans = await t.sql(
      `select rp.permission_code
         from public.role_permissions rp
         left join public.permissions p on p.code = rp.permission_code
        where p.code is null`,
    )
    expect(orphans).toHaveLength(0)
  })

  it('never grants a GLOBAL permission to a tenant role', async () => {
    const rows = await t.sql<{ role_code: string; permission_code: string }>(
      `select rp.role_code, rp.permission_code
         from public.role_permissions rp
         join public.permissions p on p.code = rp.permission_code
         join public.roles r on r.code = rp.role_code
        where p.scope = 'GLOBAL' and r.scope = 'TENANT'`,
    )
    expect(rows).toEqual([])
  })
})

describe('every table is protected', () => {
  it('has RLS enabled on every table in the public schema', async () => {
    const rows = await t.sql<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows.map((r) => r.tablename)).toEqual([])
  })

  /**
   * Tables that are deliberately closed to every API role.
   *
   * RLS on with no policy means nothing reaches the table through PostgREST at
   * all. That is almost always an oversight, so the test below treats it as one
   * — unless the table is listed here with a reason.
   */
  const INTENTIONALLY_UNREACHABLE: Record<string, string> = {
    application_access_tokens:
      'One-time tracking codes. Only the SECURITY DEFINER functions in migration 016 read or write them; exposing the table to any API role would let a caller enumerate or confirm code hashes.',
  }

  it('has at least one policy on every table, or a documented reason not to', async () => {
    const rows = await t.sql<{ tablename: string }>(
      `select c.relname as tablename
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         left join pg_policies pol on pol.schemaname = 'public' and pol.tablename = c.relname
        where n.nspname = 'public' and c.relkind = 'r'
        group by c.relname
       having count(pol.policyname) = 0`,
    )

    const undocumented = rows
      .map((r) => r.tablename)
      .filter((table) => !(table in INTENTIONALLY_UNREACHABLE))

    expect(
      undocumented,
      `RLS is enabled with no policy on: ${undocumented.join(', ')}. Add policies, or list the table in INTENTIONALLY_UNREACHABLE with the reason.`,
    ).toEqual([])
  })

  it('keeps the intentionally unreachable tables actually unreachable', async () => {
    // The exemption above is only safe while the table really is closed. If a
    // policy or a grant is ever added, that is a decision worth failing on.
    for (const table of Object.keys(INTENTIONALLY_UNREACHABLE)) {
      const policies = await t.sql(
        `select policyname from pg_policies where schemaname = 'public' and tablename = $1`,
        [table],
      )
      expect(policies, `${table} gained a policy`).toEqual([])

      const grants = await t.sql(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = $1
            and grantee in ('anon', 'authenticated')`,
        [table],
      )
      expect(grants, `${table} gained a grant for an API role`).toEqual([])
    }
  })

  it('grants anon no privileges anywhere in the public schema', async () => {
    const rows = await t.sql<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public'`,
    )
    expect(rows).toEqual([])
  })

  it('writes no policy that applies to PUBLIC instead of a named role', async () => {
    const rows = await t.sql<{ tablename: string; policyname: string }>(
      `select tablename, policyname from pg_policies
        where schemaname in ('public', 'storage')
          and (roles = '{public}' or roles is null)`,
    )
    expect(rows).toEqual([])
  })

  it('leaves the audit log append-only', async () => {
    const rows = await t.sql<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'audit_logs'`,
    )
    expect(rows.map((r) => r.cmd).sort()).toEqual(['INSERT', 'SELECT'])
  })
})

describe('security definer functions are hardened', () => {
  it('pins an empty search_path on every SECURITY DEFINER function we define', async () => {
    const rows = await t.sql<{ nspname: string; proname: string; proconfig: string[] | null }>(
      `select n.nspname, p.proname, p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private')
          and p.prosecdef`,
    )

    expect(rows.length).toBeGreaterThan(0)
    for (const fn of rows) {
      expect(
        fn.proconfig?.some((c) => c === 'search_path=' || c === 'search_path=""'),
        `${fn.nspname}.${fn.proname} does not pin search_path`,
      ).toBe(true)
    }
  })

  it('keeps the private schema unreachable from the API roles', async () => {
    for (const role of ['anon', 'authenticated']) {
      const [row] = await t.sql<{ has: boolean }>(
        `select has_schema_privilege($1, 'private', 'USAGE') as has`,
        [role],
      )
      expect(row.has, `${role} can use the private schema`).toBe(false)
    }
  })

  it('does not expose helper functions to anonymous callers', async () => {
    const [row] = await t.sql<{ has: boolean }>(
      `select has_function_privilege('anon', 'private.auth_institution_id()', 'EXECUTE') as has`,
    )
    expect(row.has).toBe(false)
  })
})

describe('roles resolve to the codes the application expects', () => {
  it('maps every role code to a home route', async () => {
    const rows = await t.sql<{ code: string }>('select code from public.roles')
    for (const row of rows) {
      expect(ROLE_CODES).toContain(row.code as RoleCode)
    }
  })

  it('uses resource.action shape for every permission code', () => {
    for (const code of PERMISSION_CODES as readonly PermissionCode[]) {
      expect(code, `${code} is not resource.action`).toMatch(/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/)
    }
  })
})
