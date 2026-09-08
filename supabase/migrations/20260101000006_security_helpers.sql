-- ============================================================================
-- 006 · Security helpers, privilege-escalation guards and account provisioning
-- ============================================================================
-- Everything in this file exists so that RLS policies can ask short, honest
-- questions without recursing through the tables they are protecting.
--
-- SECURITY DEFINER discipline applied to every function here:
--
--   * `set search_path = ''` — no object is resolved through a caller-supplied
--     search path, so a shadowed table or operator cannot hijack the body.
--     Every identifier below is schema-qualified.
--   * No identity parameters. Not one of these functions accepts a user id, a
--     role or an institution id. They derive everything from auth.uid(), which
--     comes from the verified JWT. This is the whole point: a policy written as
--     `institution_id = <value from the request>` would be trivially bypassed,
--     so no such value is ever available.
--   * `stable`, so the planner can hoist them into an InitPlan.
--   * EXECUTE is revoked from PUBLIC and granted only where required.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Identity
-- ----------------------------------------------------------------------------

create or replace function private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

comment on function private.current_user_id() is
  'The authenticated user id from the verified JWT. NULL when unauthenticated.';

create or replace function private.auth_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;
$$;

comment on function private.auth_role() is
  'Role of the caller, read from profiles. Never from the request. SECURITY DEFINER so RLS on profiles does not recurse.';

create or replace function private.auth_institution_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.institution_id
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;
$$;

comment on function private.auth_institution_id() is
  'Tenant of the caller, derived from the profiles row bound to auth.uid(). This is the only trusted source of institution_id.';

-- ----------------------------------------------------------------------------
-- Predicates used by policies
-- ----------------------------------------------------------------------------

create or replace function private.is_hq()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'HQ_ADMIN'
      and p.status = 'ACTIVE'
      and p.deleted_at is null
  );
$$;

create or replace function private.has_role(target_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = target_role
      and p.deleted_at is null
  );
$$;

comment on function private.has_role(text) is
  'Whether the caller holds a named role. Prefer has_permission(); role checks belong only where a permission would be meaningless.';

create or replace function private.has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_code = p.role
    where p.id = auth.uid()
      and rp.permission_code = has_permission.permission_code
      and p.status = 'ACTIVE'
      and p.deleted_at is null
  );
$$;

comment on function private.has_permission(text) is
  'Whether the callers role grants a permission. The argument is a constant in policy text, never client input.';

-- Both the user AND their institution must be live. This is what makes
-- suspending an institution revoke every one of its users at once, without
-- touching a single user row.
create or replace function private.is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    left join public.institutions i on i.id = p.institution_id
    where p.id = auth.uid()
      and p.status = 'ACTIVE'
      and p.deleted_at is null
      and (
        p.institution_id is null                                  -- HQ
        or (i.status = 'ACTIVE' and i.deleted_at is null)         -- live tenant
      )
  );
$$;

comment on function private.is_active() is
  'Caller is ACTIVE and, if they belong to a tenant, that tenant is ACTIVE too.';

-- Convenience wrapper: is the caller an active member of the given tenant?
create or replace function private.belongs_to(target_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_institution_id is not null
     and target_institution_id = private.auth_institution_id()
     and private.is_active();
$$;

revoke execute on function
  private.current_user_id(),
  private.auth_role(),
  private.auth_institution_id(),
  private.is_hq(),
  private.has_role(text),
  private.has_permission(text),
  private.is_active(),
  private.belongs_to(uuid)
from public;

grant execute on function
  private.current_user_id(),
  private.auth_role(),
  private.auth_institution_id(),
  private.is_hq(),
  private.has_role(text),
  private.has_permission(text),
  private.is_active(),
  private.belongs_to(uuid)
to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Privilege-escalation guard
--
-- RLS has no column-level granularity, so a policy cannot say "you may edit
-- your profile but not your role". A BEFORE UPDATE trigger can, and it applies
-- to every path into the table rather than only the API.
--
-- The privileged columns are role, institution_id, status and email. Email is
-- included because it is the identity Supabase Auth authenticates against and
-- must only change through the verified-change flow.
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER is load-bearing here, not incidental. Under SECURITY DEFINER
-- `current_user` evaluates to the function OWNER rather than the caller, so the
-- privileged-role bypass below would match on every single call and the trigger
-- would never block anything. The function needs no elevated rights — it only
-- compares NEW against OLD — so it must run as the invoker for the check to
-- mean what it says.
create or replace function private.prevent_privilege_escalation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Provisioning and administration run as a privileged database role. Ordinary
  -- API traffic arrives as `authenticated` and never reaches this branch.
  if current_user in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'service_role') then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role is immutable; roles are assigned by provisioning, not by the account holder'
      using errcode = '42501';
  end if;

  if new.institution_id is distinct from old.institution_id then
    raise exception 'institution_id is immutable; a user cannot move between institutions'
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    raise exception 'status is immutable; account status is set by an administrator'
      using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception 'email is immutable here; change it through the verified email-change flow'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id then
    raise exception 'id is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger profiles_prevent_privilege_escalation
  before update on public.profiles
  for each row execute function private.prevent_privilege_escalation();

comment on function private.prevent_privilege_escalation() is
  'Blocks self-service changes to role, institution_id, status, email and id. The airtight half of the anti-escalation defence.';

-- ----------------------------------------------------------------------------
-- Account provisioning
--
-- There is no public signup on this platform: institutions apply without an
-- account, and every user is provisioned by an authority above them. This
-- trigger enforces that rule at the database level.
--
-- The role and tenant are read from `raw_app_meta_data`, NOT `raw_user_meta_data`.
-- That distinction is the security of the whole flow: app_metadata can only be
-- written with the service role, while user_metadata is writable by the account
-- holder through `auth.updateUser({ data })`. Trusting user_metadata here would
-- hand every user a role-assignment primitive.
--
-- HQ_ADMIN is refused unconditionally. It is assigned only by an authorized
-- operator running supabase/seed/bootstrap_hq_admin.sql directly against the
-- database, and has no path through the application or the Auth API.
-- ----------------------------------------------------------------------------
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_role       text := new.raw_app_meta_data ->> 'afi_role';
  claimed_tenant     text := new.raw_app_meta_data ->> 'afi_institution_id';
  claimed_full_name  text := coalesce(nullif(btrim(new.raw_app_meta_data ->> 'afi_full_name'), ''), 'Pending');
begin
  -- An auth user carrying no provisioning intent gets NO PROFILE.
  --
  -- It deliberately does not raise. Raising here would abort the INSERT into
  -- auth.users, and GoTrue performs that insert for the Supabase dashboard's
  -- "Invite user" action too — which is step one of the documented HQ
  -- bootstrap. A trigger that makes HQ impossible to create is not a security
  -- control, it is an outage.
  --
  -- Returning without a profile is the right shape anyway, because a
  -- profile-less auth user has no access to anything:
  --
  --   * private.auth_role() and auth_institution_id() both return NULL, so
  --     every tenant policy evaluates false;
  --   * private.is_active() is false, so every gated policy evaluates false;
  --   * getSessionContext() returns null, and the login action signs the user
  --     straight back out.
  --
  -- The property this function actually has to guarantee is narrower and is
  -- fully preserved below: nobody obtains a ROLE or a TENANT they were not
  -- provisioned with, and HQ_ADMIN is refused on every API path.
  --
  -- Blocking unsolicited account creation belongs one level up, where it can be
  -- done without breaking administration: `enable_signup = false` in
  -- supabase/config.toml.
  if claimed_role is null then
    return new;
  end if;

  if claimed_role = 'HQ_ADMIN' then
    raise exception 'HQ_ADMIN cannot be assigned through account creation'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles r where r.code = claimed_role) then
    raise exception 'unknown role %', claimed_role using errcode = '22023';
  end if;

  if claimed_tenant is null then
    raise exception 'afi_institution_id must be set in app_metadata for role %', claimed_role
      using errcode = '42501';
  end if;

  insert into public.profiles (id, email, full_name, role, institution_id, status)
  values (
    new.id,
    lower(new.email),
    claimed_full_name,
    claimed_role,
    claimed_tenant::uuid,
    'INVITED'
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

comment on function private.handle_new_auth_user() is
  'Creates the profile for a provisioned auth user. Reads role/tenant from app_metadata (service-role only), never user_metadata. Refuses HQ_ADMIN.';
