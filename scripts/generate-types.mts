/**
 * Generates `types/database.generated.ts` by introspecting a real PostgreSQL
 * catalog — never by transcribing the schema by hand.
 *
 * Two sources, identical queries, identical output:
 *
 *     npm run db:types         --remote   the hosted Supabase database
 *     npm run db:types:local              supabase/migrations, in-process
 *
 * That symmetry is the point. `db:types:check` generates from both and diffs
 * them, so a migration that was never pushed, or a table edited by hand in the
 * dashboard, shows up as a failure instead of as types that quietly describe
 * the wrong thing.
 *
 * `supabase gen types` is deliberately not used. Its `--db-url` mode needs
 * Docker and its `--linked` mode needs a personal access token; this project
 * has neither, and introspecting the catalog directly needs only the database
 * password we already hold.
 */
import './load-env.mts'

import { writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Client } from 'pg'

import { createTestDatabase } from '../tests/rls/harness'

const outFlag = process.argv.indexOf('--out')
const OUT =
  outFlag !== -1 && process.argv[outFlag + 1]
    ? path.resolve(process.argv[outFlag + 1])
    : path.resolve(import.meta.dirname, '../types/database.generated.ts')

type ColumnRow = {
  table_name: string
  column_name: string
  is_nullable: 'YES' | 'NO'
  has_default: boolean
  is_identity: 'YES' | 'NO'
  data_type: string
  udt_name: string
  element_udt: string | null
}

type EnumRow = { enum_name: string; labels: string[] }

type RelationshipRow = {
  table_name: string
  constraint_name: string
  columns: string[]
  referenced_table: string
  referenced_columns: string[]
  is_one_to_one: boolean
}

const SCALARS: Record<string, string> = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  bpchar: 'string',
  citext: 'string',
  name: 'string',
  bool: 'boolean',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  date: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  time: 'string',
  timetz: 'string',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'string',
}

function tsType(col: ColumnRow, enums: Set<string>): string {
  if (col.data_type === 'ARRAY') {
    const element = col.element_udt ?? 'text'
    const inner = enums.has(element)
      ? pascal(element)
      : (SCALARS[element] ?? 'string')
    return `${inner}[]`
  }
  if (enums.has(col.udt_name)) return pascal(col.udt_name)
  // Domains (email_address) report their own udt_name; resolve to the base type.
  return SCALARS[col.udt_name] ?? 'string'
}

function pascal(input: string): string {
  return input
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('')
}

const header = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Regenerate with:
 *   npm run db:types        (Supabase CLI, against the linked project — canonical)
 *   npm run db:types:local  (from supabase/migrations, no credentials needed)
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]
`

/** Uniform query interface over either source. */
type Source = {
  label: string
  sql: <T>(query: string) => Promise<T[]>
  close: () => Promise<void>
}

async function openSource(): Promise<Source> {
  if (!process.argv.includes('--remote')) {
    const t = await createTestDatabase()
    return {
      label: 'supabase/migrations',
      sql: <T,>(query: string) => t.sql<T>(query) as Promise<T[]>,
      close: () => t.close(),
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const password = process.env.SUPABASE_DB_PASSWORD?.trim()
  if (!url || !password) {
    throw new Error(
      '--remote needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD. Run `npm run check:env`.',
    )
  }

  const ref = new URL(url).host.split('.')[0]
  const client = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  return {
    label: `db.${ref}.supabase.co`,
    sql: async <T,>(query: string) => (await client.query(query)).rows as T[],
    close: () => client.end(),
  }
}

async function main() {
  const t = await openSource()
  console.log(`Introspecting ${t.label}…`)

  const enumRows = (await t.sql(`
    select ty.typname as enum_name,
           array_agg(e.enumlabel::text order by e.enumsortorder) as labels
      from pg_type ty
      join pg_enum e on e.enumtypid = ty.oid
      join pg_namespace n on n.oid = ty.typnamespace
     where n.nspname = 'public'
     group by ty.typname
     order by ty.typname
  `)) as unknown as EnumRow[]

  const columnRows = (await t.sql(`
    select c.table_name,
           c.column_name,
           c.is_nullable,
           (c.column_default is not null) as has_default,
           c.is_identity,
           c.data_type,
           coalesce(dom.base_udt, c.udt_name) as udt_name,
           e.udt_name as element_udt
      from information_schema.columns c
      join information_schema.tables tb
        on tb.table_schema = c.table_schema
       and tb.table_name = c.table_name
       and tb.table_type = 'BASE TABLE'
      left join information_schema.element_types e
        on e.object_schema = c.table_schema
       and e.object_name = c.table_name
       and e.object_type = 'TABLE'
       and e.collection_type_identifier = c.dtd_identifier
      left join lateral (
        select bt.typname as base_udt
          from pg_type dt
          join pg_namespace dn on dn.oid = dt.typnamespace
          join pg_type bt on bt.oid = dt.typbasetype
         where dn.nspname = c.domain_schema and dt.typname = c.domain_name
      ) dom on true
     where c.table_schema = 'public'
     order by c.table_name, c.ordinal_position
  `)) as unknown as ColumnRow[]

  /*
   * Foreign keys, so embedded selects — `profiles.select('*, institutions(*)')`
   * — resolve. Without these the client cannot type an embed at all and every
   * join has to be cast by hand, which throws away the point of generating
   * types in the first place.
   *
   * `is_one_to_one` is true when the referencing columns are themselves covered
   * by a unique or primary key constraint, which is what tells the client to
   * type the embed as an object rather than an array.
   */
  const relationshipRows = (await t.sql(`
    select
      cl.relname as table_name,
      con.conname as constraint_name,
      (select array_agg(att.attname::text order by ord.n)
         from unnest(con.conkey) with ordinality as ord(attnum, n)
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = ord.attnum
      ) as columns,
      ref.relname as referenced_table,
      (select array_agg(att.attname::text order by ord.n)
         from unnest(con.confkey) with ordinality as ord(attnum, n)
         join pg_attribute att on att.attrelid = con.confrelid and att.attnum = ord.attnum
      ) as referenced_columns,
      exists (
        select 1 from pg_constraint uq
         where uq.conrelid = con.conrelid
           and uq.contype in ('p', 'u')
           and uq.conkey @> con.conkey
           and con.conkey @> uq.conkey
      ) as is_one_to_one
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_class ref on ref.oid = con.confrelid
    join pg_namespace n on n.oid = cl.relnamespace
    join pg_namespace rn on rn.oid = ref.relnamespace
    where con.contype = 'f' and n.nspname = 'public' and rn.nspname = 'public'
    order by cl.relname, con.conname
  `)) as unknown as RelationshipRow[]

  const relationshipsByTable = new Map<string, RelationshipRow[]>()
  for (const rel of relationshipRows) {
    const list = relationshipsByTable.get(rel.table_name) ?? []
    list.push(rel)
    relationshipsByTable.set(rel.table_name, list)
  }

  const enumNames = new Set(enumRows.map((e) => e.enum_name))

  const parts: string[] = [header]

  parts.push('// ── Enums ──────────────────────────────────────────────────────────────────\n')
  for (const e of enumRows) {
    parts.push(
      `export type ${pascal(e.enum_name)} =\n${e.labels.map((l) => `  | '${l}'`).join('\n')}\n`,
    )
  }

  const byTable = new Map<string, ColumnRow[]>()
  for (const col of columnRows) {
    const list = byTable.get(col.table_name) ?? []
    list.push(col)
    byTable.set(col.table_name, list)
  }

  parts.push('\n// ── Tables ─────────────────────────────────────────────────────────────────\n')
  const tableEntries: string[] = []

  for (const [table, cols] of [...byTable].sort(([a], [b]) => a.localeCompare(b))) {
    const name = pascal(table)

    const row = cols
      .map((c) => {
        const type = tsType(c, enumNames)
        return `  ${c.column_name}: ${type}${c.is_nullable === 'YES' ? ' | null' : ''}`
      })
      .join('\n')

    const insert = cols
      .map((c) => {
        const type = tsType(c, enumNames)
        // Optional on insert when the database can supply a value itself.
        const optional = c.has_default || c.is_identity === 'YES' || c.is_nullable === 'YES'
        return `  ${c.column_name}${optional ? '?' : ''}: ${type}${c.is_nullable === 'YES' ? ' | null' : ''}`
      })
      .join('\n')

    const update = cols
      .map((c) => {
        const type = tsType(c, enumNames)
        return `  ${c.column_name}?: ${type}${c.is_nullable === 'YES' ? ' | null' : ''}`
      })
      .join('\n')

    parts.push(
      `export type ${name}Row = {\n${row}\n}\n\n` +
        `export type ${name}Insert = {\n${insert}\n}\n\n` +
        `export type ${name}Update = {\n${update}\n}\n`,
    )

    const relationships = relationshipsByTable.get(table) ?? []
    const relationshipEntries = relationships
      .map(
        (rel) =>
          `        {\n` +
          `          foreignKeyName: '${rel.constraint_name}'\n` +
          `          columns: [${rel.columns.map((c) => `'${c}'`).join(', ')}]\n` +
          `          isOneToOne: ${rel.is_one_to_one}\n` +
          `          referencedRelation: '${rel.referenced_table}'\n` +
          `          referencedColumns: [${rel.referenced_columns.map((c) => `'${c}'`).join(', ')}]\n` +
          `        }`,
      )
      // Tuple members need separators; joining on a bare newline produces a
      // file that only looks right.
      .join(',\n')

    tableEntries.push(
      `    ${table}: {\n` +
        `      Row: ${name}Row\n` +
        `      Insert: ${name}Insert\n` +
        `      Update: ${name}Update\n` +
        `      Relationships: [\n${relationshipEntries}\n      ]\n` +
        `    }`,
    )
  }

  const enumEntries = enumRows
    .map((e) => `    ${e.enum_name}: ${pascal(e.enum_name)}`)
    .join('\n')

  parts.push(`
// ── Supabase client schema ─────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
${tableEntries.join('\n')}
    }
    Views: Record<string, never>
    /*
     * Hand-maintained, unlike Tables above.
     *
     * The generator introspects catalogs for tables and enums but not for
     * functions: PostgREST's argument and return shapes for a plpgsql function
     * returning jsonb cannot be recovered from pg_proc in a form TypeScript can
     * use. Adding a database function therefore means adding it here too, or
     * every rpc() call for it is a type error.
     */
    Functions: {
      transition_application: {
        Args: { target_id: string; new_status: ApplicationStatus; comments?: string | null }
        Returns: InstitutionApplicationsRow
      }
      activate_own_account: {
        Args: Record<string, never>
        Returns: UserStatus
      }
      public_start_application: {
        Args: {
          token_hash: string
          institution_name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          official_email: string
          applicant_email: string
        }
        Returns: string
      }
      public_save_application: {
        Args: { application_id: string; token_hash: string; patch: Json }
        Returns: boolean
      }
      public_get_application: {
        Args: { application_id: string; token_hash: string }
        Returns: Json
      }
      public_submit_application: {
        Args: { application_id: string; token_hash: string }
        Returns: Json
      }
      public_attach_document: {
        Args: {
          application_id: string
          token_hash: string
          document_type: DocumentType
          file_name: string
          storage_path: string
          mime_type: string
          file_size: number
        }
        Returns: string
      }
      public_list_documents: {
        Args: { application_id: string; token_hash: string }
        Returns: {
          id: string
          document_type: DocumentType
          file_name: string
          file_size: number
          verification_status: VerificationStatus
          rejection_reason: string | null
          created_at: string
        }[]
      }
      public_remove_document: {
        Args: { application_id: string; token_hash: string; document_id: string }
        Returns: string
      }
      public_request_application_access: {
        Args: {
          application_ref: string
          applicant_email: string
          code_hash: string
          ttl_minutes?: number
        }
        Returns: string
      }
      public_verify_application_access: {
        Args: { application_ref: string; code_hash: string }
        Returns: Json
      }
      public_platform_stats: {
        Args: Record<string, never>
        Returns: {
          institutions: number
          educators: number
          learners: number
          programs: number
          states: number
        }[]
      }
      public_institution_directory: {
        Args: { max_rows?: number }
        Returns: {
          slug: string
          name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          city: string | null
          state: string | null
          country: string
          field_of_work: string | null
          logo_path: string | null
          approved_at: string | null
        }[]
      }
      public_institution_by_slug: {
        Args: { target_slug: string }
        Returns: {
          slug: string
          name: string
          institution_type: InstitutionType
          category: InstitutionCategory
          description: string | null
          field_of_work: string | null
          website: string | null
          city: string | null
          state: string | null
          country: string
          year_established: number | null
          logo_path: string | null
          approved_at: string | null
        }[]
      }
      public_settings: {
        Args: Record<string, never>
        Returns: { key: string; value: Json }[]
      }
      student_start_attempt: {
        Args: { target_assessment_id: string }
        Returns: string
      }
      student_get_paper: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_answer_question: {
        Args: {
          target_attempt_id: string
          target_question_id: string
          option_ids: string[]
          answer_text: string | null
          payload?: Json
        }
        Returns: Json
      }
      student_submit_attempt: {
        Args: { target_attempt_id: string; expired?: boolean }
        Returns: Json
      }
      student_mark_for_review: {
        Args: { target_attempt_id: string; question_ids: string[] }
        Returns: boolean
      }
      teacher_set_question_media: {
        Args: { target_question_id: string; path: string | null; content_type: string | null }
        Returns: boolean
      }
      assessment_question_media: {
        Args: { target_question_id: string }
        Returns: string | null
      }
      student_pause_attempt: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_resume_attempt: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      student_attach_file: {
        Args: {
          target_attempt_id: string
          target_question_id: string
          path: string
          original_name: string
          size_bytes: number
          content_type: string
        }
        Returns: Json
      }
      assessment_answer_file: {
        Args: { target_answer_id: string }
        Returns: string | null
      }
      teacher_release_results: {
        Args: { target_assessment_id: string }
        Returns: number
      }
      student_get_result: {
        Args: { target_attempt_id: string }
        Returns: Json
      }
      teacher_grade_answer: {
        Args: { target_answer_id: string; awarded: number; comment?: string | null }
        Returns: Json
      }
      provision_profile: {
        Args: {
          user_id: string
          user_email: string
          full_name: string
          role: string
          institution_id: string
        }
        Returns: ProfilesRow
      }
      touch_last_login: {
        Args: Record<string, never>
        Returns: undefined
      }
      write_audit_log: {
        Args: { action: string; entity_type: string; entity_id?: string | null; metadata?: Json }
        Returns: string
      }
      my_message_contacts: {
        Args: Record<string, never>
        Returns: { profile_id: string; full_name: string; subtitle: string }[]
      }
      my_conversations: {
        Args: Record<string, never>
        Returns: {
          id: string
          counterpart_id: string
          counterpart_name: string
          counterpart_role: string
          last_message_at: string | null
          last_message_preview: string | null
          last_sender_id: string | null
          /* bigint, which PostgREST renders as a JSON number. */
          unread_count: number
        }[]
      }
      my_conversation: {
        Args: { target_id: string }
        Returns: {
          id: string
          counterpart_id: string
          counterpart_name: string
          counterpart_role: string
        }[]
      }
    }
    Enums: {
${enumEntries}
    }
    CompositeTypes: Record<string, never>
  }
}

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
`)

  await writeFile(OUT, parts.join('\n'), 'utf8')
  await t.close()

  console.log(
    `Wrote ${path.relative(process.cwd(), OUT)} — ${byTable.size} tables, ${enumRows.length} enums`,
  )
}

await main()
