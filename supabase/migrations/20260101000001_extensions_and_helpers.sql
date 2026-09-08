-- ============================================================================
-- 001 · Extensions, shared schemas and generic helpers
-- ============================================================================
-- Deliberately dependency-light. `gen_random_uuid()` is core PostgreSQL since
-- 13, and case-insensitive email is handled by a domain rather than `citext`,
-- so this schema carries no extension-placement assumptions and applies
-- identically to Supabase and to the migration test harness.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- `private` holds security helpers that RLS policies call. It is never exposed
-- through PostgREST, so nothing in it is reachable over the API.
-- ----------------------------------------------------------------------------
create schema if not exists private;

revoke all on schema private from public;
revoke usage on schema private from anon, authenticated;
grant usage on schema private to postgres, service_role;

-- ----------------------------------------------------------------------------
-- Email addresses are stored normalised. Storing the lowercase form and
-- rejecting anything else keeps uniqueness honest without a functional index
-- and without depending on `citext`.
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'email_address') then
    create domain public.email_address as text
      check (
        value = lower(value)
        and value ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
        and length(value) between 6 and 320
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- `updated_at` maintenance. Attached to every table that carries the column so
-- the value can never drift from reality by being forgotten in an UPDATE.
-- ----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function private.set_updated_at() is
  'BEFORE UPDATE trigger that stamps updated_at. Attached to every table with that column.';

-- ----------------------------------------------------------------------------
-- Blocks changes to columns that must never move after insert. Used for tenant
-- discriminators: once a row belongs to an institution it belongs to it
-- permanently, which is what makes the composite foreign keys elsewhere in the
-- schema a durable guarantee rather than a point-in-time check.
-- ----------------------------------------------------------------------------
create or replace function private.freeze_institution_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.institution_id is distinct from old.institution_id then
    raise exception 'institution_id is immutable on %', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function private.freeze_institution_id() is
  'BEFORE UPDATE trigger preventing a row from being moved between tenants.';

-- ----------------------------------------------------------------------------
-- Public application reference generator.
--
-- The internal primary key stays a UUID and is never shown to an applicant.
-- This produces the separate, human-quotable public identifier described in the
-- architecture: AFI-<year>-<8 chars of Crockford base32>. It is derived from a
-- random UUID rather than a sequence, so references cannot be enumerated and
-- reveal nothing about application volume or ordering.
-- ----------------------------------------------------------------------------
create or replace function private.generate_application_ref()
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- Crockford: no I, L, O, U
  raw      bytea;
  suffix   text := '';
  i        integer;
begin
  raw := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  for i in 0..7 loop
    suffix := suffix || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
  end loop;
  return 'AFI-' || to_char(now(), 'YYYY') || '-' || suffix;
end;
$$;

comment on function private.generate_application_ref() is
  'Returns AFI-<year>-<8 Crockford base32 chars>. Random, not sequential, so references cannot be enumerated.';
