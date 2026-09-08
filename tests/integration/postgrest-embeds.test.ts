// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDatabase, type TestDatabase } from '../rls/harness'

/**
 * Guards against ambiguous PostgREST embeds.
 *
 * This exists because of a bug that reached the hosted project: every
 * `profiles` query embedded `institutions ( … )`, and PostgREST refused all of
 * them with `PGRST201 — more than one relationship was found`. There are three
 * foreign keys between those two tables (`profiles.institution_id`,
 * `institutions.approved_by`, `institutions.suspended_by`), so the embed is
 * genuinely ambiguous and has to name a constraint.
 *
 * Nothing caught it. It typechecks, it lints, it builds, and the RLS suite
 * issues raw SQL rather than PostgREST requests — so the failure only appeared
 * the first time a real person tried to sign in, at which point the query
 * returned null and the application concluded the account had no profile.
 *
 * This test reads the foreign-key graph out of the real schema and every
 * `.from(…).select(…)` in the source, and fails when an embed spans a table
 * pair with more than one relationship without a `!constraint` hint.
 */

const ROOTS = ['app', 'lib', 'services'] as const

let t: TestDatabase
/** table pair key → number of foreign keys between them, either direction. */
let relationshipCounts: Map<string, number>
/** Every foreign-key constraint name in the public schema. */
let constraintNames: Set<string>

beforeAll(async () => {
  t = await createTestDatabase()

  const rows = await t.sql<{ child: string; parent: string; conname: string }>(`
    select cl.relname as child, ref.relname as parent, con.conname
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_class ref on ref.oid = con.confrelid
      join pg_namespace n on n.oid = cl.relnamespace
     where con.contype = 'f' and n.nspname = 'public'
  `)

  relationshipCounts = new Map()
  constraintNames = new Set()
  for (const row of rows) {
    const key = [row.child, row.parent].sort().join('::')
    relationshipCounts.set(key, (relationshipCounts.get(key) ?? 0) + 1)
    constraintNames.add(row.conname)
  }
}, 120_000)

afterAll(async () => {
  await t?.close()
})

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      files.push(...(await sourceFiles(full)))
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full)
    }
  }
  return files
}

type Embed = { file: string; table: string; embedded: string; hinted: boolean; hint?: string }

/**
 * Finds `.from('table')` … `.select('…')` pairs and pulls the embedded
 * relations out of the select string.
 *
 * Deliberately a scanner rather than a parser: it only has to be right about
 * the shape this codebase actually writes, and a false positive is a caught
 * bug rather than a broken build.
 */
function findEmbeds(file: string, source: string): Embed[] {
  const embeds: Embed[] = []

  for (const match of source.matchAll(/\.from\(\s*['"`](\w+)['"`]\s*\)/g)) {
    const table = match[1]
    // The select for this query, if any, is the next one in the chain.
    const rest = source.slice(match.index, match.index + 1200)
    const selectMatch = /\.select\(\s*([`'"])([\s\S]*?)\1/.exec(rest)
    if (!selectMatch) continue

    const selectBody = selectMatch[2]

    // `institutions ( name )` or `institutions!fk_name ( name )`
    for (const embedMatch of selectBody.matchAll(/(\w+)(!\w+)?\s*\(/g)) {
      const embedded = embedMatch[1]
      // `count`/`sum` style aggregates are not relations.
      if (['count', 'sum', 'avg', 'min', 'max'].includes(embedded)) continue
      if (embedded === table) continue
      const hint = embedMatch[2]?.slice(1)
      embeds.push({ file, table, embedded, hinted: Boolean(hint), hint })
    }
  }

  return embeds
}

describe('PostgREST embeds are unambiguous', () => {
  /**
   * A hint that names a constraint which does not exist is worse than no hint:
   * PostgREST answers PGRST200 and the query returns nothing, which reads at a
   * glance like "no rows" rather than "broken query".
   *
   * This check exists because three such hints were written in one sitting —
   * `assignment_submissions_student_id_fkey` and friends, invented by analogy
   * with the single-column names Postgres generates, where the real constraints
   * were composite and hand-named. The ambiguity check above passed them all,
   * because it only ever asked whether a hint was present.
   */
  it('names constraints that actually exist', async () => {
    const files = (await Promise.all(ROOTS.map((root) => sourceFiles(root)))).flat()
    const bad: string[] = []

    for (const file of files) {
      for (const embed of findEmbeds(file, await readFile(file, 'utf8'))) {
        if (embed.hint && !constraintNames.has(embed.hint)) {
          bad.push(`${file}: ${embed.table} -> ${embed.embedded}!${embed.hint}`)
        }
      }
    }

    expect(bad, `embed hints naming no such constraint: ${bad.join(' | ')}`).toEqual([])
  })

  it('finds embeds to check (the scanner itself is not silently broken)', async () => {
    const files = (await Promise.all(ROOTS.map((root) => sourceFiles(root)))).flat()
    const all: Embed[] = []
    for (const file of files) {
      all.push(...findEmbeds(file, await readFile(file, 'utf8')))
    }
    // A scanner that finds nothing would make the next test pass vacuously.
    expect(all.length).toBeGreaterThan(0)
  })

  it('names a constraint wherever more than one relationship exists', async () => {
    const files = (await Promise.all(ROOTS.map((root) => sourceFiles(root)))).flat()

    const problems: string[] = []

    for (const file of files) {
      const source = await readFile(file, 'utf8')
      for (const embed of findEmbeds(file, source)) {
        // Only tables we actually know about; anything else is a false match.
        const key = [embed.table, embed.embedded].sort().join('::')
        const count = relationshipCounts.get(key)
        if (count === undefined) continue

        if (count > 1 && !embed.hinted) {
          problems.push(
            `${embed.file}: ${embed.table}.select() embeds "${embed.embedded}" but there are ` +
              `${count} foreign keys between them — PostgREST will refuse this with PGRST201. ` +
              `Name the constraint, e.g. ${embed.embedded}!${embed.table}_${embed.embedded.replace(/s$/, '')}_id_fkey ( … ).`,
          )
        }
      }
    }

    expect(problems, problems.join('\n')).toEqual([])
  })

  it('confirms profiles↔institutions is the ambiguous pair this guards', () => {
    // Pins the assumption. If the schema ever collapses to one relationship,
    // this fails and the hint can be simplified rather than cargo-culted.
    const key = ['profiles', 'institutions'].sort().join('::')
    expect(relationshipCounts.get(key)).toBeGreaterThan(1)
  })
})
