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

import { spawnSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Wrapper around the Supabase CLI that supplies credentials from the local
 * environment files.
 *
 *     npm run db:link     link this repo to the hosted project
 *     npm run db:push     apply supabase/migrations to it
 *     npm run db:diff     report drift between migrations and the remote schema
 *     npm run db:status   show which migrations the remote has applied
 *
 * The database password is passed to the child process through its environment,
 * never as a command-line argument — arguments are visible in the process list
 * on a shared machine. Nothing here prints a secret.
 */

const command = process.argv[2]
const projectRef = process.env.SUPABASE_PROJECT_REF?.trim()
const dbPassword = process.env.SUPABASE_DB_PASSWORD?.trim()

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

/**
 * Direct Postgres connection string for the linked project.
 *
 * Used only where the CLI offers no way to supply the password through the
 * environment. The password is URL-encoded, and this value is never logged —
 * `run()` prints the argument list, so callers pass it only to commands whose
 * output is checked.
 */
function databaseUrl(): string {
  if (!projectRef) fail('SUPABASE_PROJECT_REF could not be determined.')
  if (!dbPassword) fail('SUPABASE_DB_PASSWORD is not set.')
  return `postgresql://postgres:${encodeURIComponent(dbPassword)}@db.${projectRef}.supabase.co:5432/postgres`
}

function run(args: string[], extraEnv: Record<string, string> = {}) {
  // Never echo a connection string; it carries the database password.
  const printable = args.map((arg) => (arg.startsWith('postgresql://') ? '<db-url>' : arg))
  if (printable.join(' ') !== args.join(' ')) {
    console.log(`\n> supabase ${printable.join(' ')}\n`)
    const result = spawnSync('npx', ['supabase', ...args], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: { ...process.env, ...extraEnv },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
    return
  }
  runVisible(args, extraEnv)
}

function runVisible(args: string[], extraEnv: Record<string, string> = {}) {
  console.log(`\n> supabase ${args.join(' ')}\n`)
  const result = spawnSync('npx', ['supabase', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

switch (command) {
  case 'link': {
    if (!projectRef) {
      fail(
        'SUPABASE_PROJECT_REF is not set.\n' +
          'It is the 20-character reference in your project URL:\n' +
          '  https://<project-ref>.supabase.co\n' +
          'Run `npm run check:env` to see everything that is missing.',
      )
    }
    if (!dbPassword) {
      fail(
        'SUPABASE_DB_PASSWORD is not set.\n' +
          'This is the database password chosen when the project was created\n' +
          '(Project Settings → Database → Database password). Not the service role key.',
      )
    }
    console.log(`Linking to project ${projectRef}`)
    run(['link', '--project-ref', projectRef], { SUPABASE_DB_PASSWORD: dbPassword })
    break
  }

  case 'push': {
    if (!dbPassword) fail('SUPABASE_DB_PASSWORD is not set. Run `npm run check:env`.')

    // `supabase link` needs a personal access token. `--db-url` does not, so
    // when no token is configured the direct connection string is used instead
    // and the whole link step is skipped.
    if (process.env.SUPABASE_ACCESS_TOKEN?.trim()) {
      run(['db', 'push'], { SUPABASE_DB_PASSWORD: dbPassword })
    } else {
      console.log('No SUPABASE_ACCESS_TOKEN — pushing over a direct connection instead.')
      run(['db', 'push', '--db-url', databaseUrl(), '--include-all'])
    }
    break
  }

  /**
   * Marks migrations as already applied without running them.
   *
   *     npm run db:repair -- 20260101000014
   *
   * Needed when a schema was deployed by some route that did not record itself
   * in `supabase_migrations.schema_migrations` — pasting SQL into the dashboard,
   * for instance. Without this, `db push` tries to re-run migrations whose
   * objects already exist and fails on the first `create type`.
   *
   * Every version present in supabase/migrations is marked applied EXCEPT the
   * ones named as arguments, which are the ones still to be pushed.
   */
  case 'repair': {
    const stillPending = new Set(process.argv.slice(3))
    const versions = readdirSync(path.resolve(import.meta.dirname, '../supabase/migrations'))
      .filter((file) => file.endsWith('.sql'))
      .map((file) => file.split('_')[0])
      .filter((version) => !stillPending.has(version))

    if (!versions.length) fail('Nothing to repair.')

    console.log(
      `Marking ${versions.length} migration(s) as applied` +
        (stillPending.size ? `, leaving ${[...stillPending].join(', ')} pending` : ''),
    )
    run(['migration', 'repair', '--status', 'applied', ...versions, '--db-url', databaseUrl()])
    break
  }

  case 'diff': {
    if (!dbPassword) fail('SUPABASE_DB_PASSWORD is not set. Run `npm run check:env`.')
    // Empty output means the remote schema matches the migrations exactly.
    run(['db', 'diff', '--linked', '--schema', 'public'], { SUPABASE_DB_PASSWORD: dbPassword })
    break
  }

  case 'status': {
    if (!dbPassword) fail('SUPABASE_DB_PASSWORD is not set. Run `npm run check:env`.')
    run(['migration', 'list', '--linked'], { SUPABASE_DB_PASSWORD: dbPassword })
    break
  }

  case 'types': {
    if (!projectRef) fail('SUPABASE_PROJECT_REF is not set. Run `npm run check:env`.')

    // `gen types` writes to stdout, so this one is captured rather than
    // inherited, and only written to disk if it actually produced a schema.
    //
    // `--linked` needs a personal access token; `--db-url` does not. Fall back
    // to the direct connection so this works with the database password alone.
    const connection = process.env.SUPABASE_ACCESS_TOKEN?.trim()
      ? ['--linked']
      : ['--db-url', databaseUrl()]
    const args = ['supabase', 'gen', 'types', 'typescript', ...connection, '--schema', 'public']
    console.log(
      `\n> supabase ${args
        .slice(1)
        .map((a) => (a.startsWith('postgresql://') ? '<db-url>' : a))
        .join(' ')}\n`,
    )

    const result = spawnSync('npx', args, {
      encoding: 'utf8',
      shell: process.platform === 'win32',
      env: process.env,
      maxBuffer: 32 * 1024 * 1024,
    })

    if (result.status !== 0) {
      console.error(result.stderr || 'supabase gen types failed')
      process.exit(result.status ?? 1)
    }

    const output = result.stdout ?? ''
    if (!output.includes('Tables:')) {
      fail(
        'supabase gen types returned no schema. Is the project linked and pushed?\n' +
          '  npm run db:link && npm run db:push',
      )
    }

    const target = path.resolve(import.meta.dirname, '../types/database.generated.ts')
    writeFileSync(
      target,
      '/**\n' +
        ' * AUTO-GENERATED from the LINKED Supabase project — do not edit by hand.\n' +
        ' *\n' +
        ' * Regenerate with:\n' +
        ' *   npm run db:types        (this file — authoritative, requires credentials)\n' +
        ' *   npm run db:types:local  (from supabase/migrations, no credentials needed)\n' +
        ' *\n' +
        ' * Confirm the two agree with: npm run db:types:check\n' +
        ' */\n\n' +
        output,
      'utf8',
    )
    console.log(`Wrote ${path.relative(process.cwd(), target)} (${output.length} bytes)`)
    break
  }

  default:
    fail(`Unknown command "${command ?? ''}". Expected: link | push | diff | status | types`)
}
