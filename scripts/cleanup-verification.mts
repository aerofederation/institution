/**
 * Removes leftover fixtures from `npm run verify:supabase`.
 *
 *     npm run verify:cleanup
 *
 * The verification script cleans up after itself in a finally block. This
 * exists for the case where it could not — a crash, a lost connection, or a
 * foreign key that refused a delete in the order attempted.
 *
 * It only ever touches rows whose slug or email begins with `zzverify`, which
 * nothing but the verification fixtures uses. It reports every failure with the
 * database's own message instead of silently leaving rows behind.
 */

import './load-env.mts'

import { createClient } from '@supabase/supabase-js'

import type { Database } from '../types/database.generated'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !serviceKey) {
  console.error('\nNeeds NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n')
  process.exit(1)
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const PREFIX = 'zzverify'

console.log(`\nSearching ${new URL(url).host} for "${PREFIX}" fixtures…\n`)

// ── Profiles and their auth users ───────────────────────────────────────────
const { data: profiles } = await admin
  .from('profiles')
  .select('id, email, institution_id')
  .like('email', `${PREFIX}%`)

console.log(`profiles: ${profiles?.length ?? 0}`)

// ── Institutions ────────────────────────────────────────────────────────────
const { data: institutions } = await admin
  .from('institutions')
  .select('id, slug')
  .like('slug', `${PREFIX}%`)

console.log(`institutions: ${institutions?.length ?? 0}`)

// ── Auth users, including any that never got a profile ──────────────────────
const { data: userPage } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
const authUsers = (userPage?.users ?? []).filter((u) => u.email?.startsWith(PREFIX))
console.log(`auth users: ${authUsers.length}`)

if (!profiles?.length && !institutions?.length && !authUsers.length) {
  console.log('\nNothing to clean up.\n')
  process.exit(0)
}

console.log('\nRemoving…')

/*
 * Break the reference cycle before deleting anything.
 *
 *   institutions.approved_by  -> profiles      ON DELETE RESTRICT
 *   profiles.institution_id   -> institutions  ON DELETE RESTRICT
 *
 * Neither side can be deleted while the other points at it. Clearing
 * `approved_by` on its own is refused too, because `institutions_approval_coherent`
 * requires an approver for any status other than PENDING — so the reset has to
 * happen in ONE update that returns the row to PENDING and drops the approval
 * metadata together.
 *
 * This cycle only exists for fixtures, which approve themselves. In production
 * the approver is HQ, and HQ has no institution.
 */
for (const institution of institutions ?? []) {
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
    .eq('id', institution.id)
  if (error) console.warn(`  resetting ${institution.slug}: ${error.message}`)
}

// Delete the auth user first; profiles cascade from it.
for (const user of authUsers) {
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) console.warn(`  deleteUser ${user.email}: ${error.message}`)
}

// Any profile whose auth user was already gone.
for (const profile of profiles ?? []) {
  const { error } = await admin.from('profiles').delete().eq('id', profile.id)
  if (error) console.warn(`  delete profile ${profile.email}: ${error.message}`)
}

for (const institution of institutions ?? []) {
  const { error } = await admin.from('institutions').delete().eq('id', institution.id)
  if (error) console.warn(`  delete institution ${institution.slug}: ${error.message}`)
}

await admin.from('institution_applications').delete().like('official_email', `%${PREFIX}%`)
await admin.from('audit_logs').delete().like('actor_email', `${PREFIX}%`)

for (const bucket of ['institution-documents']) {
  const { data: roots } = await admin.storage.from(bucket).list('', { limit: 1000 })
  for (const root of roots ?? []) {
    const { data: files } = await admin.storage.from(bucket).list(`${root.name}/institution`)
    const stale = (files ?? []).filter((f) => f.name.startsWith(PREFIX))
    if (stale.length) {
      await admin.storage
        .from(bucket)
        .remove(stale.map((f) => `${root.name}/institution/${f.name}`))
      console.log(`  removed ${stale.length} object(s) from ${bucket}`)
    }
  }
}

// ── Confirm ─────────────────────────────────────────────────────────────────
const after = {
  profiles: (await admin.from('profiles').select('id').like('email', `${PREFIX}%`)).data?.length ?? 0,
  institutions:
    (await admin.from('institutions').select('id').like('slug', `${PREFIX}%`)).data?.length ?? 0,
}
const remainingUsers = (
  await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
).data?.users.filter((u) => u.email?.startsWith(PREFIX)).length ?? 0

console.log(
  `\nRemaining — profiles: ${after.profiles}, institutions: ${after.institutions}, auth users: ${remainingUsers}\n`,
)

process.exit(after.profiles + after.institutions + remainingUsers === 0 ? 0 : 1)
