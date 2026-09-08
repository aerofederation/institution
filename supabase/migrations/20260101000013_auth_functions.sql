-- ============================================================================
-- 013 · Authentication support functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Completes activation for a provisioned user who has just set their password.
--
-- `profiles.status` is immutable to the account holder — the trigger in
-- migration 006 refuses any change arriving as `authenticated`. That is the
-- correct default, and it must not be relaxed, because it is what stops a
-- suspended user from reactivating themselves. So activation gets exactly one
-- narrow, auditable exception instead:
--
--   * SECURITY DEFINER, so the UPDATE runs as the owner and the trigger's
--     privileged-role branch admits it.
--   * INVITED -> ACTIVE only. Every other current status is returned unchanged.
--     A SUSPENDED or DEACTIVATED account cannot be revived through this path.
--   * The account must have a confirmed email, which only the invitation or
--     recovery link exchange produces.
--   * It takes no arguments. The subject is always auth.uid(), so one user
--     cannot activate another.
-- ----------------------------------------------------------------------------
create or replace function public.activate_own_account()
returns public.user_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller           uuid := auth.uid();
  current_status   public.user_status;
  confirmed_at     timestamptz;
begin
  if caller is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select p.status into current_status
    from public.profiles p
   where p.id = caller and p.deleted_at is null;

  if current_status is null then
    raise exception 'no profile for this account' using errcode = '42501';
  end if;

  -- Idempotent, and refuses to resurrect anything that was not merely invited.
  if current_status <> 'INVITED' then
    return current_status;
  end if;

  select u.email_confirmed_at into confirmed_at
    from auth.users u
   where u.id = caller;

  if confirmed_at is null then
    raise exception 'email is not confirmed' using errcode = '42501';
  end if;

  update public.profiles set status = 'ACTIVE' where id = caller;

  -- Keep the role extension rows in step with the profile.
  update public.institution_admins set status = 'ACTIVE' where profile_id = caller;
  update public.teachers           set status = 'ACTIVE' where profile_id = caller;
  update public.students           set status = 'ACTIVE' where profile_id = caller;

  insert into public.audit_logs (actor_id, actor_role, actor_email, institution_id,
                                 action, entity_type, entity_id, metadata)
  select p.id, p.role, p.email, p.institution_id,
         'ACCOUNT_ACTIVATED', 'profile', p.id, '{}'::jsonb
    from public.profiles p
   where p.id = caller;

  return 'ACTIVE';
end;
$$;

revoke execute on function public.activate_own_account() from public, anon;
grant execute on function public.activate_own_account() to authenticated;

comment on function public.activate_own_account() is
  'INVITED -> ACTIVE for the calling user only, and only with a confirmed email. Cannot revive a SUSPENDED or DEACTIVATED account.';

-- ----------------------------------------------------------------------------
-- Records a successful sign-in without granting the account holder a general
-- ability to write to their own profile row.
-- ----------------------------------------------------------------------------
create or replace function public.touch_last_login()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles
     set last_login_at = now()
   where id = auth.uid();
$$;

revoke execute on function public.touch_last_login() from public, anon;
grant execute on function public.touch_last_login() to authenticated;
