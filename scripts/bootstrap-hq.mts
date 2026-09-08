/**
 * Creates an AEROFEDERATION HEAD QUARTERS administrator.
 *
 *     HQ_EMAIL=someone@example.com HQ_PASSWORD='…' npm run bootstrap:hq
 *
 * This is the only path to `HQ_ADMIN`, and it is deliberately a script an
 * operator runs rather than anything reachable from the application:
 *
 *   * `private.handle_new_auth_user()` refuses `afi_role = 'HQ_ADMIN'`, so the
 *     Auth API cannot mint one.
 *   * `public.provision_profile()` refuses the role too, so the provisioning
 *     path used for every other account cannot either.
 *   * `private.prevent_privilege_escalation()` refuses any change to
 *     `profiles.role` arriving as `authenticated`, so no signed-in user can
 *     promote themselves or anyone else.
 *
 * That leaves a direct database connection as the only way in, which is what
 * this script uses — the programmatic equivalent of
 * `supabase/seed/bootstrap_hq_admin.sql`, doing the auth-user creation as well
 * so it works end to end in one step.
 *
 * Credentials are read from the environment and never written to disk. Nothing
 * here prints the password.
 */

import './load-env.mts'

import { Client } from 'pg'

import { createClient } from '@supabase/supabase-js'

const email = process.env.HQ_EMAIL?.trim().toLowerCase()
const password = process.env.HQ_PASSWORD
const fullName = process.env.HQ_NAME?.trim() || 'AEROFEDERATION HEAD QUARTERS Administrator'

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

if (!email || !password) {
  fail(
    'Set HQ_EMAIL and HQ_PASSWORD.\n\n' +
      "  HQ_EMAIL=you@example.com HQ_PASSWORD='…' npm run bootstrap:hq",
  )
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim()

if (!supabaseUrl || !serviceKey || !dbPassword) {
  fail('Missing Supabase configuration. Run `npm run check:env` to see what is absent.')
}

/**
 * The platform's own password policy, mirrored from
 * `lib/validation/common.ts`. A weaker password is allowed through here — the
 * Auth admin API does not apply the app's rules — but the operator is told,
 * because the account being created is the most privileged one on the platform
 * and because the app's own reset flow would later refuse this same value.
 */
function policyProblems(candidate: string): string[] {
  const problems: string[] = []
  if (candidate.length < 12) problems.push(`length ${candidate.length}, policy requires 12`)
  if (!/[a-z]/.test(candidate)) problems.push('no lowercase letter')
  if (!/[A-Z]/.test(candidate)) problems.push('no uppercase letter')
  if (!/[0-9]/.test(candidate)) problems.push('no digit')
  return problems
}

const ref = new URL(supabaseUrl).host.split('.')[0]
const admin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log(`\nBootstrapping HQ administrator on ${new URL(supabaseUrl!).host}`)
  console.log(`  email  ${email}`)
  console.log(`  name   ${fullName}`)

  const problems = policyProblems(password!)
  if (problems.length) {
    console.warn(
      `\n  ! The password does not meet the platform policy (${problems.join('; ')}).\n` +
        '    It will be set, but the in-app reset flow will refuse this value later.\n',
    )
  }

  // ── 1 · The auth user ─────────────────────────────────────────────────────
  const existing = (await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users.find(
    (user) => user.email?.toLowerCase() === email,
  )

  let userId: string

  if (existing) {
    console.log('\n  · auth user already exists — updating password and confirming email')
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    })
    if (error) fail(`Could not update the existing auth user: ${error.message}`)
    userId = existing.id
  } else {
    // No app_metadata: the provisioning trigger refuses HQ_ADMIN, and a profile
    // created by that path would be a tenant account. The profile is written
    // explicitly below instead.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error || !data.user) fail(`Could not create the auth user: ${error?.message}`)
    userId = data.user.id
    console.log('  · auth user created')
  }

  // ── 2 · The HQ profile, over a direct connection ──────────────────────────
  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password: dbPassword,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  try {
    const { rows: existingProfile } = await client.query<{ role: string }>(
      'select role from public.profiles where id = $1',
      [userId],
    )

    if (existingProfile.length && existingProfile[0].role !== 'HQ_ADMIN') {
      fail(
        `A profile already exists for ${email} with role ${existingProfile[0].role}. ` +
          'Converting a tenant account to HQ is refused — use a separate address.',
      )
    }

    if (existingProfile.length) {
      console.log('  · already an HQ administrator')
    } else {
      await client.query(
        `insert into public.profiles (id, email, full_name, role, institution_id, status)
         values ($1, $2, $3, 'HQ_ADMIN', null, 'ACTIVE')`,
        [userId, email, fullName],
      )
      console.log('  · HQ_ADMIN profile created')

      await client.query(
        `insert into public.audit_logs (actor_id, actor_role, actor_email, action, entity_type, entity_id, metadata)
         values ($1, 'HQ_ADMIN', $2, 'HQ_ADMIN_BOOTSTRAPPED', 'profile', $1, jsonb_build_object('via', 'bootstrap-hq script'))`,
        [userId, email],
      )
    }

    // Mirrored into app_metadata so middleware can route without a database
    // read. A routing hint only — every authorisation decision is re-derived
    // from the profiles row.
    await client.query(
      `update auth.users
          set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                                  || jsonb_build_object('afi_role', 'HQ_ADMIN')
        where id = $1`,
      [userId],
    )

    const { rows } = await client.query<{
      email: string
      full_name: string
      status: string
      institution_id: string | null
    }>(
      `select email, full_name, status, institution_id
         from public.profiles where role = 'HQ_ADMIN' order by created_at`,
    )

    console.log('\nHQ administrators on this project:')
    for (const row of rows) {
      console.log(
        `  ${row.email.padEnd(34)} ${row.status.padEnd(10)} ` +
          `institution: ${row.institution_id ?? 'none (correct)'}`,
      )
    }
  } finally {
    await client.end()
  }

  console.log(`\nDone. Sign in at ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/hq/login\n`)
}

await main()
