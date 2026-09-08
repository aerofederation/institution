import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'

/**
 * Migration test harness.
 *
 * This runs the REAL files from `supabase/migrations/` — the same bytes that
 * `npm run db:push` sends to Supabase — against an in-process PostgreSQL 18
 * (PGlite, WebAssembly). It exists so that schema validity and, more
 * importantly, Row Level Security can be proven in CI without credentials and
 * without Docker.
 *
 * It is NOT a second database for the application. Nothing under `app/`,
 * `lib/` or `services/` imports it, and `@electric-sql/pglite` is a
 * devDependency. Supabase remains the only backend. What this buys is that an
 * RLS regression fails a test run instead of reaching production.
 *
 * The bootstrap below reproduces the parts of a Supabase project that live
 * outside our migrations: the API roles, the `auth` schema and its `uid()`
 * helper, and the `storage` schema. Their definitions match Supabase's so the
 * policies under test are the policies that will actually run.
 */

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../supabase/migrations')

const SUPABASE_BOOTSTRAP = /* sql */ `
-- ── API roles ───────────────────────────────────────────────────────────────
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role supabase_auth_admin nologin noinherit;
create role supabase_admin nologin noinherit;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table privileges to the API roles by default. Reproduced here
-- so that the explicit REVOKE in migration 011 is actually revoking something.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to anon, authenticated, service_role;

-- ── auth schema ─────────────────────────────────────────────────────────────
create schema auth authorization postgres;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text unique,
  encrypted_password   text,
  email_confirmed_at   timestamptz,
  raw_app_meta_data    jsonb not null default '{}'::jsonb,
  raw_user_meta_data   jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Matches Supabase's definition, including the detail that matters: the raw
-- setting is passed through nullif BEFORE the cast. Once a custom GUC has been
-- set in a session it reverts to the empty string rather than to NULL when a
-- SET LOCAL unwinds, and ''::json raises.
create or replace function auth.uid() returns uuid
language sql stable as $fn$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid;
$fn$;

create or replace function auth.role() returns text
language sql stable as $fn$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    ''
  );
$fn$;

create or replace function auth.jwt() returns jsonb
language sql stable as $fn$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$fn$;

grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;

-- ── storage schema ──────────────────────────────────────────────────────────
create schema storage authorization postgres;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant select on storage.buckets to authenticated, anon;

-- Supabase's implementation: every path segment except the final filename.
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $fn$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1 : array_length(parts, 1) - 1];
end;
$fn$;

create or replace function storage.filename(name text) returns text
language plpgsql immutable as $fn$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[array_length(parts, 1)];
end;
$fn$;

grant execute on function storage.foldername(text), storage.filename(text)
  to anon, authenticated, service_role;
`

export type TestDatabase = {
  readonly db: PGlite
  /** Run SQL as the migration owner (`postgres`). Bypasses RLS. */
  sql: <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>
  /** Run SQL as `authenticated` with the given user id in the JWT claims. */
  asUser: <T = Record<string, unknown>>(
    userId: string,
    query: string,
    params?: unknown[],
  ) => Promise<T[]>
  /** Run SQL as `anon` with no JWT claims. */
  asAnon: <T = Record<string, unknown>>(query: string, params?: unknown[]) => Promise<T[]>
  close: () => Promise<void>
}

export async function listMigrations(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR)
  return entries.filter((f) => f.endsWith('.sql')).sort()
}

/**
 * Boots a database and applies every migration in order. Throws with the
 * offending filename if a migration fails, so a broken migration is
 * immediately attributable.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = await new PGlite()

  await db.exec(SUPABASE_BOOTSTRAP)

  for (const file of await listMigrations()) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sql)
    } catch (error) {
      throw new Error(`Migration failed: ${file}\n${(error as Error).message}`)
    }
  }

  const sql = async <T = Record<string, unknown>>(query: string, params: unknown[] = []) => {
    const result = await db.query<T>(query, params)
    return result.rows
  }

  /**
   * Impersonation mirrors how PostgREST serves a request: set the verified JWT
   * claims, SET LOCAL ROLE, run the statement, then unwind. Everything happens
   * inside a transaction so a denied statement cannot leave the session dirty.
   */
  const runAs = async <T>(role: string, userId: string | null, query: string, params: unknown[]) => {
    const claims = userId
      ? JSON.stringify({ sub: userId, role, aal: 'aal1' })
      : JSON.stringify({ role })

    await db.exec('begin')
    try {
      await db.query('select set_config($1, $2, true)', ['request.jwt.claims', claims])
      await db.exec(`set local role ${role}`)
      const result = await db.query<T>(query, params)
      await db.exec('commit')
      return result.rows
    } catch (error) {
      await db.exec('rollback')
      throw error
    }
  }

  return {
    db,
    sql,
    asUser: <T = Record<string, unknown>>(userId: string, query: string, params: unknown[] = []) =>
      runAs<T>('authenticated', userId, query, params),
    asAnon: <T = Record<string, unknown>>(query: string, params: unknown[] = []) =>
      runAs<T>('anon', null, query, params),
    close: () => db.close(),
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export type Fixtures = {
  hqId: string
  alpha: TenantFixture
  beta: TenantFixture
}

export type TenantFixture = {
  institutionId: string
  adminId: string
  /** Teacher assigned to the tenant's class. */
  teacherId: string
  /** Teacher with no class assignment at all. */
  unassignedTeacherId: string
  /** Student enrolled in the class the assigned teacher teaches. */
  studentId: string
  /** Second student, so student-to-student access can be tested. */
  otherStudentId: string
  classId: string
  sectionId: string
  academicYearId: string
}

/**
 * Builds two complete, entirely separate institutions plus one HQ user.
 *
 * Tenant users are created by inserting into `auth.users` with app_metadata,
 * which means the provisioning trigger from migration 006 creates their
 * profiles. The fixture therefore exercises the real provisioning path rather
 * than writing profiles behind its back.
 */
export async function seedFixtures(t: TestDatabase): Promise<Fixtures> {
  // HQ is created by direct database administration, the documented bootstrap.
  // The Auth API cannot produce an HQ_ADMIN at all.
  const [{ id: hqId }] = await t.sql<{ id: string }>(`
    insert into auth.users (email, email_confirmed_at) values ('hq@aerofederation.test', now())
    returning id
  `)
  await t.sql(
    `insert into public.profiles (id, email, full_name, role, institution_id, status)
     values ($1, 'hq@aerofederation.test', 'HQ Operator', 'HQ_ADMIN', null, 'ACTIVE')`,
    [hqId],
  )

  const alpha = await seedTenant(t, 'alpha', hqId)
  const beta = await seedTenant(t, 'beta', hqId)

  return { hqId, alpha, beta }
}

async function seedTenant(t: TestDatabase, key: string, hqId: string): Promise<TenantFixture> {
  const [{ id: institutionId }] = await t.sql<{ id: string }>(
    `insert into public.institutions
       (slug, name, institution_type, category, official_email, country, status)
     values ($1, $2, 'AEROSPACE_INSTITUTION', 'PRIVATE', $3, 'India', 'PENDING')
     returning id`,
    [`${key}-institute`, `${key} Institute of Aerospace`, `contact@${key}.test`],
  )

  await t.sql(
    `update public.institutions
        set status = 'ACTIVE', approved_at = now(), approved_by = $2
      where id = $1`,
    [institutionId, hqId],
  )

  const tenantId = institutionId

  const provision = async (role: string, email: string, fullName: string) => {
    const [{ id }] = await t.sql<{ id: string }>(
      `insert into auth.users (email, email_confirmed_at, raw_app_meta_data)
       values ($1, now(), jsonb_build_object(
         'afi_role', $2::text,
         'afi_institution_id', $3::text,
         'afi_full_name', $4::text
       ))
       returning id`,
      [email, role, tenantId, fullName],
    )
    // Activation is an administrative act; the privilege-escalation trigger
    // permits it only for a privileged database role, which is what we are here.
    await t.sql(`update public.profiles set status = 'ACTIVE' where id = $1`, [id])
    return id
  }

  const adminId = await provision('INSTITUTION_ADMIN', `admin@${key}.test`, `${key} Admin`)
  const teacherId = await provision('TEACHER', `teacher@${key}.test`, `${key} Teacher`)
  const unassignedTeacherId = await provision('TEACHER', `spare@${key}.test`, `${key} Spare Teacher`)
  const studentId = await provision('STUDENT', `student@${key}.test`, `${key} Student`)
  const otherStudentId = await provision('STUDENT', `student2@${key}.test`, `${key} Student Two`)

  await t.sql(
    `insert into public.institution_admins (profile_id, institution_id, designation, is_primary, status)
     values ($1, $2, 'Principal', true, 'ACTIVE')`,
    [adminId, tenantId],
  )

  for (const [id, employee] of [
    [teacherId, 'T-001'],
    [unassignedTeacherId, 'T-002'],
  ] as const) {
    await t.sql(
      `insert into public.teachers (profile_id, institution_id, employee_id, status)
       values ($1, $2, $3, 'ACTIVE')`,
      [id, tenantId, employee],
    )
  }

  const [{ id: academicYearId }] = await t.sql<{ id: string }>(
    `insert into public.academic_years (institution_id, name, starts_on, ends_on, is_current, status)
     values ($1, '2026-27', '2026-06-01', '2027-05-31', true, 'ACTIVE')
     returning id`,
    [tenantId],
  )

  const [{ id: classId }] = await t.sql<{ id: string }>(
    `insert into public.classes (institution_id, academic_year_id, name, code, level_order)
     values ($1, $2, 'Aerodynamics I', 'AERO-1', 1)
     returning id`,
    [tenantId, academicYearId],
  )

  const [{ id: sectionId }] = await t.sql<{ id: string }>(
    `insert into public.sections (institution_id, class_id, name, capacity)
     values ($1, $2, 'A', 60)
     returning id`,
    [tenantId, classId],
  )

  for (const [id, code] of [
    [studentId, 'S-001'],
    [otherStudentId, 'S-002'],
  ] as const) {
    await t.sql(
      `insert into public.students
         (profile_id, institution_id, student_code, academic_year_id, class_id, section_id, status)
       values ($1, $2, $3, $4, $5, $6, 'ACTIVE')`,
      [id, tenantId, code, academicYearId, classId, sectionId],
    )
    await t.sql(
      `insert into public.student_enrollments
         (institution_id, student_id, class_id, section_id, academic_year_id, status)
       values ($1, $2, $3, $4, $5, 'ACTIVE')`,
      [tenantId, id, classId, sectionId, academicYearId],
    )
  }

  await t.sql(
    `insert into public.teacher_class_assignments
       (institution_id, teacher_id, class_id, section_id, academic_year_id, is_class_teacher, status)
     values ($1, $2, $3, $4, $5, true, 'ACTIVE')`,
    [tenantId, teacherId, classId, sectionId, academicYearId],
  )

  return {
    institutionId: tenantId,
    adminId,
    teacherId,
    unassignedTeacherId,
    studentId,
    otherStudentId,
    classId,
    sectionId,
    academicYearId,
  }
}
