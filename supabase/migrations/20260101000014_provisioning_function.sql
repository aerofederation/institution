-- ============================================================================
-- 014 · Explicit profile provisioning
-- ============================================================================
-- WHY THIS EXISTS
--
-- Migration 006 creates `on_auth_user_created`, a trigger on `auth.users`, to
-- build the profile whenever an account is provisioned. Measured against the
-- hosted project, that trigger CANNOT do the job — and the reason is worth
-- writing down, because it is not a permissions problem and re-installing the
-- trigger does not fix it.
--
-- The trigger is installed and it works. Inserting into auth.users directly
-- with `app_metadata` present fires it and produces a correct profile. But an
-- account created through the GoTrue admin API produces NO profile, while
-- `raw_app_meta_data` does contain `afi_role` afterwards.
--
-- GoTrue inserts the user row FIRST and applies `app_metadata` in a subsequent
-- UPDATE. An AFTER INSERT trigger therefore always observes empty metadata,
-- has no role or tenant to act on, and correctly does nothing. Every account
-- the application will ever create is created through that API.
--
-- So the trigger can only ever serve direct SQL inserts, and depending on it
-- was the wrong call regardless: a step the platform cannot function without
-- does not belong in a schema this project does not own, and its failure mode
-- is silent — account created, no profile, no error, nothing works afterwards
-- for reasons that surface three layers away.
--
-- So provisioning becomes explicit. `public.provision_profile()` lives in a
-- schema we do own, is callable only by the service role, and is the path the
-- provisioning services actually take. The trigger stays as defence in depth
-- where the platform is permitted to install it — the function is idempotent,
-- so the two cannot fight.
--
-- Every guarantee from the trigger is preserved here:
--   * HQ_ADMIN is refused outright. The bootstrap script remains the only path.
--   * The role must exist in public.roles.
--   * A tenant role must name a real institution.
--   * The account is created INVITED; activation stays a separate, deliberate
--     act performed by public.activate_own_account().
-- ============================================================================

create or replace function public.provision_profile(
  user_id         uuid,
  user_email      text,
  full_name       text,
  role            text,
  institution_id  uuid
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.profiles;
  created  public.profiles;
begin
  -- Only the service role provisions. `authenticated` reaching this would be a
  -- role-assignment primitive handed to every signed-in user.
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'provision_profile is not callable by %', current_user
      using errcode = '42501';
  end if;

  if role = 'HQ_ADMIN' then
    raise exception 'HQ_ADMIN cannot be assigned through provisioning'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles r where r.code = provision_profile.role) then
    raise exception 'unknown role %', role using errcode = '22023';
  end if;

  if provision_profile.institution_id is null then
    raise exception 'institution_id is required for role %', role using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.institutions i where i.id = provision_profile.institution_id
  ) then
    raise exception 'unknown institution %', provision_profile.institution_id
      using errcode = '23503';
  end if;

  if not exists (select 1 from auth.users u where u.id = provision_profile.user_id) then
    raise exception 'no auth user %', provision_profile.user_id using errcode = '23503';
  end if;

  -- Idempotent. If migration 006's trigger did fire on this project, the row
  -- already exists and this call simply confirms it agrees.
  select * into existing from public.profiles p where p.id = provision_profile.user_id;

  if existing.id is not null then
    if existing.role is distinct from provision_profile.role then
      raise exception 'profile % already exists with role %, refusing to change it to %',
        provision_profile.user_id, existing.role, provision_profile.role
        using errcode = '42501';
    end if;
    if existing.institution_id is distinct from provision_profile.institution_id then
      raise exception 'profile % already belongs to another institution',
        provision_profile.user_id
        using errcode = '42501';
    end if;
    return existing;
  end if;

  insert into public.profiles (id, email, full_name, role, institution_id, status)
  values (
    provision_profile.user_id,
    lower(provision_profile.user_email),
    coalesce(nullif(btrim(provision_profile.full_name), ''), 'Pending'),
    provision_profile.role,
    provision_profile.institution_id,
    'INVITED'
  )
  returning * into created;

  insert into public.audit_logs (actor_id, actor_role, actor_email, institution_id,
                                 action, entity_type, entity_id, metadata)
  values (null, 'SYSTEM', null, provision_profile.institution_id,
          'PROFILE_PROVISIONED', 'profile', created.id,
          jsonb_build_object('role', provision_profile.role));

  return created;
end;
$$;

revoke execute on function
  public.provision_profile(uuid, text, text, text, uuid)
from public, anon, authenticated;

grant execute on function
  public.provision_profile(uuid, text, text, text, uuid)
to service_role;

comment on function public.provision_profile(uuid, text, text, text, uuid) is
  'Creates the profile for a provisioned auth user. Service role only, idempotent, refuses HQ_ADMIN.';

-- ----------------------------------------------------------------------------
-- Re-attempt the auth.users trigger, without letting its absence abort a
-- deployment.
--
-- Where the platform is permitted to install it, it is a useful backstop for an
-- account created outside the provisioning service. Where it is not — which is
-- the case on at least one hosted project — the NOTICE says so plainly instead
-- of the schema silently disagreeing with the code.
-- ----------------------------------------------------------------------------
do $$
begin
  begin
    drop trigger if exists on_auth_user_created on auth.users;
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function private.handle_new_auth_user();
    raise notice 'on_auth_user_created installed on auth.users';
  exception
    when insufficient_privilege or undefined_table then
      raise notice
        'Could not install on_auth_user_created on auth.users (%). This is not fatal: '
        'public.provision_profile() is the primary provisioning path.', sqlerrm;
  end;
end $$;
