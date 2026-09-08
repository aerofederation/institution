-- ============================================================================
-- 015 · Public projections
-- ============================================================================
-- The public website needs data without a session, and `anon` deliberately
-- holds no privilege on any table in `public` (migration 011 revokes them all).
-- Loosening that would open every row of a table to the internet in order to
-- expose a handful of columns.
--
-- Instead the public surface is a small, closed set of SECURITY DEFINER
-- functions. Each one returns a fixed projection of already-public information
-- about already-approved records. The attack surface is these signatures rather
-- than the schema.
--
-- Discipline applied to every function here:
--   * `set search_path = ''` and fully-qualified identifiers.
--   * `stable`, no side effects, no arguments that could widen the result.
--   * ACTIVE, non-deleted rows only — a suspended or pending institution does
--     not appear on the public site.
--   * No email addresses, phone numbers, document paths, counts of individuals
--     per institution, or anything about a person.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Directory of institutions in the network.
-- ----------------------------------------------------------------------------
create or replace function public.public_institution_directory(
  max_rows integer default 60
)
returns table (
  slug              text,
  name              text,
  institution_type  public.institution_type,
  category          public.institution_category,
  city              text,
  state             text,
  country           text,
  field_of_work     text,
  logo_path         text,
  approved_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.slug,
         i.name,
         i.institution_type,
         i.category,
         i.city,
         i.state,
         i.country,
         i.field_of_work,
         i.logo_path,
         i.approved_at
    from public.institutions i
   where i.status = 'ACTIVE'
     and i.deleted_at is null
   order by i.approved_at desc nulls last, i.name
   limit least(greatest(coalesce(max_rows, 60), 1), 200);
$$;

comment on function public.public_institution_directory(integer) is
  'Public directory of ACTIVE institutions. Fixed projection; no contact details or member counts.';

-- ----------------------------------------------------------------------------
-- A single institution, by public slug.
-- ----------------------------------------------------------------------------
create or replace function public.public_institution_by_slug(target_slug text)
returns table (
  slug              text,
  name              text,
  institution_type  public.institution_type,
  category          public.institution_category,
  description       text,
  field_of_work     text,
  website           text,
  city              text,
  state             text,
  country           text,
  year_established  smallint,
  logo_path         text,
  approved_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.slug,
         i.name,
         i.institution_type,
         i.category,
         i.description,
         i.field_of_work,
         i.website,
         i.city,
         i.state,
         i.country,
         i.year_established,
         i.logo_path,
         i.approved_at
    from public.institutions i
   where i.slug = target_slug
     and i.status = 'ACTIVE'
     and i.deleted_at is null;
$$;

comment on function public.public_institution_by_slug(text) is
  'Public profile for one ACTIVE institution. Returns no rows for pending, suspended or unknown slugs.';

-- ----------------------------------------------------------------------------
-- Network statistics for the public site.
--
-- Aggregates only. The homepage decides how to present them — real figures once
-- the network is large enough to be meaningful, and a qualitative treatment
-- before that. It never invents a number.
-- ----------------------------------------------------------------------------
create or replace function public.public_platform_stats()
returns table (
  institutions  bigint,
  educators     bigint,
  learners      bigint,
  programs      bigint,
  states        bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.institutions i
      where i.status = 'ACTIVE' and i.deleted_at is null),
    (select count(*) from public.teachers t
      join public.institutions i on i.id = t.institution_id
     where t.status = 'ACTIVE' and t.deleted_at is null
       and i.status = 'ACTIVE' and i.deleted_at is null),
    (select count(*) from public.students s
      join public.institutions i on i.id = s.institution_id
     where s.status = 'ACTIVE' and s.deleted_at is null
       and i.status = 'ACTIVE' and i.deleted_at is null),
    (select count(*) from public.programs p
      join public.institutions i on i.id = p.institution_id
     where p.status = 'ACTIVE' and p.deleted_at is null
       and i.status = 'ACTIVE' and i.deleted_at is null),
    (select count(distinct i.state) from public.institutions i
      where i.status = 'ACTIVE' and i.deleted_at is null and i.state is not null);
$$;

comment on function public.public_platform_stats() is
  'Aggregate network figures for the public site. Counts only, never identities.';

-- ----------------------------------------------------------------------------
-- Publicly readable platform settings.
-- ----------------------------------------------------------------------------
create or replace function public.public_settings()
returns table (key text, value jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select s.key, s.value
    from public.system_settings s
   where s.is_public;
$$;

-- ----------------------------------------------------------------------------
-- Grants
--
-- EXECUTE is revoked from PUBLIC first, then granted explicitly. Granting
-- without revoking would leave the implicit PUBLIC grant in place.
-- ----------------------------------------------------------------------------
revoke execute on function
  public.public_institution_directory(integer),
  public.public_institution_by_slug(text),
  public.public_platform_stats(),
  public.public_settings()
from public;

grant execute on function
  public.public_institution_directory(integer),
  public.public_institution_by_slug(text),
  public.public_platform_stats(),
  public.public_settings()
to anon, authenticated, service_role;
