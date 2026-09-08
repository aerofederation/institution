/**
 * Environment preflight.
 *
 *     npm run check:env
 *
 * Reports which variables are configured and which are missing, WITHOUT ever
 * printing a value. Secrets are reduced to a presence flag and a length; the
 * Supabase URL and project ref are shown because they are public identifiers
 * that appear in the browser bundle anyway.
 *
 * Run this before linking, pushing or verifying, so a misconfiguration is a
 * one-line answer rather than an opaque failure three commands later.
 */

import './load-env.mts'

/**
 * The project ref is the first label of the Supabase host, so it never has to
 * be supplied separately — one less variable to get wrong.
 */
function deriveProjectRef(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!url) return undefined
  try {
    const host = new URL(url).host
    const ref = host.split('.')[0]
    return /^[a-z0-9]{20}$/.test(ref) ? ref : undefined
  } catch {
    return undefined
  }
}

if (!process.env.SUPABASE_PROJECT_REF?.trim()) {
  const derived = deriveProjectRef()
  if (derived) process.env.SUPABASE_PROJECT_REF = derived
}

type Spec = {
  key: string
  group: 'supabase' | 'app' | 'smtp' | 'ai' | 'security'
  required: 'connect' | 'seed' | 'email' | 'ai' | 'later'
  /** Public identifiers may be displayed. Everything else is masked. */
  publicValue?: boolean
}

const SPECS: Spec[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', group: 'supabase', required: 'connect', publicValue: true },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', group: 'supabase', required: 'connect' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', group: 'supabase', required: 'connect' },
  { key: 'SUPABASE_PROJECT_REF', group: 'supabase', required: 'connect', publicValue: true },
  { key: 'SUPABASE_DB_PASSWORD', group: 'supabase', required: 'connect' },

  { key: 'NEXT_PUBLIC_APP_URL', group: 'app', required: 'connect', publicValue: true },
  { key: 'NEXT_PUBLIC_APP_NAME', group: 'app', required: 'connect', publicValue: true },

  { key: 'SMTP_HOST', group: 'smtp', required: 'email', publicValue: true },
  { key: 'SMTP_PORT', group: 'smtp', required: 'email', publicValue: true },
  { key: 'SMTP_SECURE', group: 'smtp', required: 'email', publicValue: true },
  { key: 'SMTP_USER', group: 'smtp', required: 'email' },
  { key: 'SMTP_PASSWORD', group: 'smtp', required: 'email' },
  { key: 'SMTP_FROM', group: 'smtp', required: 'email', publicValue: true },
  { key: 'SMTP_FROM_NAME', group: 'smtp', required: 'email', publicValue: true },

  { key: 'AI_PROVIDER', group: 'ai', required: 'ai', publicValue: true },
  { key: 'AI_API_KEY', group: 'ai', required: 'ai' },

  { key: 'WORKER_SECRET', group: 'security', required: 'later' },
  { key: 'TOKEN_SIGNING_SECRET', group: 'security', required: 'later' },
]

const GROUP_LABEL: Record<Spec['group'], string> = {
  supabase: 'Supabase',
  app: 'Application',
  smtp: 'Email (SMTP)',
  ai: 'AI provider',
  security: 'Security secrets',
}

const NEEDED_FOR: Record<Spec['required'], string> = {
  connect: 'link / push / verify',
  seed: 'seeding',
  email: 'email delivery',
  ai: 'AI features (Phase 16+)',
  later: 'later phases',
}

function describe(spec: Spec): { state: 'set' | 'missing'; detail: string } {
  const raw = process.env[spec.key]
  if (!raw || raw.trim() === '') return { state: 'missing', detail: '—' }

  const value = raw.trim()
  if (spec.publicValue) return { state: 'set', detail: value }
  return { state: 'set', detail: `set (${value.length} chars)` }
}

const results = SPECS.map((spec) => ({ spec, ...describe(spec) }))

let currentGroup: Spec['group'] | null = null
console.log('\nEnvironment preflight — values are never printed for secrets.\n')

for (const result of results) {
  if (result.spec.group !== currentGroup) {
    currentGroup = result.spec.group
    console.log(`  ${GROUP_LABEL[currentGroup]}`)
  }
  const mark = result.state === 'set' ? '✓' : '·'
  console.log(`    ${mark} ${result.spec.key.padEnd(30)} ${result.detail}`)
}

const missingToConnect = results.filter(
  (r) => r.state === 'missing' && r.spec.required === 'connect',
)
const missingForEmail = results.filter((r) => r.state === 'missing' && r.spec.required === 'email')

console.log()

if (missingToConnect.length) {
  console.log(
    `Cannot connect to Supabase yet — missing ${missingToConnect.length} of the variables needed to ${NEEDED_FOR.connect}:`,
  )
  for (const item of missingToConnect) console.log(`    ${item.spec.key}`)
  console.log(
    '\nAdd them to .env.local (preferred) or .env, then re-run. Neither file is committed.\n',
  )
} else {
  console.log('Supabase configuration is complete. Next:\n')
  console.log('    npm run db:link')
  console.log('    npm run db:push')
  console.log('    npm run verify:supabase\n')
}

if (missingForEmail.length) {
  console.log(
    `Email is not configured (${missingForEmail.length} variable(s) missing). ` +
      'Nodemailer verification will report NOT CONFIGURED until they are set.\n',
  )
}

// Non-zero only when the connect-critical set is incomplete, so this can gate a
// script chain without failing on optional groups.
process.exit(missingToConnect.length ? 1 : 0)
