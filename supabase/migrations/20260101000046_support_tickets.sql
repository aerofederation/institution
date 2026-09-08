-- ============================================================================
-- 046 · Support tickets raised to HQ
-- ============================================================================
-- An institution administrator, a teacher or a student raises a query; HQ
-- answers it. One thread per ticket, with a reply trail.
--
-- The load-bearing decision is who else can read it: nobody. A ticket is
-- between the person who raised it and HQ. In particular an institution
-- administrator does NOT see their own teachers' or students' tickets.
--
-- That is deliberate and it is the whole point. A student reporting that their
-- marks were entered wrong, or a teacher reporting that their institution is
-- doing something improper, has to be able to reach HQ without the people they
-- are reporting on reading it first. A support channel the subject of the
-- complaint can read is not a support channel.
--
-- `institution_id` is still recorded, because HQ needs to know which
-- institution a query concerns in order to act on it. Recording which tenant a
-- ticket came from is not the same as letting that tenant read it.
-- ============================================================================

create type public.ticket_category as enum (
  'ACCOUNT_ACCESS',     -- cannot sign in, activation, password
  'ACADEMIC',           -- classes, subjects, enrolment, results
  'TECHNICAL',          -- something is broken
  'BILLING',
  'DATA_CORRECTION',    -- something recorded about me is wrong
  'COMPLAINT',
  'OTHER'
);

create type public.ticket_priority as enum ('LOW', 'NORMAL', 'HIGH', 'URGENT');

create type public.ticket_status as enum (
  'OPEN',            -- raised, nobody has picked it up
  'IN_PROGRESS',     -- HQ is working on it
  'WAITING_ON_USER', -- HQ has asked a question back
  'RESOLVED',        -- HQ believes it is done
  'CLOSED'           -- finished, no further replies
);

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),

  /*
   * Human-readable and random rather than sequential, so a reference quoted in
   * an email cannot be used to guess another one. Same generator as the
   * institution application references.
   */
  reference       text not null unique default private.generate_application_ref(),

  /*
   * Which institution the query concerns. Not null: every person who can raise
   * a ticket belongs to one, and HQ needs it to route the work. It is frozen
   * after insert by the trigger below.
   */
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  raised_by       uuid not null references public.profiles (id) on delete cascade,

  /*
   * The raiser's role at the moment they raised it. A snapshot, because a
   * teacher who later becomes an administrator should not retroactively change
   * what the ticket says about who reported it.
   */
  raised_as       text not null check (raised_as in ('INSTITUTION_ADMIN', 'TEACHER', 'STUDENT')),

  category        public.ticket_category not null default 'OTHER',
  priority        public.ticket_priority not null default 'NORMAL',
  status          public.ticket_status not null default 'OPEN',

  subject         text not null check (length(btrim(subject)) between 5 and 200),
  body            text not null check (length(btrim(body)) between 20 and 8000),

  /** The HQ administrator who picked it up. */
  assigned_to     uuid references public.profiles (id) on delete set null,

  /** Maintained by a trigger from the messages, so a list can sort by activity. */
  last_reply_at   timestamptz,
  last_reply_by   uuid,

  resolved_at     timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint tickets_id_institution_uk unique (id, institution_id),
  constraint tickets_resolved_coherent check (
    (status in ('RESOLVED', 'CLOSED')) = (resolved_at is not null)
  )
);

create index tickets_raiser_idx on public.support_tickets (raised_by, created_at desc);
create index tickets_queue_idx on public.support_tickets (status, priority, created_at)
  where status in ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER');
create index tickets_institution_idx on public.support_tickets (institution_id, created_at desc);

comment on table public.support_tickets is
  'A query raised to HQ by one member of an institution. Readable by that person and HQ only — never by their institution''s administrators.';

-- ── The reply trail ─────────────────────────────────────────────────────────

create table public.support_ticket_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,

  body        text not null check (length(btrim(body)) between 1 and 8000),

  /*
   * An HQ-only note. Not a hidden column — a hidden row: RLS cannot withhold a
   * column, so an internal note is a row the raiser's SELECT policy does not
   * return at all.
   */
  is_internal boolean not null default false,

  created_at  timestamptz not null default now()
);

create index ticket_messages_idx on public.support_ticket_messages (ticket_id, created_at);

comment on column public.support_ticket_messages.is_internal is
  'HQ-only note. Enforced as a row the raiser cannot select, because RLS cannot hide a column.';

-- ── Guards ──────────────────────────────────────────────────────────────────

create trigger tickets_set_updated_at before update on public.support_tickets
  for each row execute function private.set_updated_at();
create trigger tickets_freeze_institution before update on public.support_tickets
  for each row execute function private.freeze_institution_id();

/*
 * What the raiser may change after the fact: nothing.
 *
 * They hold an UPDATE policy only so they can close their own ticket. Every
 * other column is refused here, so a raiser cannot re-prioritise their own
 * query to URGENT after HQ triaged it, reassign it, or rewrite what they
 * originally reported.
 */
create or replace function private.guard_ticket_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.raised_by is distinct from old.raised_by
  or new.raised_as is distinct from old.raised_as
  or new.reference is distinct from old.reference
  or new.subject  is distinct from old.subject
  or new.body     is distinct from old.body
  or new.created_at is distinct from old.created_at then
    raise exception 'a ticket''s original report cannot be rewritten'
      using errcode = '42501';
  end if;

  -- HQ triages. The raiser may only close.
  if not (select private.is_hq()) then
    if new.priority    is distinct from old.priority
    or new.category    is distinct from old.category
    or new.assigned_to is distinct from old.assigned_to then
      raise exception 'only HQ may triage a ticket' using errcode = '42501';
    end if;

    if new.status is distinct from old.status and new.status <> 'CLOSED' then
      raise exception 'you may close your ticket, but not set its state'
        using errcode = '42501';
    end if;
  end if;

  -- Timestamps follow the status rather than being asserted.
  if new.status in ('RESOLVED', 'CLOSED') and new.resolved_at is null then
    new.resolved_at := now();
  end if;
  if new.status not in ('RESOLVED', 'CLOSED') then
    new.resolved_at := null;
    new.closed_at := null;
  end if;
  if new.status = 'CLOSED' and new.closed_at is null then
    new.closed_at := now();
  end if;

  return new;
end;
$$;

create trigger tickets_guard_columns before update on public.support_tickets
  for each row execute function private.guard_ticket_columns();

/*
 * A reply moves the ticket along, so the list can be sorted by real activity
 * rather than by when somebody first wrote in. SECURITY DEFINER because
 * neither party holds a general UPDATE on the ticket for these columns.
 *
 * An HQ reply also puts the ticket back in front of the person waiting: a
 * ticket marked RESOLVED that the raiser then replies to is open again.
 */
create or replace function private.touch_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  raiser uuid;
begin
  select t.raised_by into raiser from public.support_tickets t where t.id = new.ticket_id;

  update public.support_tickets
  set last_reply_at = new.created_at,
      last_reply_by = new.author_id,
      status = case
        -- The raiser writing back reopens a resolved ticket.
        when new.author_id = raiser and status in ('RESOLVED', 'WAITING_ON_USER')
          then 'IN_PROGRESS'::public.ticket_status
        -- HQ answering puts the ball in the raiser's court.
        when new.author_id <> raiser and not new.is_internal and status = 'OPEN'
          then 'IN_PROGRESS'::public.ticket_status
        else status
      end,
      resolved_at = case
        when new.author_id = raiser and status in ('RESOLVED', 'WAITING_ON_USER') then null
        else resolved_at
      end
  where id = new.ticket_id
    -- A closed ticket is finished; a reply does not resurrect it.
    and status <> 'CLOSED';

  return new;
end;
$$;

create trigger ticket_messages_touch after insert on public.support_ticket_messages
  for each row execute function private.touch_ticket();

-- ── Who is in this conversation? ────────────────────────────────────────────

create or replace function private.owns_ticket(target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.support_tickets t
    where t.id = target_ticket_id and t.raised_by = (select auth.uid())
  );
$$;

comment on function private.owns_ticket(uuid) is
  'Whether the caller raised this ticket. Used by the message policies so they do not depend on the ticket SELECT policy.';

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.support_tickets          enable row level security;
alter table public.support_ticket_messages  enable row level security;

/*
 * Note what is absent: any branch for `teaching.read_all`, for an institution
 * administrator, or for `private.oversees_teaching()`. Those appear on every
 * other tenant table in this schema. Here their absence is the feature.
 */
create policy tickets_select on public.support_tickets
  for select to authenticated
  using (
    raised_by = (select auth.uid())
    or (select private.is_hq())
  );

create policy tickets_insert on public.support_tickets
  for insert to authenticated
  with check (
    (select private.is_active())
    and raised_by = (select auth.uid())
    and institution_id = (select private.auth_institution_id())
    -- HQ has no institution and answers tickets rather than raising them.
    and not (select private.is_hq())
  );

create policy tickets_update on public.support_tickets
  for update to authenticated
  using (
    (select private.is_hq())
    or (raised_by = (select auth.uid()) and (select private.is_active()))
  )
  with check (
    (select private.is_hq())
    or raised_by = (select auth.uid())
  );

-- No DELETE policy at all. A support record is not something either side
-- removes; closing is what "done" looks like.

create policy ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    (select private.is_hq())
    or (not is_internal and (select private.owns_ticket(ticket_id)))
  );

create policy ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select private.is_hq())
      or (
        (select private.is_active())
        and not is_internal          -- only HQ writes internal notes
        and (select private.owns_ticket(ticket_id))
      )
    )
  );

-- A sent reply is a record, like a message in a conversation.
