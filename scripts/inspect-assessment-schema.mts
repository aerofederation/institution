/**
 * What the assessment engine actually looks like in the live database.
 *
 *     npm run inspect:assessment
 *
 * Reads the real catalog rather than the migration files, so it reports what is
 * deployed — including anything a migration failed to apply. Every table is
 * checked for the four things tenant isolation depends on: a primary key,
 * `institution_id`, RLS enabled, and at least one policy.
 *
 * A table with RLS on and no policy is unreachable rather than unsafe; a table
 * with RLS *off* is the dangerous case, and is reported as such.
 */

import './load-env.mts'

import { Client } from 'pg'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const password = process.env.SUPABASE_DB_PASSWORD?.trim()

if (!url || !password) {
  console.error('\nNeeds NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_PASSWORD.\n')
  process.exit(1)
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

const { rows: tables } = await client.query<{
  table_name: string
  has_pk: boolean
  has_tenant: boolean
  has_timestamps: boolean
  rls_enabled: boolean
  policies: number
  indexes: number
  fks: number
}>(`
  select
    c.relname as table_name,
    exists (select 1 from pg_constraint k
             where k.conrelid = c.oid and k.contype = 'p') as has_pk,
    exists (select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'institution_id'
               and a.attnum > 0 and not a.attisdropped) as has_tenant,
    exists (select 1 from pg_attribute a
             where a.attrelid = c.oid and a.attname = 'created_at'
               and a.attnum > 0 and not a.attisdropped) as has_timestamps,
    c.relrowsecurity as rls_enabled,
    (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
    (select count(*) from pg_index i where i.indrelid = c.oid)::int as indexes,
    (select count(*) from pg_constraint k
      where k.conrelid = c.oid and k.contype = 'f')::int as fks
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (
      c.relname like 'assessment%'
      or c.relname like 'question_bank%'
      or c.relname in ('materials', 'assignments', 'assignment_submissions')
    )
  order by c.relname
`)

console.log('\nAssessment-related tables in the live database\n')
console.log(
  'table'.padEnd(34),
  'PK'.padEnd(4),
  'tenant'.padEnd(7),
  'ts'.padEnd(4),
  'RLS'.padEnd(5),
  'pol'.padEnd(4),
  'idx'.padEnd(4),
  'fk',
)
console.log('-'.repeat(78))

let problems = 0

for (const t of tables) {
  /*
   * `assessment_options` and `question_bank_options` intentionally have no
   * `created_at`-plus-`updated_at` pair — they are immutable rows replaced
   * wholesale — so timestamps are reported, not required.
   */
  const unsafe = !t.rls_enabled || t.policies === 0 || !t.has_pk
  if (unsafe) problems += 1

  console.log(
    t.table_name.padEnd(34),
    (t.has_pk ? 'yes' : 'NO').padEnd(4),
    (t.has_tenant ? 'yes' : 'no').padEnd(7),
    (t.has_timestamps ? 'yes' : 'no').padEnd(4),
    (t.rls_enabled ? 'ON' : 'OFF').padEnd(5),
    String(t.policies).padEnd(4),
    String(t.indexes).padEnd(4),
    String(t.fks),
  )
}

// ── Policies, per table ─────────────────────────────────────────────────────
const { rows: policies } = await client.query<{
  table_name: string
  policy: string
  command: string
  roles: string
}>(`
  select c.relname as table_name,
         p.polname as policy,
         case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                       when 'w' then 'UPDATE' when 'd' then 'DELETE'
                       else 'ALL' end as command,
         array_to_string(array(
           select rolname from pg_roles where oid = any(p.polroles)
         ), ',') as roles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (c.relname like 'assessment%' or c.relname like 'question_bank%')
   order by c.relname, p.polname
`)

console.log('\nPolicies\n')
for (const p of policies) {
  console.log(`  ${p.table_name.padEnd(32)} ${p.policy.padEnd(28)} ${p.command.padEnd(7)} ${p.roles}`)
}

// ── Does anon hold anything it should not? ──────────────────────────────────
const { rows: anonGrants } = await client.query<{ table_name: string; privileges: string }>(`
  select table_name, string_agg(privilege_type, ',') as privileges
    from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and (table_name like 'assessment%' or table_name like 'question_bank%')
   group by table_name
`)

console.log('\nanon grants on assessment tables')
if (anonGrants.length === 0) {
  console.log('  none — correct: nothing here is public')
} else {
  problems += anonGrants.length
  for (const g of anonGrants) console.log(`  PROBLEM ${g.table_name}: ${g.privileges}`)
}

// ── Storage buckets ─────────────────────────────────────────────────────────
const { rows: buckets } = await client.query<{
  id: string
  public: boolean
  file_size_limit: number | null
}>(`select id, public, file_size_limit from storage.buckets order by id`)

console.log('\nStorage buckets')
for (const b of buckets) {
  if (b.public) problems += 1
  console.log(
    `  ${b.id.padEnd(26)} ${b.public ? 'PUBLIC — problem' : 'private'}  ${
      b.file_size_limit ? `${Math.round(b.file_size_limit / 1048576)} MiB` : 'no limit'
    }`,
  )
}

// ── The engine's functions ──────────────────────────────────────────────────
const { rows: functions } = await client.query<{ name: string; security: string }>(`
  select p.proname as name,
         case when p.prosecdef then 'definer' else 'invoker' end as security
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'student_%' or p.proname like 'teacher_%')
   order by p.proname
`)

console.log('\nEngine functions')
for (const f of functions) console.log(`  ${f.name.padEnd(32)} ${f.security}`)

console.log(
  problems === 0
    ? '\nNo structural problems found.\n'
    : `\n${problems} problem(s) found.\n`,
)

await client.end()
process.exit(problems === 0 ? 0 : 1)
