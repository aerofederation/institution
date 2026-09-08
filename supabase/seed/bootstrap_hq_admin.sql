-- ============================================================================
-- HQ ADMINISTRATOR BOOTSTRAP
-- ============================================================================
-- This is the ONLY way an HQ_ADMIN comes into existence on this platform.
--
-- It is deliberately not reachable from the application, the Auth API, or any
-- seed script. Run it by hand, as an authorized operator, connected as the
-- `postgres` role — from the Supabase SQL editor or psql.
--
-- Why it has to be manual
-- -----------------------
-- HQ_ADMIN can read every institution in the federation. Three independent
-- mechanisms keep it out of reach of anything automated:
--
--   1. `private.handle_new_auth_user()` raises if account creation carries
--      `afi_role = 'HQ_ADMIN'`, so the Auth API cannot mint one.
--   2. `private.prevent_privilege_escalation()` refuses any change to
--      `profiles.role` that arrives as `authenticated`, so no signed-in user
--      can promote themselves or anyone else.
--   3. `profiles_hq_has_no_tenant` requires HQ to have no institution_id, so an
--      existing tenant profile cannot simply be re-labelled.
--
-- Running this script is therefore a conscious, audited act rather than a
-- configuration mistake waiting to happen.
--
-- Procedure
-- ---------
--   1. Invite the person through the Supabase dashboard
--      (Authentication → Users → Invite user). Because their app_metadata has
--      no `afi_role`, the provisioning trigger creates NO profile for them —
--      that is expected, and this script creates it below.
--   2. Have them accept the invitation and set a password.
--   3. Set the two variables below and run the whole file in one transaction.
--   4. Confirm the verification output at the end, then record who ran it and
--      why in your change log.
--
-- Re-running is safe: it is idempotent per email address.
-- ============================================================================

-- ── Set these two, then run the whole file ──────────────────────────────────
-- Plain SQL SET rather than psql's \set, so this works unchanged in the
-- Supabase SQL editor as well as in psql.
set afi.bootstrap_email = 'hq.admin@aerofederation.in';
set afi.bootstrap_name  = 'AEROFEDERATION HEAD QUARTERS Administrator';

begin;

do $$
declare
  target_email text := nullif(current_setting('afi.bootstrap_email', true), '');
  target_name  text := nullif(current_setting('afi.bootstrap_name', true), '');
  auth_user_id uuid;
begin
  if target_email is null or target_name is null then
    raise exception 'Set afi.bootstrap_email and afi.bootstrap_name at the top of this file first'
      using errcode = '22023';
  end if;

  if session_user not in ('postgres', 'supabase_admin') then
    raise exception 'This script must be run by a database administrator, not through the API (session_user is %)', session_user
      using errcode = '42501';
  end if;

  select id into auth_user_id from auth.users where email = lower(target_email);

  if auth_user_id is null then
    raise exception
      'No auth user exists for %. Invite them through the Supabase dashboard first, then re-run.',
      target_email
      using errcode = 'P0002';
  end if;

  if exists (select 1 from public.profiles where id = auth_user_id and role = 'HQ_ADMIN') then
    raise notice 'Already an HQ administrator: %', target_email;
    return;
  end if;

  if exists (select 1 from public.profiles where id = auth_user_id) then
    -- An existing tenant profile is never converted. Promoting a teacher or a
    -- student in place would leave their extension row and tenant data behind,
    -- and the CHECK constraint would reject the result anyway.
    raise exception
      'A profile already exists for % with a tenant role. Create the HQ account from a separate address.',
      target_email
      using errcode = '23505';
  end if;

  insert into public.profiles (id, email, full_name, role, institution_id, status)
  values (auth_user_id, lower(target_email), target_name, 'HQ_ADMIN', null, 'ACTIVE');

  -- Mirror the role into app_metadata so middleware can route without a
  -- database read. This is a routing hint only; every authorization decision is
  -- re-derived from the profiles row above.
  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
                             || jsonb_build_object('afi_role', 'HQ_ADMIN')
   where id = auth_user_id;

  insert into public.audit_logs (actor_id, actor_role, actor_email, action, entity_type, entity_id, metadata)
  values (auth_user_id, 'HQ_ADMIN', lower(target_email), 'HQ_ADMIN_BOOTSTRAPPED', 'profile', auth_user_id,
          jsonb_build_object('performed_by', session_user));

  raise notice 'HQ administrator created: %', target_email;
end $$;

commit;

-- ── Verification ────────────────────────────────────────────────────────────
-- Expect exactly the accounts you intend to exist, each with a NULL institution.
select p.email,
       p.full_name,
       p.role,
       p.status,
       p.institution_id,
       p.created_at
  from public.profiles p
 where p.role = 'HQ_ADMIN'
 order by p.created_at;
