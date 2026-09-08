import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Reads the structural surface of a generated database types file.
 *
 * Shared by `compare-types.mts`, which diffs the committed types against the
 * migrations, and by `verify-supabase.mts`, which asks PostgREST for every
 * column the types claim exist. Both need the same answer to "what does this
 * file say the schema is", and a second implementation would eventually
 * disagree with the first.
 *
 * Structure is compared rather than bytes, because the Supabase CLI and this
 * project's local generator format their output differently while describing
 * the same schema. Diffing formatting would fail permanently and mean nothing.
 */

export type Surface = {
  /** table name -> set of `column: type` */
  tables: Map<string, Set<string>>
  /** enum name -> set of labels */
  enums: Map<string, Set<string>>
}

export const COMMITTED_TYPES = path.resolve(
  import.meta.dirname,
  '../types/database.generated.ts',
)

function normaliseType(input: string): string {
  return input
    .replace(/,\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .split('|')
    .map((part) => part.trim())
    .sort()
    .join(' | ')
}

function snake(input: string): string {
  return input.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function readColumns(body: string): Set<string> {
  const columns = new Set<string>()
  for (const line of body.split('\n')) {
    const column = /^\s*(\w+)\??:\s*(.+?)$/.exec(line)
    if (column) columns.add(`${column[1]}: ${normaliseType(column[2])}`)
  }
  return columns
}

export function readSurface(source: string): Surface {
  const tables = new Map<string, Set<string>>()
  const enums = new Map<string, Set<string>>()

  // Shape A — Supabase CLI: row columns are inlined under the table.
  //   profiles: { Row: { id: string; ... } }
  for (const match of source.matchAll(/(\w+):\s*\{\s*Row:\s*\{([\s\S]*?)\n\s*\}/g)) {
    const columns = readColumns(match[2])
    if (columns.size) tables.set(match[1], columns)
  }

  // Shape B — this project's local generator: rows are named type aliases and
  // the table entry only references them.
  //   export type ProfilesRow = { id: string; ... }
  //   profiles: { Row: ProfilesRow, ... }
  for (const match of source.matchAll(/export type (\w+)Row = \{\n([\s\S]*?)\n\}/g)) {
    const columns = readColumns(match[2])
    if (columns.size) tables.set(snake(match[1]), columns)
  }

  // CLI style: labels inside an `Enums: { ... }` block.
  const enumBlock = /Enums:\s*\{([\s\S]*?)\n\s{4}\}/.exec(source)
  if (enumBlock) {
    for (const line of enumBlock[1].split('\n')) {
      const entry = /^\s*(\w+):\s*(.+)$/.exec(line)
      if (!entry) continue
      const labels = [...entry[2].matchAll(/["']([A-Z_]+)["']/g)].map((m) => m[1])
      if (labels.length) enums.set(entry[1], new Set(labels))
    }
  }

  // Local generator style: `export type UserStatus =\n  | 'INVITED' ...`
  for (const match of source.matchAll(/export type (\w+) =\n((?:\s*\| '[A-Z_]+'\n?)+)/g)) {
    const labels = [...match[2].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1])
    if (labels.length) enums.set(snake(match[1]), new Set(labels))
  }

  // A reader that finds nothing must fail loudly. Returning an empty surface
  // makes every subsequent comparison trivially equal, which reads as a pass
  // and proves nothing — the exact failure this guard exists to prevent.
  if (tables.size === 0) {
    throw new Error(
      'Could not read any table from the generated types. The generator output format ' +
        'has probably changed; update readSurface() in scripts/schema-surface.ts.',
    )
  }

  return { tables, enums }
}

export function loadCommittedSurface(): Surface {
  return readSurface(readFileSync(COMMITTED_TYPES, 'utf8'))
}

/** Just the column names for a table, without their types. */
export function columnNames(surface: Surface, table: string): string[] {
  return [...(surface.tables.get(table) ?? [])].map((entry) => entry.split(':')[0].trim())
}

export function diffSets(a: Set<string>, b: Set<string>) {
  return {
    onlyInA: [...a].filter((v) => !b.has(v)).sort(),
    onlyInB: [...b].filter((v) => !a.has(v)).sort(),
  }
}
