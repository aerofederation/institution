-- ============================================================================
-- 010 · Notifications, audit log and platform settings
-- ============================================================================

-- ── Notifications ───────────────────────────────────────────────────────────
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  -- NULL for federation-wide notices addressed to an HQ user.
  institution_id  uuid references public.institutions (id) on delete cascade,

  category        public.notification_category not null,
  priority        public.notification_priority not null default 'NORMAL',
  title           text not null check (length(btrim(title)) between 1 and 200),
  body            text check (body is null or length(body) <= 4000),

  -- In-app destination. Relative path only: an absolute URL here would let a
  -- notification become an open redirect.
  deep_link       text check (deep_link is null or deep_link ~ '^/[A-Za-z0-9/_?&=.-]*$'),

  read_at         timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now()
);

comment on column public.notifications.deep_link is
  'Relative in-app path. Absolute URLs are rejected so a notification cannot become an open redirect.';

-- Drives the unread badge; partial so it stays small as read history grows.
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_tenant_idx on public.notifications (institution_id, created_at desc) where institution_id is not null;

-- ============================================================================
-- Audit log
--
-- Append-only by construction: migration 011 grants INSERT and SELECT and
-- deliberately creates no UPDATE or DELETE policy for any role, so the log
-- cannot be rewritten through the API even by an administrator.
-- ============================================================================

-- Secrets must never reach the audit trail. Rather than trusting every future
-- call site to remember that, the constraint below rejects the write.
create or replace function private.jsonb_contains_secret_key(payload jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  forbidden constant text[] := array[
    'password', 'new_password', 'current_password', 'confirm_password',
    'token', 'access_token', 'refresh_token', 'id_token', 'jwt',
    'secret', 'client_secret', 'api_key', 'apikey', 'anon_key',
    'service_role_key', 'authorization', 'cookie', 'session',
    'otp', 'otp_hash', 'token_hash', 'private_key', 'smtp_password'
  ];
  key   text;
  value jsonb;
begin
  if payload is null then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for key, value in select * from jsonb_each(payload) loop
      if lower(key) = any (forbidden) then
        return true;
      end if;
      if private.jsonb_contains_secret_key(value) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for value in select jsonb_array_elements(payload) loop
      if private.jsonb_contains_secret_key(value) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

comment on function private.jsonb_contains_secret_key(jsonb) is
  'Recursively detects credential-shaped keys. Used by a CHECK constraint so secrets cannot be written to the audit log at all.';

create table public.audit_logs (
  id              uuid primary key default gen_random_uuid(),

  -- NULL for unauthenticated events such as a failed login or an anonymous
  -- application submission. The action still has to be recorded.
  actor_id        uuid references public.profiles (id) on delete set null,
  -- Snapshot, not a join: the audit trail must still read correctly after the
  -- actor's role changes or their profile is removed.
  actor_role      text,
  actor_email     text,

  institution_id  uuid references public.institutions (id) on delete set null,

  action          text not null check (action ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  entity_type     text not null check (length(btrim(entity_type)) between 1 and 64),
  entity_id       uuid,

  metadata        jsonb not null default '{}'::jsonb,

  -- Hashed, never raw: the log should support investigation without becoming a
  -- store of personal network identifiers.
  ip_hash         text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  user_agent      text check (user_agent is null or length(user_agent) <= 512),

  created_at      timestamptz not null default now(),

  constraint audit_metadata_is_object check (jsonb_typeof(metadata) = 'object'),
  constraint audit_metadata_carries_no_secrets check (
    not private.jsonb_contains_secret_key(metadata)
  )
);

comment on table public.audit_logs is
  'Append-only record of security-relevant actions. No UPDATE or DELETE policy exists for any role.';
comment on constraint audit_metadata_carries_no_secrets on public.audit_logs is
  'Rejects credential-shaped keys anywhere in the metadata tree. Defence against a future call site logging too much.';

create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc) where actor_id is not null;
create index audit_logs_tenant_idx on public.audit_logs (institution_id, created_at desc) where institution_id is not null;
create index audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id) where entity_id is not null;

-- ----------------------------------------------------------------------------
-- Writer used by the application layer.
--
-- SECURITY DEFINER so that a failed-login event can be recorded for a caller
-- who has no session, while the actor snapshot is still taken from auth.uid()
-- and never from an argument. The caller cannot forge who acted.
-- ----------------------------------------------------------------------------
create or replace function public.write_audit_log(
  action       text,
  entity_type  text,
  entity_id    uuid default null,
  metadata     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor       uuid := auth.uid();
  actor_role  text;
  actor_email text;
  tenant      uuid;
  new_id      uuid;
begin
  if actor is not null then
    select p.role, p.email, p.institution_id
      into actor_role, actor_email, tenant
      from public.profiles p
     where p.id = actor;
  end if;

  insert into public.audit_logs (actor_id, actor_role, actor_email, institution_id,
                                 action, entity_type, entity_id, metadata)
  values (actor, actor_role, actor_email, tenant,
          write_audit_log.action, write_audit_log.entity_type,
          write_audit_log.entity_id, coalesce(write_audit_log.metadata, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

revoke execute on function public.write_audit_log(text, text, uuid, jsonb) from public;
grant execute on function public.write_audit_log(text, text, uuid, jsonb) to anon, authenticated, service_role;

comment on function public.write_audit_log(text, text, uuid, jsonb) is
  'Records an audited action. Actor identity is taken from auth.uid(), never from an argument, so it cannot be forged.';

-- ============================================================================
-- Platform settings
-- ============================================================================
create table public.system_settings (
  key           text primary key check (key ~ '^[a-z][a-z0-9_.]{2,63}$'),
  value         jsonb not null,
  description   text not null,
  -- Readable by anonymous visitors through the public settings projection.
  -- Secrets never live here — they live in the server environment.
  is_public     boolean not null default false,
  updated_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint system_settings_carries_no_secrets check (
    not private.jsonb_contains_secret_key(value)
  )
);

comment on table public.system_settings is
  'Operational configuration only. Credentials belong in the server environment, never here.';

create trigger system_settings_set_updated_at
  before update on public.system_settings
  for each row execute function private.set_updated_at();

insert into public.system_settings (key, value, description, is_public) values
  ('platform.name', '"Aero Federation of India"'::jsonb,
   'Display name used across the platform.', true),
  ('applications.accepting', 'true'::jsonb,
   'Whether the public institution application form accepts new submissions.', true),
  ('applications.max_documents', '15'::jsonb,
   'Maximum documents an applicant may attach to one application.', false),
  ('security.invitation_ttl_hours', '72'::jsonb,
   'Lifetime of an account activation link, in hours.', false),
  ('security.password_min_length', '12'::jsonb,
   'Minimum password length enforced at activation and reset.', true);
