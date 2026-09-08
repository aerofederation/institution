-- ============================================================================
-- 005 · Profiles — the application's identity record
-- ============================================================================
--   auth.users  ──1:1──▶  profiles  ──▶ role ──▶ permissions
--                              └────▶ institution (tenant)
--
-- Passwords, tokens and factors stay in auth.users, owned by Supabase Auth.
-- This table never stores or duplicates any credential.
--
-- profiles is the single authority for who a user is, what role they hold and
-- which tenant they belong to. Those three columns are made immutable by
-- trigger in migration 010 — RLS cannot express column-level rules, so a
-- trigger is the only airtight place for them.
-- ============================================================================

create table public.profiles (
  -- Same UUID as the Supabase Auth user. Deleting the auth user removes the
  -- profile, so the two can never disagree about who exists.
  id              uuid primary key references auth.users (id) on delete cascade,

  email           public.email_address not null unique,
  full_name       text not null check (length(btrim(full_name)) between 2 and 150),
  phone           text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),

  role            text not null references public.roles (code) on update cascade,

  -- NULL only for HQ, which sits above every tenant. Enforced below.
  institution_id  uuid references public.institutions (id) on delete restrict,

  status          public.user_status not null default 'INVITED',

  avatar_path     text,
  locale          text not null default 'en-IN' check (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  timezone        text not null default 'Asia/Kolkata',

  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- The hierarchy, asserted structurally: HQ has no tenant, and everyone else
  -- has exactly one. A tenant user therefore cannot become HQ without also
  -- violating this constraint, and an HQ user cannot acquire a tenant.
  constraint profiles_hq_has_no_tenant check (
    (role = 'HQ_ADMIN') = (institution_id is null)
  ),

  -- Target for every composite (profile_id, institution_id) foreign key in the
  -- schema. This is what makes it impossible for a teacher or student record to
  -- attach to a profile belonging to a different institution.
  constraint profiles_id_institution_uk unique (id, institution_id)
);

comment on table public.profiles is
  'Application identity, 1:1 with auth.users. Never stores credentials. role, institution_id and status are trigger-immutable.';
comment on column public.profiles.institution_id is
  'Tenant. NULL only for HQ_ADMIN. Never accepted from the browser — always derived from the session server-side.';
comment on constraint profiles_id_institution_uk on public.profiles is
  'Anchor for composite tenant foreign keys. Do not drop.';

create index profiles_institution_idx on public.profiles (institution_id) where deleted_at is null;
create index profiles_institution_role_idx on public.profiles (institution_id, role, status) where deleted_at is null;
create index profiles_role_idx on public.profiles (role);
create index profiles_status_idx on public.profiles (status);
create index profiles_name_idx on public.profiles (lower(full_name));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- Close the institutions ↔ profiles cycle now that both tables exist.
-- ON DELETE RESTRICT: an administrator who has approved institutions cannot be
-- hard-deleted out from under the audit trail.
-- ----------------------------------------------------------------------------
alter table public.institutions
  add constraint institutions_approved_by_fk
    foreign key (approved_by) references public.profiles (id) on delete restrict,
  add constraint institutions_suspended_by_fk
    foreign key (suspended_by) references public.profiles (id) on delete restrict;
