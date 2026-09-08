-- ============================================================================
-- 050 · Notices an institution publishes to its own people
-- ============================================================================
-- One notice, addressed to everyone, to the teachers, or to the students. The
-- audience is a column rather than three separate feeds, because "exam week
-- starts Monday" is usually for both and duplicating it would mean editing it
-- twice and correcting it once.
--
-- No per-recipient rows. Publishing does not fan out into `notifications`: an
-- institution with four thousand students would write four thousand rows for a
-- single sentence, and every edit would have to chase them. The notice is one
-- row, and RLS decides who it is visible to — which also means correcting a
-- typo corrects it for everybody, immediately, rather than for whoever has not
-- read it yet.
--
-- The cost of that choice is honest: there is no per-person read state, so
-- nothing here can say "unread". A notice board is the right mental model — it
-- is on the wall, and people look at it.
-- ============================================================================

create type public.notice_audience as enum ('EVERYONE', 'TEACHERS', 'STUDENTS');

create table public.institution_notices (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,

  /** Who posted it. Kept so a notice is attributable, not anonymous. */
  author_id       uuid not null references public.profiles (id) on delete cascade,

  title           text not null check (length(btrim(title)) between 3 and 200),
  body            text not null check (length(btrim(body)) between 1 and 10000),

  audience        public.notice_audience not null default 'EVERYONE',
  priority        public.notification_priority not null default 'NORMAL',

  /** Unpublished is a draft: the office sees it, nobody else does. */
  is_published    boolean not null default false,
  published_at    timestamptz,

  /** Holds a notice at the top of the board. */
  pinned          boolean not null default false,

  /** Optional. A notice about an event stops being a notice after the event. */
  expires_at      timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  constraint notices_id_institution_uk unique (id, institution_id),
  constraint notices_published_coherent check (
    is_published = false or published_at is not null
  )
);

create index notices_board_idx
  on public.institution_notices (institution_id, pinned desc, published_at desc)
  where is_published and deleted_at is null;

comment on table public.institution_notices is
  'A notice board per institution. One row per notice; the audience column decides who sees it, rather than a copy per recipient.';

create trigger notices_set_updated_at before update on public.institution_notices
  for each row execute function private.set_updated_at();
create trigger notices_freeze_institution before update on public.institution_notices
  for each row execute function private.freeze_institution_id();

/*
 * `published_at` follows `is_published` rather than being asserted by the
 * caller, the same way it does for materials and assessments. A client-supplied
 * "published at" is a claim.
 */
create or replace function private.stamp_notice_publication()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  if not new.is_published then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger notices_stamp_publication
  before insert or update on public.institution_notices
  for each row execute function private.stamp_notice_publication();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.institution_notices enable row level security;

/*
 * `notification.broadcast` already means "send notifications within own
 * institution" and is held by institution administrators alone. A notice is
 * exactly that, so it reuses the permission rather than inventing a parallel
 * one that would have to be kept in step with it.
 */
create policy notices_select on public.institution_notices
  for select to authenticated
  using (
    -- The office that posts them sees everything, drafts included.
    (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('notification.broadcast'))
    )
    -- HQ oversight of what an institution is telling its people.
    or (select private.is_hq())
    -- The audience, once it is published and while it has not expired.
    or (
      is_published
      and deleted_at is null
      and (expires_at is null or expires_at > now())
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (
        audience = 'EVERYONE'
        or (audience = 'TEACHERS' and (select private.auth_role()) = 'TEACHER')
        or (audience = 'STUDENTS' and (select private.auth_role()) = 'STUDENT')
      )
    )
  );

create policy notices_insert on public.institution_notices
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and author_id = (select auth.uid())
    and (select private.has_permission('notification.broadcast'))
  );

create policy notices_update on public.institution_notices
  for update to authenticated
  using (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('notification.broadcast'))
  )
  with check (institution_id = (select private.auth_institution_id()));

create policy notices_delete on public.institution_notices
  for delete to authenticated
  using (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('notification.broadcast'))
  );
