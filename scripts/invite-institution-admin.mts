/**
 * Issues an institution's administrator invitation from the command line.
 *
 *     npm run invite:admin -- --institution chandigarh-university
 *     npm run invite:admin -- --missing            (every ACTIVE tenant with no administrator)
 *     npm run invite:admin -- --missing --dry-run
 *
 * The same path exists in the HQ Command Centre, on an institution's
 * Administrators tab. This is for the cases the UI cannot serve: an institution
 * approved before the handoff existed, or a bulk repair after an SMTP outage.
 *
 * It calls the application's own `inviteAdminForInstitution()` rather than
 * reimplementing it, so there is exactly one definition of what provisioning an
 * administrator means. `server-only` resolves under the `react-server`
 * condition, which is why the npm script sets it.
 *
 * The recipient is never taken from an argument. It is read from the
 * institution's originating application, so this cannot point a tenant's
 * administrator account at an address of the operator's choosing.
 */

import './load-env.mts'

import { createClient } from '@supabase/supabase-js'

import { inviteAdminForInstitution } from '../services/hq/institution-admin'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !serviceKey) {
  console.error('\nNeeds Supabase configuration. Run `npm run check:env`.\n')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

const wanted = argument('institution')
const missingOnly = process.argv.includes('--missing')
const dryRun = process.argv.includes('--dry-run')

if (!wanted && !missingOnly) {
  console.error('\nUsage: npm run invite:admin -- --institution <slug|id>')
  console.error('       npm run invite:admin -- --missing [--dry-run]\n')
  process.exit(1)
}

async function targets() {
  const { data: institutions, error } = await admin
    .from('institutions')
    .select('id, slug, name, status')
    .is('deleted_at', null)

  if (error) throw error

  if (wanted) {
    const match = (institutions ?? []).find(
      (institution) => institution.slug === wanted || institution.id === wanted,
    )
    if (!match) {
      console.error(`\nNo institution matching "${wanted}".\n`)
      process.exit(1)
    }
    return [match]
  }

  // Only ACTIVE tenants. A PENDING one has not been approved, and inviting an
  // administrator to an institution that was never admitted would be wrong.
  const active = (institutions ?? []).filter((institution) => institution.status === 'ACTIVE')

  const { data: admins } = await admin.from('institution_admins').select('institution_id')
  const covered = new Set((admins ?? []).map((row) => row.institution_id))

  return active.filter((institution) => !covered.has(institution.id))
}

async function main() {
  const list = await targets()

  if (list.length === 0) {
    console.log('\nNothing to do — every ACTIVE institution already has an administrator.\n')
    return
  }

  console.log(`\n${list.length} institution(s) to invite:\n`)
  for (const institution of list) {
    console.log(`  · ${institution.name} (${institution.slug}) — ${institution.status}`)
  }

  if (dryRun) {
    console.log('\n--dry-run: nothing was created and no email was sent.\n')
    return
  }

  console.log('')
  let failures = 0

  for (const institution of list) {
    try {
      const invitation = await inviteAdminForInstitution(institution.id)
      // The address is shown so the operator can confirm it reached the right
      // person. The link itself is never printed — it is a bearer credential
      // for the account until it is used.
      console.log(
        invitation.emailed
          ? `OK    ${institution.slug} — invitation sent to ${invitation.email}`
          : `WARN  ${institution.slug} — account ready for ${invitation.email}, but delivery failed`,
      )
      if (!invitation.emailed) failures += 1
    } catch (error) {
      failures += 1
      console.log(
        `FAIL  ${institution.slug} — ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  console.log('')
  process.exit(failures ? 1 : 0)
}

await main()
