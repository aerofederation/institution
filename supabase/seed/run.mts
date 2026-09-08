/**
 * Development seed.
 *
 *     npm run db:seed
 *
 * Creates one demonstration institution with an administrator, three teachers,
 * six students and a complete academic structure, so the platform can be
 * exercised end to end without hand-entering data.
 *
 * Three deliberate properties:
 *
 *   1. Every record is visibly marked as demonstration data — the institution
 *      slug starts with `demo-`, its name ends with "(Demo)", and every address
 *      is example.test. Nothing here can be mistaken for a real institution.
 *
 *   2. NO HQ ADMINISTRATOR IS CREATED. An HQ account is the most privileged
 *      thing on the platform and must never exist because a seed script ran.
 *      HQ is bootstrapped deliberately by an operator — see
 *      `bootstrap_hq_admin.sql` in this directory.
 *
 *   3. It refuses to run against a hosted database unless `--allow-remote` is
 *      passed, so `npm run db:seed` with production credentials loaded is a
 *      no-op rather than an incident.
 *
 * Accounts are created through the Auth admin API and their profiles through
 * `provision_profile()` — the same two steps the provisioning services take, so
 * seeding exercises the real path rather than a shortcut. They are left INVITED
 * with no password, exactly as real provisioning leaves them.
 */
import '../../scripts/load-env.mts'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type Env = {
  url: string
  serviceKey: string
  appUrl: string
}

function readEnv(): Env {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !serviceKey && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean)

  if (missing.length) {
    console.error(
      `\nCannot seed: missing ${missing.join(', ')}.\n\n` +
        'Copy .env.example to .env.local, fill in the Supabase values, then run:\n' +
        '  npx dotenv-cli -e .env.local -- npm run db:seed\n',
    )
    process.exit(1)
  }

  return { url: url!, serviceKey: serviceKey!, appUrl }
}

const DEMO = {
  slug: 'demo-aerospace-academy',
  name: 'Demo Aerospace Academy (Demo)',
  domain: 'example.test',
} as const

const TEACHERS = [
  { name: 'Aditi Ramesh', employee: 'DEMO-T-001', subject: 'Aerodynamics' },
  { name: 'Vikram Nair', employee: 'DEMO-T-002', subject: 'Propulsion' },
  { name: 'Farah Qureshi', employee: 'DEMO-T-003', subject: 'Avionics' },
] as const

const STUDENTS = [
  'Ishaan Kulkarni',
  'Meera Das',
  'Rohan Bhatt',
  'Sana Iqbal',
  'Karthik Menon',
  'Priya Verma',
] as const

function emailFor(name: string, suffix: string) {
  const local = name.toLowerCase().replace(/[^a-z]+/g, '.')
  return `${local}.${suffix}@${DEMO.domain}`
}

async function provision(
  admin: SupabaseClient,
  options: {
    email: string
    fullName: string
    role: 'INSTITUTION_ADMIN' | 'TEACHER' | 'STUDENT'
    institutionId: string
  },
): Promise<string> {
  const existing = await admin
    .from('profiles')
    .select('id')
    .eq('email', options.email)
    .maybeSingle()

  if (existing.data?.id) return existing.data.id

  const { data, error } = await admin.auth.admin.createUser({
    email: options.email,
    email_confirm: false,
    // app_metadata, never user_metadata: this is what the provisioning trigger
    // reads, and it is writable only with the service role.
    app_metadata: {
      afi_role: options.role,
      afi_institution_id: options.institutionId,
      afi_full_name: options.fullName,
    },
  })

  if (error || !data.user) {
    throw new Error(`Could not create ${options.email}: ${error?.message ?? 'unknown error'}`)
  }

  /*
   * Create the profile explicitly.
   *
   * Migration 006 installs a trigger on auth.users that does this
   * automatically, but Supabase restricts the auth schema and the trigger is
   * not installable on every project — where it is missing, the account is
   * created and no profile appears, silently. `provision_profile()` is the
   * dependable path and is idempotent, so it is correct to call whether or not
   * the trigger fired.
   */
  const { error: provisionError } = await admin.rpc('provision_profile', {
    user_id: data.user.id,
    user_email: options.email,
    full_name: options.fullName,
    role: options.role,
    institution_id: options.institutionId,
  })

  if (provisionError) {
    if (/does not exist|schema cache|PGRST202/i.test(provisionError.message)) {
      throw new Error(
        'public.provision_profile() is missing from this project. Apply the migrations first:\n' +
          '  npm run db:push',
      )
    }
    throw new Error(`Could not provision a profile for ${options.email}: ${provisionError.message}`)
  }

  return data.user.id
}

async function main() {
  const env = readEnv()
  const allowRemote = process.argv.includes('--allow-remote')

  /*
   * The guard checks the SUPABASE host, not NEXT_PUBLIC_APP_URL.
   *
   * The app URL says where the browser points; it says nothing about which
   * database receives the rows. Running a local dev server against a hosted
   * project is the normal setup, and keying the guard off the app URL would
   * have waved demonstration data straight into it.
   */
  const target = new URL(env.url).host
  const isLocalDatabase = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(target)

  if (!isLocalDatabase && !allowRemote) {
    console.error(
      `\nRefusing to seed: ${target} is a hosted Supabase project, not a local database.\n` +
        'Demonstration data does not belong in a shared project by accident.\n' +
        'If you are certain, re-run with --allow-remote.\n',
    )
    process.exit(1)
  }

  if (!isLocalDatabase) {
    console.warn(`\n! Seeding demonstration data into the HOSTED project ${target}\n`)
  }

  const admin = createClient(env.url, env.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`Seeding demonstration data into ${env.url}`)

  // ── Institution ───────────────────────────────────────────────────────────
  const existingInstitution = await admin
    .from('institutions')
    .select('id')
    .eq('slug', DEMO.slug)
    .maybeSingle()

  let institutionId = existingInstitution.data?.id

  if (!institutionId) {
    const { data, error } = await admin
      .from('institutions')
      .insert({
        slug: DEMO.slug,
        name: DEMO.name,
        institution_type: 'AEROSPACE_INSTITUTION',
        category: 'PRIVATE',
        official_email: `office@${DEMO.domain}`,
        official_phone: '+911100000000',
        description:
          'Demonstration institution created by the development seed. Not a real organisation.',
        field_of_work: 'Aerospace engineering education',
        address_line: '1 Example Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        postal_code: '560001',
        status: 'PENDING',
      })
      .select('id')
      .single()

    if (error) throw new Error(`Could not create the demo institution: ${error.message}`)
    institutionId = data.id
    console.log('  · institution created')
  } else {
    console.log('  · institution already present')
  }

  // Activating requires an approver. If HQ has not been bootstrapped yet, the
  // institution stays PENDING — which is the honest state, and the approval
  // workflow in Phase 9 is what moves it.
  const hq = await admin.from('profiles').select('id').eq('role', 'HQ_ADMIN').limit(1).maybeSingle()

  if (hq.data?.id) {
    const { error } = await admin
      .from('institutions')
      .update({ status: 'ACTIVE', approved_at: new Date().toISOString(), approved_by: hq.data.id })
      .eq('id', institutionId)
      .eq('status', 'PENDING')
    if (error) throw new Error(`Could not activate the demo institution: ${error.message}`)
    console.log('  · institution ACTIVE (approved by the bootstrapped HQ account)')
  } else {
    console.warn(
      '  ! No HQ_ADMIN exists, so the demo institution stays PENDING and its users cannot sign in.\n' +
        '    Run supabase/seed/bootstrap_hq_admin.sql first — see the header of that file.',
    )
  }

  // ── Academic structure ────────────────────────────────────────────────────
  const upsert = async <T extends Record<string, unknown>>(
    table: string,
    match: Record<string, unknown>,
    values: T,
  ): Promise<string> => {
    const query = admin.from(table).select('id')
    for (const [column, value] of Object.entries(match)) query.eq(column, value as never)
    const found = await query.maybeSingle()
    if (found.data?.id) return found.data.id

    const { data, error } = await admin
      .from(table)
      .insert(values as never)
      .select('id')
      .single()
    if (error) throw new Error(`Could not create ${table}: ${error.message}`)
    return data.id
  }

  const departmentId = await upsert(
    'departments',
    { institution_id: institutionId, code: 'AERO' },
    { institution_id: institutionId, code: 'AERO', name: 'Aerospace Engineering' },
  )

  const academicYearId = await upsert(
    'academic_years',
    { institution_id: institutionId, name: '2026-27' },
    {
      institution_id: institutionId,
      name: '2026-27',
      starts_on: '2026-06-01',
      ends_on: '2027-05-31',
      is_current: true,
      status: 'ACTIVE',
    },
  )

  const programId = await upsert(
    'programs',
    { institution_id: institutionId, code: 'BTECH-AE' },
    {
      institution_id: institutionId,
      department_id: departmentId,
      code: 'BTECH-AE',
      name: 'B.Tech Aerospace Engineering',
      level: 'Undergraduate',
      duration_months: 48,
    },
  )

  const classId = await upsert(
    'classes',
    { institution_id: institutionId, academic_year_id: academicYearId, name: 'Semester 1' },
    {
      institution_id: institutionId,
      academic_year_id: academicYearId,
      program_id: programId,
      department_id: departmentId,
      name: 'Semester 1',
      code: 'AE-S1',
      level_order: 1,
      capacity: 60,
    },
  )

  const sectionId = await upsert(
    'sections',
    { class_id: classId, name: 'A' },
    { institution_id: institutionId, class_id: classId, name: 'A', capacity: 30 },
  )

  for (const [code, name] of [
    ['AE101', 'Introduction to Aerodynamics'],
    ['AE102', 'Aircraft Structures'],
    ['AE103', 'Propulsion Systems'],
  ] as const) {
    const subjectId = await upsert(
      'subjects',
      { institution_id: institutionId, code },
      {
        institution_id: institutionId,
        department_id: departmentId,
        code,
        name,
        credits: 4,
      },
    )
    await upsert(
      'courses',
      { institution_id: institutionId, academic_year_id: academicYearId, code: `${code}-C` },
      {
        institution_id: institutionId,
        subject_id: subjectId,
        academic_year_id: academicYearId,
        class_id: classId,
        program_id: programId,
        code: `${code}-C`,
        title: name,
        credits: 4,
      },
    )
  }
  console.log('  · academic structure ready')

  // ── People ────────────────────────────────────────────────────────────────
  const adminEmail = `principal@${DEMO.domain}`
  const adminId = await provision(admin, {
    email: adminEmail,
    fullName: 'Demo Principal',
    role: 'INSTITUTION_ADMIN',
    institutionId,
  })
  await admin
    .from('institution_admins')
    .upsert(
      { profile_id: adminId, institution_id: institutionId, designation: 'Principal', is_primary: true },
      { onConflict: 'profile_id' },
    )

  for (const teacher of TEACHERS) {
    const profileId = await provision(admin, {
      email: emailFor(teacher.name, 'teacher'),
      fullName: teacher.name,
      role: 'TEACHER',
      institutionId,
    })
    await admin.from('teachers').upsert(
      {
        profile_id: profileId,
        institution_id: institutionId,
        employee_id: teacher.employee,
        department_id: departmentId,
        qualification: 'M.Tech',
        specialization: teacher.subject,
        experience_years: 5,
      },
      { onConflict: 'profile_id' },
    )
    await admin.from('teacher_class_assignments').upsert(
      {
        institution_id: institutionId,
        teacher_id: profileId,
        class_id: classId,
        section_id: sectionId,
        academic_year_id: academicYearId,
        is_class_teacher: teacher.employee === TEACHERS[0].employee,
      },
      { onConflict: 'teacher_id,class_id,section_id,academic_year_id', ignoreDuplicates: true },
    )
  }
  console.log(`  · ${TEACHERS.length} teachers provisioned (INVITED)`)

  for (const [index, name] of STUDENTS.entries()) {
    const profileId = await provision(admin, {
      email: emailFor(name, 'student'),
      fullName: name,
      role: 'STUDENT',
      institutionId,
    })
    const code = `DEMO-S-${String(index + 1).padStart(3, '0')}`
    await admin.from('students').upsert(
      {
        profile_id: profileId,
        institution_id: institutionId,
        student_code: code,
        admission_number: code,
        department_id: departmentId,
        program_id: programId,
        academic_year_id: academicYearId,
        class_id: classId,
        section_id: sectionId,
        admission_date: '2026-06-01',
      },
      { onConflict: 'profile_id' },
    )
    await admin.from('student_enrollments').upsert(
      {
        institution_id: institutionId,
        student_id: profileId,
        class_id: classId,
        section_id: sectionId,
        academic_year_id: academicYearId,
      },
      { onConflict: 'student_id,class_id,academic_year_id', ignoreDuplicates: true },
    )
  }
  console.log(`  · ${STUDENTS.length} students provisioned (INVITED)`)

  console.log(
    '\nDone. All demo accounts are INVITED with no password, exactly as real provisioning leaves them.\n' +
      'Send an invitation from the Supabase dashboard, or activate them once the provisioning\n' +
      'workflow ships in Phase 10.\n',
  )
}

await main()
