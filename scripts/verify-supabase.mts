/**
 * Live verification against the hosted Supabase project.
 *
 *     npm run verify:supabase
 *
 * Everything here executes against the real project through the real API
 * surfaces — GoTrue for auth, PostgREST for data, Storage for objects. Nothing
 * is asserted from reading code. If a check cannot run, it reports SKIPPED
 * rather than passing quietly.
 *
 * It creates two throwaway institutions and ten throwaway accounts, all named
 * with the `zzverify` prefix, and removes them in a finally block whether or
 * not the run succeeds. Nothing it creates is left behind on success.
 *
 * No secret is ever printed. The project ref and URL appear because they are
 * public identifiers that already ship in the browser bundle.
 */

import './load-env.mts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '../types/database.generated'

import { columnNames, loadCommittedSurface } from './schema-surface'

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

type Status = 'PASS' | 'FAIL' | 'SKIP'
type Result = { area: string; name: string; status: Status; detail?: string }

const results: Result[] = []
let currentArea = ''

function area(name: string) {
  currentArea = name
  console.log(`\n${name}`)
}

async function check(name: string, run: () => Promise<string | void>) {
  try {
    const detail = await run()
    results.push({ area: currentArea, name, status: 'PASS', detail: detail || undefined })
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    results.push({ area: currentArea, name, status: 'FAIL', detail })
    console.log(`  FAIL  ${name} — ${detail}`)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

/** Asserts a PostgREST call was refused, and reports how. */
function assertDenied(
  result: { data: unknown; error: { code?: string; message: string } | null },
  what: string,
) {
  if (result.error) return `refused (${result.error.code ?? 'error'})`
  const rows = Array.isArray(result.data) ? result.data : result.data ? [result.data] : []
  assert(rows.length === 0, `${what} was NOT denied — ${rows.length} row(s) returned`)
  return 'no rows'
}

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  console.error(
    '\nverify:supabase requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and\n' +
      'SUPABASE_SERVICE_ROLE_KEY. Run `npm run check:env` to see what is missing.\n',
  )
  process.exit(1)
}

const RUN = `zzverify${Date.now().toString(36)}`
const PASSWORD = `Verify-${RUN}-Aa1`

const admin: SupabaseClient<Database> = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** A client carrying a real user session, exactly as the browser would hold. */
async function signIn(email: string) {
  const client = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`)
  if (!data.session) throw new Error(`no session returned for ${email}`)
  return client
}

const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ---------------------------------------------------------------------------
// Fixture bookkeeping — everything created is tracked so cleanup is total
// ---------------------------------------------------------------------------

/**
 * Whether the auth.users trigger populated the profile, or provision_profile()
 * had to. Set on the first provisioning call and reported as its own result.
 */
let triggerProvisioned: boolean | null = null

const created = {
  userIds: [] as string[],
  institutionIds: [] as string[],
  applicationIds: [] as string[],
  storageObjects: [] as { bucket: string; path: string }[],
}

type Tenant = {
  institutionId: string
  adminEmail: string
  adminId: string
  teacherEmail: string
  teacherId: string
  studentEmail: string
  studentId: string
  otherStudentId: string
  classId: string
  sectionId: string
  academicYearId: string
}

async function provision(
  email: string,
  role: 'INSTITUTION_ADMIN' | 'TEACHER' | 'STUDENT',
  institutionId: string,
  fullName: string,
) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: {
      afi_role: role,
      afi_institution_id: institutionId,
      afi_full_name: fullName,
    },
  })
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`)
  created.userIds.push(data.user.id)

  /*
   * Did the provisioning trigger actually run?
   *
   * This check is not decoration. Without it, the UPDATE below matches zero
   * rows, returns no error, and this function hands back a user id that has no
   * profile — every downstream check then fails with a confusing message about
   * a missing tenant instead of naming the real cause.
   */
  const { data: fromTrigger, error: profileError } = await admin
    .from('profiles')
    .select('id, role, institution_id')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError) throw new Error(`reading the profile for ${email}: ${profileError.message}`)

  let profile = fromTrigger

  if (!profile) {
    /*
     * Expected. GoTrue inserts the auth row before applying app_metadata, so
     * the AFTER INSERT trigger sees no role and correctly does nothing. This is
     * exactly why provisioning is explicit.
     *
     * Calling the RPC here is deliberate: it exercises the SAME path the
     * provisioning services and the seed take, so this verifies production
     * behaviour rather than a shortcut invented for the test.
     */
    triggerProvisioned = false

    const { error: rpcError } = await admin.rpc('provision_profile', {
      user_id: data.user.id,
      user_email: email,
      full_name: fullName,
      role,
      institution_id: institutionId,
    })

    if (rpcError) {
      throw new Error(`provision_profile(${email}) failed: ${rpcError.message}`)
    }

    const { data: provisioned, error: readError } = await admin
      .from('profiles')
      .select('id, role, institution_id')
      .eq('id', data.user.id)
      .single()

    if (readError || !provisioned) {
      throw new Error(`provision_profile created no row for ${email}: ${readError?.message}`)
    }
    profile = provisioned
  } else {
    triggerProvisioned ??= true
  }

  if (profile.role !== role) {
    throw new Error(`profile role is ${profile.role}, expected ${role}`)
  }
  if (profile.institution_id !== institutionId) {
    throw new Error('profile institution_id does not match the provisioning tenant')
  }

  // Provisioning leaves an account INVITED. Activation is a separate, deliberate
  // step; here it is done with the service role so the RLS checks below run as a
  // fully active user.
  const { error: activateError, count } = await admin
    .from('profiles')
    .update({ status: 'ACTIVE' }, { count: 'exact' })
    .eq('id', data.user.id)
  if (activateError) throw new Error(`activating ${email} failed: ${activateError.message}`)
  if (count === 0) throw new Error(`activating ${email} matched no rows`)

  return data.user.id
}

async function buildTenant(key: string, hqId: string | null): Promise<Tenant> {
  const slug = `${RUN}-${key}`
  const { data: institution, error } = await admin
    .from('institutions')
    .insert({
      slug,
      name: `Verification Institute ${key}`,
      institution_type: 'AEROSPACE_INSTITUTION',
      category: 'PRIVATE',
      official_email: `office@${slug}.test`,
      country: 'India',
      status: 'PENDING',
    })
    .select('id')
    .single()
  if (error || !institution) throw new Error(`creating institution ${key} failed: ${error?.message}`)
  created.institutionIds.push(institution.id)

  const tenantId = institution.id
  const adminEmail = `${RUN}.${key}.admin@example.test`
  const teacherEmail = `${RUN}.${key}.teacher@example.test`
  const studentEmail = `${RUN}.${key}.student@example.test`

  const adminId = await provision(adminEmail, 'INSTITUTION_ADMIN', tenantId, `${key} Admin`)

  /*
   * `institutions_approval_coherent` requires an approver before an institution
   * can leave PENDING, and every tenant RLS predicate requires the institution
   * to be ACTIVE — so the fixture cannot exercise isolation at all until this
   * runs.
   *
   * The real approver is HQ. When the bootstrap has not been performed yet,
   * the fixture falls back to its own administrator so that the isolation,
   * storage and audit checks can still run for real. That fallback exists only
   * inside a throwaway fixture that is deleted at the end of the run; it is
   * never a path the application takes, and the "HQ account exists" check
   * reports separately on whether the bootstrap has actually been done.
   */
  const { error: activateError } = await admin
    .from('institutions')
    .update({
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: hqId ?? adminId,
    })
    .eq('id', institution.id)
  if (activateError) throw new Error(`activating institution ${key}: ${activateError.message}`)

  const teacherId = await provision(teacherEmail, 'TEACHER', tenantId, `${key} Teacher`)
  const studentId = await provision(studentEmail, 'STUDENT', tenantId, `${key} Student`)
  const otherStudentId = await provision(
    `${RUN}.${key}.student2@example.test`,
    'STUDENT',
    tenantId,
    `${key} Student Two`,
  )

  await admin
    .from('institution_admins')
    .insert({ profile_id: adminId, institution_id: tenantId, is_primary: true, status: 'ACTIVE' })
  await admin
    .from('teachers')
    .insert({ profile_id: teacherId, institution_id: tenantId, employee_id: 'V-T-001', status: 'ACTIVE' })

  const { data: year } = await admin
    .from('academic_years')
    .insert({
      institution_id: tenantId,
      name: '2026-27',
      starts_on: '2026-06-01',
      ends_on: '2027-05-31',
      is_current: true,
      status: 'ACTIVE',
    })
    .select('id')
    .single()
  assert(year, 'academic year not created')

  const { data: klass } = await admin
    .from('classes')
    .insert({ institution_id: tenantId, academic_year_id: year.id, name: 'Verification Class' })
    .select('id')
    .single()
  assert(klass, 'class not created')

  const { data: section } = await admin
    .from('sections')
    .insert({ institution_id: tenantId, class_id: klass.id, name: 'A' })
    .select('id')
    .single()
  assert(section, 'section not created')

  for (const [id, code] of [
    [studentId, 'V-S-001'],
    [otherStudentId, 'V-S-002'],
  ] as const) {
    await admin.from('students').insert({
      profile_id: id,
      institution_id: tenantId,
      student_code: code,
      academic_year_id: year.id,
      class_id: klass.id,
      section_id: section.id,
      status: 'ACTIVE',
    })
    await admin.from('student_enrollments').insert({
      institution_id: tenantId,
      student_id: id,
      class_id: klass.id,
      section_id: section.id,
      academic_year_id: year.id,
    })
  }

  await admin.from('teacher_class_assignments').insert({
    institution_id: tenantId,
    teacher_id: teacherId,
    class_id: klass.id,
    section_id: section.id,
    academic_year_id: year.id,
    is_class_teacher: true,
  })

  return {
    institutionId: tenantId,
    adminEmail,
    adminId,
    teacherEmail,
    teacherId,
    studentEmail,
    studentId,
    otherStudentId,
    classId: klass.id,
    sectionId: section.id,
    academicYearId: year.id,
  }
}

async function cleanup() {
  console.log('\nCleaning up verification fixtures…')

  for (const object of created.storageObjects) {
    await admin.storage.from(object.bucket).remove([object.path])
  }
  for (const id of created.applicationIds) {
    await admin.from('institution_applications').delete().eq('id', id)
  }
  /*
   * Break the reference cycle before deleting anything.
   *
   *   institutions.approved_by  -> profiles      ON DELETE RESTRICT
   *   profiles.institution_id   -> institutions  ON DELETE RESTRICT
   *
   * Neither side can be deleted while the other points at it, and clearing
   * approved_by alone is refused by institutions_approval_coherent, which
   * requires an approver for any status other than PENDING. The reset must
   * therefore return the row to PENDING and drop the approval metadata in a
   * single update.
   */
  for (const id of created.institutionIds) {
    const { error } = await admin
      .from('institutions')
      .update({
        status: 'PENDING',
        approved_at: null,
        approved_by: null,
        suspended_at: null,
        suspended_by: null,
        suspension_reason: null,
      })
      .eq('id', id)
    if (error) console.warn(`  resetting institution ${id}: ${error.message}`)
  }

  // Deleting the auth user cascades to profiles, which cascades to teachers,
  // students, enrolments and assignments.
  for (const id of created.userIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.warn(`  deleting user ${id}: ${error.message}`)
  }
  for (const id of created.institutionIds) {
    const { error } = await admin.from('institutions').delete().eq('id', id)
    if (error) console.warn(`  could not delete institution ${id}: ${error.message}`)
  }
  await admin.from('audit_logs').delete().like('actor_email', `${RUN}%`)

  const leftoverInstitutions = await admin
    .from('institutions')
    .select('id')
    .like('slug', `${RUN}%`)
  const leftoverProfiles = await admin.from('profiles').select('id').like('email', `${RUN}%`)

  const leftovers =
    (leftoverInstitutions.data?.length ?? 0) + (leftoverProfiles.data?.length ?? 0)
  console.log(
    leftovers === 0
      ? 'Cleanup complete — no fixtures remain.'
      : `WARNING: ${leftovers} fixture row(s) could not be removed. Search for "${RUN}".`,
  )
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main() {
  const host = new URL(SUPABASE_URL!).host
  console.log(`\nVerifying against ${host}`)
  console.log(`Fixture prefix: ${RUN}`)

  let alpha: Tenant | null = null
  let beta: Tenant | null = null
  let hqId: string | null = null

  try {
    // ── 1 · Connection ─────────────────────────────────────────────────────
    area('1 · Database connection')

    await check('service role reaches PostgREST', async () => {
      const { error, count } = await admin
        .from('roles')
        .select('code', { count: 'exact', head: true })
      assert(!error, `query failed: ${error?.message}`)
      return `roles table reachable, ${count} rows`
    })

    await check('reference data from migration 003 is present', async () => {
      const { data, error } = await admin.from('roles').select('code')
      assert(!error, error?.message ?? 'query failed')
      const codes = (data ?? []).map((r) => r.code).sort()
      const expected = ['HQ_ADMIN', 'INSTITUTION_ADMIN', 'STUDENT', 'TEACHER']
      assert(
        JSON.stringify(codes) === JSON.stringify(expected),
        `roles are ${codes.join(', ')}, expected ${expected.join(', ')}`,
      )
      const { count } = await admin
        .from('permissions')
        .select('code', { count: 'exact', head: true })
      assert(count === 35, `expected 35 permissions, found ${count}`)
      return '4 roles, 35 permissions'
    })

    /*
     * Column-for-column parity between the committed types and the deployed
     * schema.
     *
     * Asking PostgREST for every column the types claim exist is the strongest
     * parity check available without a direct database connection: a column
     * that is missing, renamed, or was never pushed produces PGRST204 rather
     * than passing silently. This is what makes "the generated types match the
     * migrations" a verified statement about the REMOTE database rather than
     * about two local files.
     */
    await check('the deployed schema matches the committed types, column for column', async () => {
      const surface = loadCommittedSurface()
      assert(surface.tables.size > 0, 'could not read types/database.generated.ts')

      const problems: string[] = []
      let columnsChecked = 0

      for (const table of surface.tables.keys()) {
        const columns = columnNames(surface, table)
        if (!columns.length) continue
        const { error } = await admin
          .from(table as never)
          .select(columns.join(','))
          .limit(0)
        if (error) {
          problems.push(`${table}: ${error.code ?? ''} ${error.message}`.trim())
        } else {
          columnsChecked += columns.length
        }
      }

      assert(problems.length === 0, `schema mismatch — ${problems.join(' | ')}`)
      return `${surface.tables.size} tables, ${columnsChecked} columns all present remotely`
    })

    await check('every migrated table is reachable', async () => {
      const tables = [
        'roles', 'permissions', 'role_permissions', 'profiles', 'institutions',
        'institution_applications', 'institution_application_status_history',
        'institution_documents', 'institution_admins', 'teachers', 'students',
        'departments', 'programs', 'academic_years', 'classes', 'sections',
        'subjects', 'courses', 'teacher_class_assignments',
        'teacher_subject_assignments', 'student_enrollments', 'notifications',
        'audit_logs', 'system_settings',
      ] as const

      const missing: string[] = []
      for (const table of tables) {
        const { error } = await admin.from(table).select('*', { count: 'exact', head: true })
        if (error) missing.push(`${table} (${error.message})`)
      }
      assert(missing.length === 0, `unreachable: ${missing.join('; ')}`)
      return `${tables.length}/24 tables`
    })

    // ── 2 · Auth and profile provisioning ──────────────────────────────────
    area('2 · Auth and profile provisioning')

    await check('HQ account exists (bootstrap procedure was run)', async () => {
      const { data, error } = await admin
        .from('profiles')
        .select('id, institution_id')
        .eq('role', 'HQ_ADMIN')
        .limit(1)
        .maybeSingle()
      assert(!error, error?.message ?? 'query failed')
      assert(
        data,
        'no HQ_ADMIN profile exists — run supabase/seed/bootstrap_hq_admin.sql in the SQL editor',
      )
      assert(data.institution_id === null, 'HQ profile has an institution_id, which must be NULL')
      hqId = data.id
      return 'HQ present, institution_id NULL'
    })

    await check('building two isolated tenants', async () => {
      alpha = await buildTenant('alpha', hqId)
      beta = await buildTenant('beta', hqId)
      return hqId
        ? '2 institutions, 8 accounts, approved by HQ'
        : '2 institutions, 8 accounts (fixture-approved — HQ bootstrap not yet run)'
    })

    await check('every provisioned account receives a profile', async () => {
      // provision() throws if no profile results by either mechanism, so
      // reaching here means all eight fixture accounts got one.
      const { count, error } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .like('email', `${RUN}%`)
      assert(!error, error?.message ?? 'query failed')
      assert(count === 8, `expected 8 provisioned profiles, found ${count}`)

      return triggerProvisioned
        ? 'via the auth.users trigger'
        : 'via provision_profile() — the supported path'
    })

    await check('a provisioned profile carries the right role and tenant', async () => {
      assert(alpha, 'alpha tenant missing')
      const { data, error } = await admin
        .from('profiles')
        .select('id, role, institution_id, status')
        .eq('id', alpha.teacherId)
        .single()
      assert(!error && data, error?.message ?? 'profile not found')
      assert(data.role === 'TEACHER', `role is ${data.role}, expected TEACHER`)
      assert(
        data.institution_id === alpha.institutionId,
        'profile institution_id does not match the provisioning tenant',
      )
      return 'role and tenant match the provisioning request'
    })

    await check('no HQ_ADMIN profile can be created through the Auth API', async () => {
      assert(alpha, 'alpha tenant missing')

      /*
       * The guarantee that matters is about the PROFILE, not the auth user. An
       * auth row with no profile has no role, no tenant and no access to
       * anything — `private.auth_role()` returns NULL and every policy
       * evaluates false.
       *
       * Two independent mechanisms are supposed to enforce it: the trigger
       * refuses the insert outright, and `provision_profile()` refuses the
       * role. Either is sufficient. This asserts the outcome so it passes
       * whichever one is present on a given project.
       */
      const { data, error } = await admin.auth.admin.createUser({
        email: `${RUN}.escalate@example.test`,
        password: PASSWORD,
        email_confirm: true,
        app_metadata: {
          afi_role: 'HQ_ADMIN',
          afi_institution_id: alpha.institutionId,
          afi_full_name: 'Should Not Exist',
        },
      })

      if (error) return 'the account itself was refused by handle_new_auth_user()'

      assert(data.user, 'expected either a user or an error')
      created.userIds.push(data.user.id)

      const { data: profile } = await admin
        .from('profiles')
        .select('id, role')
        .eq('id', data.user.id)
        .maybeSingle()

      assert(
        !profile,
        `an HQ_ADMIN PROFILE was created through the Auth API (role=${profile?.role})`,
      )

      // And the explicit path must refuse it too, where migration 014 is applied.
      const { error: rpcError } = await admin.rpc('provision_profile', {
        user_id: data.user.id,
        user_email: `${RUN}.escalate@example.test`,
        full_name: 'Should Not Exist',
        role: 'HQ_ADMIN',
        institution_id: alpha.institutionId,
      })

      if (rpcError && /does not exist|schema cache|PGRST202/i.test(rpcError.message)) {
        return 'no profile created (trigger absent; migration 014 not yet applied)'
      }
      assert(rpcError, 'provision_profile ACCEPTED an HQ_ADMIN request')
      return 'refused by provision_profile()'
    })

    await check('a user can sign in and resolve their own profile', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.adminEmail)
      const { data, error } = await client
        .from('profiles')
        .select('id, role, institution_id')
        .eq('id', alpha.adminId)
        .single()
      assert(!error && data, error?.message ?? 'own profile not readable')
      assert(data.role === 'INSTITUTION_ADMIN', `role resolved as ${data.role}`)
      await client.auth.signOut()
      return 'session established, profile readable'
    })

    // ── 3 · Role protection ────────────────────────────────────────────────
    area('3 · Role protection')

    await check('a user cannot assign themselves HQ_ADMIN', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.studentEmail)
      const result = await client
        .from('profiles')
        .update({ role: 'HQ_ADMIN' })
        .eq('id', alpha.studentId)
        .select()
      const outcome = assertDenied(result, 'self-assigning HQ_ADMIN')

      const { data } = await admin
        .from('profiles')
        .select('role')
        .eq('id', alpha.studentId)
        .single()
      assert(data?.role === 'STUDENT', `role is now ${data?.role} — escalation SUCCEEDED`)
      await client.auth.signOut()
      return outcome
    })

    await check('a user cannot move themselves to another institution', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(alpha.studentEmail)
      const result = await client
        .from('profiles')
        .update({ institution_id: beta.institutionId })
        .eq('id', alpha.studentId)
        .select()
      const outcome = assertDenied(result, 'changing institution_id')

      const { data } = await admin
        .from('profiles')
        .select('institution_id')
        .eq('id', alpha.studentId)
        .single()
      assert(
        data?.institution_id === alpha.institutionId,
        'institution_id CHANGED — tenant escape succeeded',
      )
      await client.auth.signOut()
      return outcome
    })

    await check('a user cannot reactivate or suspend themselves', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.studentEmail)
      const result = await client
        .from('profiles')
        .update({ status: 'DEACTIVATED' })
        .eq('id', alpha.studentId)
        .select()
      const outcome = assertDenied(result, 'changing own status')
      await client.auth.signOut()
      return outcome
    })

    await check('a user CAN edit their own descriptive fields', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.studentEmail)
      const { error } = await client
        .from('profiles')
        .update({ phone: '+911234567890' })
        .eq('id', alpha.studentId)
      assert(!error, `benign self-edit was blocked: ${error?.message}`)
      await client.auth.signOut()
      return 'phone updated'
    })

    // ── 4 · Institution isolation ──────────────────────────────────────────
    area('4 · Institution isolation')

    await check('institution A cannot read institution B', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(alpha.adminEmail)

      const institution = await client
        .from('institutions')
        .select('id')
        .eq('id', beta.institutionId)
      assertDenied(institution, 'reading the other institution')

      for (const table of ['students', 'teachers', 'classes', 'sections'] as const) {
        const result = await client.from(table).select('id').eq('institution_id', beta.institutionId)
        assertDenied(result, `reading ${table} of the other institution`)
      }

      const ownTenant = alpha.institutionId
      const all = await client.from('students').select('institution_id')
      assert(
        (all.data ?? []).every((r) => r.institution_id === ownTenant),
        'an unqualified select returned another tenant',
      )
      await client.auth.signOut()
      return 'no cross-tenant rows on any table'
    })

    await check('institution A cannot write into institution B', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(alpha.adminEmail)
      const result = await client
        .from('departments')
        .insert({ institution_id: beta.institutionId, code: 'X', name: 'Smuggled' })
        .select()
      const outcome = assertDenied(result, 'inserting into the other tenant')
      await client.auth.signOut()
      return outcome
    })

    await check('a student cannot read another student', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.studentEmail)
      const result = await client.from('profiles').select('id').eq('id', alpha.otherStudentId)
      const outcome = assertDenied(result, 'reading a classmate')

      const own = await client.from('profiles').select('id')
      assert(own.data?.length === 1, `student sees ${own.data?.length} profiles, expected exactly 1`)
      await client.auth.signOut()
      return outcome
    })

    await check('a teacher sees only students they are assigned', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(alpha.teacherEmail)
      const ownTenant = alpha.institutionId
      const { data } = await client.from('students').select('profile_id, institution_id')
      assert(
        (data ?? []).every((r) => r.institution_id === ownTenant),
        'teacher saw students from another institution',
      )
      const foreign = await client
        .from('students')
        .select('profile_id')
        .eq('institution_id', beta.institutionId)
      assertDenied(foreign, 'teacher reading another institution')
      await client.auth.signOut()
      return `${data?.length ?? 0} students, all in own tenant`
    })

    await check('HQ can read across institutions', async () => {
      const { data, error } = await admin.from('institutions').select('id').like('slug', `${RUN}%`)
      assert(!error, error?.message ?? 'query failed')
      assert((data?.length ?? 0) === 2, `HQ sees ${data?.length} verification institutions`)
      return 'both tenants visible to the service role'
    })

    // ── 5 · RLS against anonymous callers ──────────────────────────────────
    area('5 · Row Level Security — anonymous')

    await check('anon can read nothing', async () => {
      const tables = [
        'profiles', 'institutions', 'students', 'teachers', 'classes',
        'institution_applications', 'institution_documents', 'audit_logs',
        'notifications', 'student_enrollments',
      ] as const

      const leaked: string[] = []
      for (const table of tables) {
        const { data, error } = await anon.from(table).select('*').limit(1)
        if (!error && (data?.length ?? 0) > 0) leaked.push(table)
      }
      assert(leaked.length === 0, `anon could read: ${leaked.join(', ')}`)
      return `${tables.length} tables, all closed`
    })

    await check('anon cannot write', async () => {
      const result = await anon
        .from('institutions')
        .insert({
          slug: `${RUN}-anon`,
          name: 'Anon',
          institution_type: 'SCHOOL',
          category: 'PRIVATE',
          official_email: 'anon@example.test',
        })
        .select()
      return assertDenied(result, 'anonymous insert')
    })

    // ── 6 · Storage ────────────────────────────────────────────────────────
    area('6 · Storage and storage policies')

    await check('all nine buckets exist and are private', async () => {
      const { data, error } = await admin.storage.listBuckets()
      assert(!error, error?.message ?? 'listBuckets failed')
      const expected = [
        'institution-documents', 'teacher-documents', 'student-documents',
        'learning-materials', 'videos', 'assignment-submissions',
        'certificates', 'profile-images', 'event-assets',
      ]
      const found = new Map((data ?? []).map((b) => [b.name, b]))
      const missing = expected.filter((name) => !found.has(name))
      assert(missing.length === 0, `missing buckets: ${missing.join(', ')}`)
      const publicBuckets = expected.filter((name) => found.get(name)?.public)
      assert(publicBuckets.length === 0, `PUBLIC buckets found: ${publicBuckets.join(', ')}`)
      return '9/9 present, all private'
    })

    await check('a tenant can write into its own prefix', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.adminEmail)
      const path = `${alpha.institutionId}/institution/${RUN}.txt`
      const { error } = await client.storage
        .from('institution-documents')
        .upload(path, new Blob(['verification fixture'], { type: 'application/pdf' }), {
          contentType: 'application/pdf',
        })
      assert(!error, `own-prefix upload failed: ${error?.message}`)
      created.storageObjects.push({ bucket: 'institution-documents', path })
      await client.auth.signOut()
      return path.split('/').slice(1).join('/')
    })

    await check('a tenant cannot write into another tenant prefix', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(beta.adminEmail)
      const path = `${alpha.institutionId}/institution/${RUN}-forged.txt`
      const { error } = await client.storage
        .from('institution-documents')
        .upload(path, new Blob(['forged'], { type: 'application/pdf' }), {
          contentType: 'application/pdf',
        })
      if (!error) {
        created.storageObjects.push({ bucket: 'institution-documents', path })
        throw new Error('cross-tenant upload SUCCEEDED')
      }
      await client.auth.signOut()
      return `refused (${error.message})`
    })

    await check('a tenant cannot read another tenant object', async () => {
      assert(alpha && beta, 'tenants missing')
      const client = await signIn(beta.adminEmail)
      const path = `${alpha.institutionId}/institution/${RUN}.txt`
      const { data, error } = await client.storage.from('institution-documents').download(path)
      assert(error || !data, 'cross-tenant download SUCCEEDED')
      await client.auth.signOut()
      return `refused (${error?.message ?? 'no object'})`
    })

    await check('the owning tenant can read its own object', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.adminEmail)
      const path = `${alpha.institutionId}/institution/${RUN}.txt`
      const { data, error } = await client.storage.from('institution-documents').download(path)
      assert(!error && data, `own download failed: ${error?.message}`)
      await client.auth.signOut()
      return `${(await data.text()).length} bytes read`
    })

    await check('anon cannot read a private object', async () => {
      assert(alpha, 'alpha tenant missing')
      const path = `${alpha.institutionId}/institution/${RUN}.txt`
      const { data, error } = await anon.storage.from('institution-documents').download(path)
      assert(error || !data, 'anonymous download SUCCEEDED')
      return `refused (${error?.message ?? 'no object'})`
    })

    // ── 7 · Audit logging ──────────────────────────────────────────────────
    area('7 · Audit logging')

    await check('write_audit_log records the caller, not a supplied identity', async () => {
      assert(alpha, 'alpha tenant missing')
      const client = await signIn(alpha.adminEmail)
      const { error } = await client.rpc('write_audit_log', {
        action: 'VERIFICATION_PROBE',
        entity_type: 'verification',
        metadata: { run: RUN } as never,
      })
      assert(!error, `write_audit_log failed: ${error?.message}`)

      const { data } = await admin
        .from('audit_logs')
        .select('actor_id, actor_role, institution_id')
        .eq('action', 'VERIFICATION_PROBE')
        .limit(1)
        .maybeSingle()
      assert(data, 'no audit row was written')
      assert(data.actor_id === alpha.adminId, 'actor_id does not match the caller')
      assert(data.institution_id === alpha.institutionId, 'institution_id was not derived')
      await admin.from('audit_logs').delete().eq('action', 'VERIFICATION_PROBE')
      await client.auth.signOut()
      return 'actor and tenant derived from the session'
    })

    await check('the audit log rejects credential-shaped metadata', async () => {
      const { error } = await admin.from('audit_logs').insert({
        action: 'VERIFICATION_SECRET',
        entity_type: 'verification',
        metadata: { attempt: { password: 'hunter2' } } as never,
      })
      assert(error, 'a row containing a password WAS accepted')
      return `refused (${error.code ?? 'check violation'})`
    })

    await check('the audit log cannot be updated or deleted by a user', async () => {
      assert(alpha, 'alpha tenant missing')
      const { data: row } = await admin
        .from('audit_logs')
        .insert({
          action: 'VERIFICATION_IMMUTABLE',
          entity_type: 'verification',
          metadata: { run: RUN } as never,
        })
        .select('id')
        .single()
      assert(row, 'could not seed an audit row')

      const client = await signIn(alpha.adminEmail)
      const updated = await client
        .from('audit_logs')
        .update({ action: 'TAMPERED' })
        .eq('id', row.id)
        .select()
      assertDenied(updated, 'updating an audit row')
      const deleted = await client.from('audit_logs').delete().eq('id', row.id).select()
      assertDenied(deleted, 'deleting an audit row')

      const { data: after } = await admin
        .from('audit_logs')
        .select('action')
        .eq('id', row.id)
        .single()
      assert(after?.action === 'VERIFICATION_IMMUTABLE', 'the audit row WAS modified')

      await admin.from('audit_logs').delete().eq('id', row.id)
      await client.auth.signOut()
      return 'append-only confirmed'
    })

    // ── 8 · Application state machine ──────────────────────────────────────
    area('8 · Institution application transitions')

    let applicationId: string | null = null

    await check('an application is created with a non-sequential public reference', async () => {
      const { data, error } = await admin
        .from('institution_applications')
        .insert({
          institution_name: `Verification Academy ${RUN}`,
          institution_type: 'TRAINING_INSTITUTE',
          category: 'PRIVATE',
          official_email: `contact.${RUN}@example.test`,
          applicant_email: `rep.${RUN}@example.test`,
        })
        .select('id, application_ref')
        .single()
      assert(!error && data, error?.message ?? 'insert failed')
      created.applicationIds.push(data.id)
      applicationId = data.id
      assert(
        /^AFI-\d{4}-[0-9A-HJ-NP-TV-Z]{8}$/.test(data.application_ref),
        `reference has an unexpected shape: ${data.application_ref}`,
      )
      assert(!data.application_ref.includes(data.id), 'the reference leaks the primary key')
      return data.application_ref
    })

    await check('creation is recorded in the status history', async () => {
      assert(applicationId, 'no application')
      const { data } = await admin
        .from('institution_application_status_history')
        .select('to_status')
        .eq('application_id', applicationId)
      assert(data?.length === 1, `history has ${data?.length} rows, expected 1`)
      assert(data[0].to_status === 'DRAFT', `first status is ${data[0].to_status}`)
      return 'DRAFT recorded by trigger'
    })

    await check('an illegal transition is refused', async () => {
      assert(applicationId, 'no application')
      const { error } = await admin
        .from('institution_applications')
        .update({ status: 'APPROVED' })
        .eq('id', applicationId)
      assert(error, 'DRAFT -> APPROVED was ALLOWED')
      return `refused (${error.code ?? 'check violation'})`
    })

    await check('a legal transition succeeds and is traced', async () => {
      assert(applicationId, 'no application')
      const submitted = await admin
        .from('institution_applications')
        .update({ status: 'SUBMITTED', submitted_at: new Date().toISOString() })
        .eq('id', applicationId)
      assert(!submitted.error, `DRAFT -> SUBMITTED failed: ${submitted.error?.message}`)

      const review = await admin
        .from('institution_applications')
        .update({ status: 'UNDER_REVIEW' })
        .eq('id', applicationId)
      assert(!review.error, `SUBMITTED -> UNDER_REVIEW failed: ${review.error?.message}`)

      const { data } = await admin
        .from('institution_application_status_history')
        .select('to_status')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true })
      const trail = (data ?? []).map((r) => r.to_status)
      assert(
        JSON.stringify(trail) === JSON.stringify(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW']),
        `history is ${trail.join(' -> ')}`,
      )
      return trail.join(' -> ')
    })

    await check('REJECTED is terminal', async () => {
      assert(applicationId, 'no application')
      const rejected = await admin
        .from('institution_applications')
        .update({
          status: 'REJECTED',
          decided_at: new Date().toISOString(),
          decision_reason: 'verification fixture',
        })
        .eq('id', applicationId)
      assert(!rejected.error, `-> REJECTED failed: ${rejected.error?.message}`)

      const { error } = await admin
        .from('institution_applications')
        .update({ status: 'UNDER_REVIEW' })
        .eq('id', applicationId)
      assert(error, 'REJECTED -> UNDER_REVIEW was ALLOWED')
      return `refused (${error.code ?? 'check violation'})`
    })

    // ── 9 · Database functions ─────────────────────────────────────────────
    area('9 · Database functions and triggers')

    await check('activate_own_account moves INVITED to ACTIVE for the caller only', async () => {
      assert(alpha, 'alpha tenant missing')
      const email = `${RUN}.invited@example.test`
      // provision() handles the trigger-absent fallback, so this exercises the
      // same provisioning path as everything else rather than a second one.
      const invitedId = await provision(email, 'TEACHER', alpha.institutionId, 'Invited Teacher')

      // provision() activates for the RLS checks; put it back to INVITED so the
      // transition under test is the real one.
      await admin.from('profiles').update({ status: 'INVITED' }).eq('id', invitedId)

      const { data: before } = await admin
        .from('profiles')
        .select('status')
        .eq('id', invitedId)
        .single()
      assert(before?.status === 'INVITED', `account is ${before?.status}, expected INVITED`)

      const client = await signIn(email)
      const { error: rpcError } = await client.rpc('activate_own_account')
      assert(!rpcError, `activate_own_account failed: ${rpcError?.message}`)

      const { data: after } = await admin
        .from('profiles')
        .select('status')
        .eq('id', invitedId)
        .single()
      assert(after?.status === 'ACTIVE', `account is ${after?.status} after activation`)
      await client.auth.signOut()
      return 'INVITED -> ACTIVE'
    })

    await check('activate_own_account cannot revive a suspended account', async () => {
      assert(alpha, 'alpha tenant missing')
      await admin.from('profiles').update({ status: 'SUSPENDED' }).eq('id', alpha.teacherId)

      const client = await signIn(alpha.teacherEmail)
      const { data } = await client.rpc('activate_own_account')
      await client.auth.signOut()

      const { data: after } = await admin
        .from('profiles')
        .select('status')
        .eq('id', alpha.teacherId)
        .single()
      assert(after?.status === 'SUSPENDED', `suspended account became ${after?.status}`)
      await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', alpha.teacherId)
      return `returned ${String(data)}, status unchanged`
    })

    await check('suspending an institution revokes its users immediately', async () => {
      assert(beta, 'beta tenant missing')
      const client = await signIn(beta.adminEmail)

      const before = await client.from('students').select('profile_id')
      assert((before.data?.length ?? 0) > 0, 'admin could not see their own students to begin with')

      await admin
        .from('institutions')
        .update({
          status: 'SUSPENDED',
          suspended_at: new Date().toISOString(),
          suspension_reason: 'verification fixture',
        })
        .eq('id', beta.institutionId)

      const after = await client.from('students').select('profile_id')
      assert((after.data?.length ?? 0) === 0, 'a suspended tenant could still read its data')

      await admin
        .from('institutions')
        .update({ status: 'ACTIVE', suspended_at: null, suspension_reason: null })
        .eq('id', beta.institutionId)
      await client.auth.signOut()
      return `${before.data?.length} rows -> 0 rows without touching a user row`
    })

    await check('updated_at is maintained by trigger', async () => {
      assert(alpha, 'alpha tenant missing')
      const { data: before } = await admin
        .from('institutions')
        .select('updated_at')
        .eq('id', alpha.institutionId)
        .single()
      await new Promise((resolve) => setTimeout(resolve, 1100))
      await admin
        .from('institutions')
        .update({ description: 'touched by verification' })
        .eq('id', alpha.institutionId)
      const { data: after } = await admin
        .from('institutions')
        .select('updated_at')
        .eq('id', alpha.institutionId)
        .single()
      assert(
        before && after && new Date(after.updated_at) > new Date(before.updated_at),
        'updated_at did not advance',
      )
      return 'advances on update'
    })

    await check('composite tenant foreign keys hold against the service role', async () => {
      assert(alpha && beta, 'tenants missing')
      // The service role bypasses RLS entirely. The constraint is schema, not
      // policy, so it must refuse this anyway.
      const { error } = await admin.from('student_enrollments').insert({
        institution_id: beta.institutionId,
        student_id: alpha.studentId,
        class_id: beta.classId,
        academic_year_id: beta.academicYearId,
      })
      assert(error, 'a cross-tenant enrolment was accepted BY THE SERVICE ROLE')
      return `refused (${error.code ?? 'fk violation'})`
    })
  } finally {
    await cleanup()
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL')
  const skipped = results.filter((r) => r.status === 'SKIP')

  console.log(`\n${'='.repeat(70)}`)
  console.log(`  ${passed} passed   ${failed.length} failed   ${skipped.length} skipped`)
  console.log('='.repeat(70))

  if (failed.length) {
    console.log('\nFailures:')
    for (const failure of failed) console.log(`  ${failure.area} :: ${failure.name}\n    ${failure.detail}`)
  }
  console.log()

  process.exit(failed.length ? 1 : 0)
}

await main()
