/**
 * Confirms the committed database types describe the schema the migrations
 * produce.
 *
 *     npm run db:types:check
 *
 * `npm run db:types` regenerates `types/database.generated.ts` from the LINKED
 * Supabase project. That is authoritative about what is deployed, but it says
 * nothing about whether what is deployed matches the migration files — if a
 * migration was never pushed, or somebody edited a table in the dashboard, the
 * generated types would faithfully describe the drift.
 *
 * This script closes that gap: it regenerates types from `supabase/migrations`
 * into a temporary file and compares the structural surface against the
 * committed file. A difference means either the migrations were not pushed, or
 * the remote schema has drifted from them.
 */

import './load-env.mts'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { COMMITTED_TYPES, diffSets, readSurface } from './schema-surface'

const tempDir = mkdtempSync(path.join(tmpdir(), 'afi-types-'))
const fromMigrations = path.join(tempDir, 'from-migrations.ts')

console.log('\nRegenerating types from supabase/migrations…')

try {
  execFileSync(
    'npx',
    ['tsx', path.resolve(import.meta.dirname, 'generate-types.mts'), '--out', fromMigrations],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  )

  const expected = readSurface(readFileSync(fromMigrations, 'utf8'))
  const actual = readSurface(readFileSync(COMMITTED_TYPES, 'utf8'))

  console.log(
    `\nMigrations describe ${expected.tables.size} tables and ${expected.enums.size} enums.`,
  )
  console.log(
    `Committed types describe ${actual.tables.size} tables and ${actual.enums.size} enums.\n`,
  )

  const problems: string[] = []

  const tableNames = diffSets(new Set(expected.tables.keys()), new Set(actual.tables.keys()))
  for (const name of tableNames.onlyInA) {
    problems.push(`Table "${name}" is in the migrations but not in the committed types.`)
  }
  for (const name of tableNames.onlyInB) {
    problems.push(`Table "${name}" is in the committed types but not in the migrations.`)
  }

  for (const [name, columns] of expected.tables) {
    const other = actual.tables.get(name)
    if (!other) continue
    const { onlyInA, onlyInB } = diffSets(columns, other)
    for (const column of onlyInA) {
      problems.push(`${name}: "${column}" is in the migrations but not in the committed types.`)
    }
    for (const column of onlyInB) {
      problems.push(`${name}: "${column}" is in the committed types but not in the migrations.`)
    }
  }

  for (const [name, labels] of expected.enums) {
    const other = actual.enums.get(name)
    if (!other) {
      problems.push(`Enum "${name}" is missing from the committed types.`)
      continue
    }
    const { onlyInA, onlyInB } = diffSets(labels, other)
    if (onlyInA.length || onlyInB.length) {
      problems.push(
        `Enum "${name}" differs — migrations only: [${onlyInA.join(', ')}], types only: [${onlyInB.join(', ')}]`,
      )
    }
  }

  if (problems.length) {
    console.error('Types do NOT match the migrations:\n')
    for (const problem of problems.slice(0, 60)) console.error(`  · ${problem}`)
    if (problems.length > 60) console.error(`  … and ${problems.length - 60} more`)
    console.error(
      '\nEither the migrations have not been pushed (`npm run db:push`), or the remote\n' +
        'schema has drifted from them. `npm run db:diff` will show the drift.\n',
    )
    process.exit(1)
  }

  console.log('Types match the migrations — every table, column and enum agrees.\n')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
