/**
 * End-to-end verification of institution administrator activation.
 *
 *     npm run verify:activation      (needs the dev server on NEXT_PUBLIC_APP_URL)
 *
 * Approving an application provisions an administrator and emails them a
 * single-use link. The part worth verifying is not the SQL — it is whether the
 * link actually works, because it is minted server-side by `generateLink` and
 * redeemed by our own `/auth/confirm` route rather than by Supabase's hosted
 * redirect. Nothing about that is provable by typechecking.
 *
 * So this drives real HTTP against the running application, with a cookie jar,
 * and asserts that redeeming the link lands on /activate with a session — and
 * that a forged, replayed or off-site one does not.
 *
 * Everything it creates is deleted at the end.
 */

import './load-env.mts'

import { randomBytes } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

if (!url || !serviceKey) {
  console.error('\nNeeds Supabase configuration. Run `npm run check:env`.\n')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

/** A minimal cookie jar: the session arrives as Set-Cookie on a redirect hop. */
function makeJar() {
  const jar = new Map<string, string>()
  return {
    absorb(response: Response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const index = pair.indexOf('=')
        if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
      }
    },
    header() {
      return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
    },
    names() {
      return [...jar.keys()]
    },
  }
}

/** Follows redirects by hand so every hop's cookies are captured. */
async function walk(start: string, jar: ReturnType<typeof makeJar>, limit = 5) {
  let current = start
  for (let hop = 0; hop < limit; hop += 1) {
    const response: Response = await fetch(current, {
      redirect: 'manual',
      headers: jar.header() ? { cookie: jar.header() } : {},
    })
    jar.absorb(response)

    const location = response.headers.get('location')
    if (!location) return { url: current, response }
    current = new URL(location, current).toString()
  }
  throw new Error('too many redirects')
}

const suffix = randomBytes(4).toString('hex')
const EMAIL = `zzactivation.${suffix}@example.test`
const FORGED = '0'.repeat(64)

async function main() {
  console.log(`\nVerifying administrator activation against ${appUrl}\n`)

  try {
    await fetch(appUrl, { redirect: 'manual' })
  } catch {
    console.error(`Cannot reach ${appUrl}. Start the dev server first.\n`)
    process.exit(1)
  }

  /*
   * `institutions_approval_coherent` requires approval evidence on any
   * non-PENDING institution, so the fixture carries a real approver rather than
   * a status flipped without provenance.
   */
  const { data: approver } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'HQ_ADMIN')
    .limit(1)
    .maybeSingle()

  check('an HQ approver exists to attribute the fixture to', Boolean(approver))

  const { data: institution, error: institutionError } = await admin
    .from('institutions')
    .insert({
      slug: `zz-activation-${suffix}`,
      name: `ZZ Activation Institute ${suffix}`,
      institution_type: 'TRAINING_INSTITUTE',
      category: 'PRIVATE',
      official_email: `office.${suffix}@example.test`,
      country: 'India',
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: approver?.id ?? null,
    })
    .select('id')
    .single()

  check('a tenant can be provisioned', !institutionError, institutionError?.message)
  if (!institution) {
    console.error('\nCannot continue without an institution.\n')
    process.exit(1)
  }

  const generated = await admin.auth.admin.generateLink({ type: 'invite', email: EMAIL })
  const userId = generated.data?.user?.id
  const tokenHash = generated.data?.properties?.hashed_token

  check('an invite link is minted', Boolean(userId && tokenHash), generated.error?.message)
  if (!userId || !tokenHash) {
    await admin.from('institutions').delete().eq('id', institution.id)
    process.exit(1)
  }

  const { error: provisionError } = await admin.rpc('provision_profile', {
    user_id: userId,
    user_email: EMAIL,
    full_name: 'Activation Probe',
    role: 'INSTITUTION_ADMIN',
    institution_id: institution.id,
  })
  check(
    'provision_profile creates the INSTITUTION_ADMIN profile',
    !provisionError,
    provisionError?.message,
  )

  const { error: extensionError } = await admin.from('institution_admins').upsert(
    {
      profile_id: userId,
      institution_id: institution.id,
      designation: 'Director',
      is_primary: true,
      status: 'INVITED',
    },
    { onConflict: 'profile_id' },
  )
  check(
    'the institution_admins row is accepted by the composite tenant key',
    !extensionError,
    extensionError?.message,
  )

  const { data: profile } = await admin
    .from('profiles')
    .select('status, role, institution_id')
    .eq('id', userId)
    .maybeSingle()

  check('the account starts INVITED, not ACTIVE', profile?.status === 'INVITED', profile?.status)
  check('it is bound to the right tenant', profile?.institution_id === institution.id)

  // ── A forged token must not work ──────────────────────────────────────────
  const badJar = makeJar()
  const tampered = await walk(
    `${appUrl}/auth/confirm?token_hash=${FORGED}&type=invite&next=/activate`,
    badJar,
  )
  check(
    'a forged token is refused and never issues a session',
    new URL(tampered.url).pathname === '/login' &&
      !badJar.names().some((name) => name.startsWith('sb-')),
    new URL(tampered.url).pathname + new URL(tampered.url).search,
  )

  // ── The open-redirect guard ───────────────────────────────────────────────
  const evilJar = makeJar()
  const evil = await walk(
    `${appUrl}/auth/confirm?token_hash=${tokenHash}&type=invite&next=https://example.com/evil`,
    evilJar,
  )
  /*
   * The property is that the off-site target was not honoured, not which local
   * hostname the redirect settled on. Comparing hosts verbatim made this fail
   * when the script was pointed at 127.0.0.1 and the redirect canonicalised to
   * localhost — same machine, same origin policy, different spelling.
   */
  const evilHost = new URL(evil.url).hostname
  check(
    'an off-site next target is not honoured',
    evilHost !== 'example.com' && ['localhost', '127.0.0.1', '::1'].includes(evilHost),
    `${evilHost}${new URL(evil.url).pathname}`,
  )

  /*
   * That request consumed a valid token, because redemption is single-use. That
   * is itself worth confirming, so the consumed token is asserted dead and a
   * fresh one is minted for the success case.
   */
  const replayJar = makeJar()
  const replayed = await walk(
    `${appUrl}/auth/confirm?token_hash=${tokenHash}&type=invite&next=/activate`,
    replayJar,
  )
  check(
    'a redeemed token cannot be redeemed twice',
    new URL(replayed.url).pathname === '/login',
    new URL(replayed.url).pathname,
  )

  // ── The real thing ────────────────────────────────────────────────────────
  const reissued = await admin.auth.admin.generateLink({ type: 'recovery', email: EMAIL })
  const freshToken = reissued.data?.properties?.hashed_token
  check('an invitation can be reissued', Boolean(freshToken), reissued.error?.message)

  if (freshToken) {
    const jar = makeJar()
    const landed = await walk(
      `${appUrl}/auth/confirm?token_hash=${freshToken}&type=recovery&next=/activate`,
      jar,
    )

    check(
      'redeeming the link lands on /activate',
      new URL(landed.url).pathname === '/activate',
      new URL(landed.url).pathname,
    )
    check(
      'a session cookie is issued to the server, not the URL fragment',
      jar.names().some((name) => name.startsWith('sb-')),
      jar.names().filter((name) => name.startsWith('sb-')).join(', ') || 'none',
    )

    const body = await landed.response.text()
    check(
      'the activation page recognises the invited administrator',
      body.includes('Activation Probe') || body.includes('Activate account'),
      body.includes('This invitation has expired') ? 'saw the expired screen instead' : '',
    )

    const { data: after } = await admin
      .from('profiles')
      .select('status')
      .eq('id', userId)
      .maybeSingle()
    check(
      'the account is still INVITED until a password is actually set',
      after?.status === 'INVITED',
    )
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await admin.auth.admin.deleteUser(userId)
  await admin.from('institutions').delete().eq('id', institution.id)

  const { data: leftInstitution } = await admin
    .from('institutions')
    .select('id')
    .eq('id', institution.id)
    .maybeSingle()
  const { data: leftProfile } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle()

  check('fixtures removed', leftInstitution === null && leftProfile === null)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
