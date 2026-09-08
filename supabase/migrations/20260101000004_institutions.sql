-- ============================================================================
-- 004 · Institutions — the tenant boundary
-- ============================================================================
-- Every tenant-owned row in the platform carries institution_id and ultimately
-- resolves to a row in this table. Suspending an institution here revokes
-- access for all of its users atomically, because private.is_active() checks
-- the institution as well as the profile.
-- ============================================================================

create table public.institutions (
  id                    uuid primary key default gen_random_uuid(),

  -- Public URL identity. Immutable in practice: changing it breaks inbound
  -- links, so the application does not offer it as an editable field.
  slug                  text not null unique
                        check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 80),

  name                  text not null check (length(btrim(name)) between 2 and 200),
  institution_type      public.institution_type not null,
  category              public.institution_category not null,

  official_email        public.email_address not null,
  official_phone        text check (official_phone is null or official_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  website               text check (website is null or website ~* '^https?://'),

  description           text check (description is null or length(description) <= 5000),
  -- Free-text area of work: aerospace, avionics, general education, and so on.
  field_of_work         text check (field_of_work is null or length(field_of_work) <= 300),
  year_established      smallint check (year_established is null or year_established between 1800 and extract(year from now())::smallint),
  registration_number   text check (registration_number is null or length(btrim(registration_number)) between 2 and 100),

  address_line          text,
  city                  text,
  state                 text,
  country               text not null default 'India',
  postal_code           text check (postal_code is null or postal_code ~ '^[A-Za-z0-9][A-Za-z0-9 -]{2,15}$'),

  -- Storage object path, never a public URL. Rendered through a signed URL.
  logo_path             text,

  status                public.institution_status not null default 'PENDING',

  -- Populated on approval. The FK to profiles is added in migration 005,
  -- because profiles references institutions and one of the two has to come
  -- first.
  approved_at           timestamptz,
  approved_by           uuid,
  suspended_at          timestamptz,
  suspended_by          uuid,
  suspension_reason     text,

  -- The application this institution was provisioned from. FK added in 006.
  source_application_id uuid,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz,

  -- An approved institution must carry its approval metadata, and a suspended
  -- one must carry a reason. Status and evidence cannot drift apart.
  constraint institutions_approval_coherent check (
    (status = 'PENDING' and approved_at is null)
    or (status <> 'PENDING' and approved_at is not null and approved_by is not null)
  ),
  constraint institutions_suspension_coherent check (
    status <> 'SUSPENDED'
    or (suspended_at is not null and suspension_reason is not null)
  )
);

comment on table public.institutions is
  'Registered institutions. The tenant root: every tenant-scoped table resolves here through institution_id.';
comment on column public.institutions.logo_path is
  'Supabase Storage object path in the profile-images bucket. Never a public URL.';

create index institutions_status_idx on public.institutions (status) where deleted_at is null;
create index institutions_type_idx on public.institutions (institution_type) where deleted_at is null;
create index institutions_created_idx on public.institutions (created_at desc);
create index institutions_name_idx on public.institutions (lower(name));

create trigger institutions_set_updated_at
  before update on public.institutions
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Slug helper. Used by the approval service so the public URL is derived from
-- the institution name rather than chosen by the applicant.
-- ----------------------------------------------------------------------------
create or replace function private.slugify(input text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
    '-'
  );
$$;

comment on function private.slugify(text) is
  'Normalises a name into a URL slug. Uniqueness is enforced by the column constraint, not here.';
