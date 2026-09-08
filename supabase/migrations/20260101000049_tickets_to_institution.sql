-- ============================================================================
-- 049 · A ticket can be addressed to the institution instead of HQ
-- ============================================================================
-- Most of what a teacher or student needs is their own institution's to fix: a
-- wrong roll number, a class they were not enrolled into, a timetable clash.
-- Sending those to HQ makes HQ a relay for work it cannot do.
--
-- So a ticket now names its audience, and routing is strict: a ticket goes to
-- exactly the one it was addressed to.
--
-- Read that carefully, because it is what protects the existing guarantee.
-- Migration 046 established that an institution's administrators cannot read
-- their own members' tickets — the property that lets somebody report a problem
-- WITH their institution. Widening the policy to "administrators see their
-- tenant's tickets" would have destroyed it silently.
--
-- Instead an administrator sees only tickets addressed to the institution. One
-- addressed to HQ stays invisible to them, exactly as before. The person
-- raising it chooses who reads it, and the choice is enforced rather than
-- advisory.
--
-- HQ likewise sees only HQ-directed tickets here. HQ oversight of an
-- institution runs through the audit log and the institution record; it does
-- not extend to reading a conversation somebody addressed to their own office.
-- ============================================================================

create type public.ticket_audience as enum ('HQ', 'INSTITUTION');

alter table public.support_tickets
  add column raised_to public.ticket_audience not null default 'HQ';

comment on column public.support_tickets.raised_to is
  'Who the ticket was addressed to. Decides who may read it: HQ, or the institution''s own administrators — never both.';

/*
 * An institution administrator raises to HQ and nowhere else: they are the
 * institution, so a ticket from them to themselves is not a thing. Enforced
 * rather than left to the form.
 */
alter table public.support_tickets
  add constraint tickets_audience_coherent check (
    raised_as <> 'INSTITUTION_ADMIN' or raised_to = 'HQ'
  );

create index tickets_institution_queue_idx
  on public.support_tickets (institution_id, status, created_at desc)
  where raised_to = 'INSTITUTION';

-- ── Who may answer a ticket ─────────────────────────────────────────────────

insert into public.permissions (code, resource, action, scope, description)
values ('support.resolve', 'support', 'resolve', 'TENANT',
        'Answer support tickets raised to this institution')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
values ('INSTITUTION_ADMIN', 'support.resolve')
on conflict do nothing;

/*
 * The handler test, in one place. Both the ticket policies and the message
 * policies use it, so "who answers this" cannot drift between them — and the
 * triage guard uses it too, so the UI and the database agree on who may change
 * a status.
 */
create or replace function private.can_handle_ticket(target_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.support_tickets t
    where t.id = target_ticket_id
      and (
        (t.raised_to = 'HQ' and private.is_hq())
        or (
          t.raised_to = 'INSTITUTION'
          and private.is_active()
          and t.institution_id = private.auth_institution_id()
          and private.has_permission('support.resolve')
        )
      )
  );
$$;

comment on function private.can_handle_ticket(uuid) is
  'Whether the caller is the audience a ticket was addressed to. HQ for HQ tickets; an institution administrator for that institution''s own.';

grant execute on function private.can_handle_ticket(uuid) to authenticated, service_role;

-- ── Policies ────────────────────────────────────────────────────────────────

drop policy if exists tickets_select on public.support_tickets;

create policy tickets_select on public.support_tickets
  for select to authenticated
  using (
    raised_by = (select auth.uid())
    -- Addressed to HQ.
    or (raised_to = 'HQ' and (select private.is_hq()))
    -- Addressed to the institution, read by that institution's own office.
    or (
      raised_to = 'INSTITUTION'
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('support.resolve'))
    )
  );

drop policy if exists tickets_update on public.support_tickets;

create policy tickets_update on public.support_tickets
  for update to authenticated
  using (
    (select private.can_handle_ticket(id))
    or (raised_by = (select auth.uid()) and (select private.is_active()))
  )
  with check (
    (select private.can_handle_ticket(id))
    or raised_by = (select auth.uid())
  );

drop policy if exists ticket_messages_select on public.support_ticket_messages;

create policy ticket_messages_select on public.support_ticket_messages
  for select to authenticated
  using (
    (select private.can_handle_ticket(ticket_id))
    or (not is_internal and (select private.owns_ticket(ticket_id)))
  );

drop policy if exists ticket_messages_insert on public.support_ticket_messages;

create policy ticket_messages_insert on public.support_ticket_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (select private.can_handle_ticket(ticket_id))
      or (
        (select private.is_active())
        and not is_internal          -- only the handler writes internal notes
        and (select private.owns_ticket(ticket_id))
      )
    )
  );

-- ── The triage guard now knows about both audiences ─────────────────────────

create or replace function private.guard_ticket_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * The original report is immutable for everybody, including the handler and
   * including the triggers. Nothing legitimately rewrites what somebody said
   * happened — and `raised_to` joins that list, because moving a ticket from
   * one audience to another would hand it to readers the raiser never chose.
   */
  if new.raised_by is distinct from old.raised_by
  or new.raised_as is distinct from old.raised_as
  or new.raised_to is distinct from old.raised_to
  or new.reference is distinct from old.reference
  or new.subject  is distinct from old.subject
  or new.body     is distinct from old.body
  or new.created_at is distinct from old.created_at then
    raise exception 'a ticket''s original report cannot be rewritten'
      using errcode = '42501';
  end if;

  /*
   * Role restrictions apply to people, not to `touch_ticket`. Without this the
   * ticket's own reply trigger is refused as though the raiser had tried to set
   * the state by hand.
   */
  if coalesce(current_setting('afi.ticket_system_update', true), 'off') <> 'on'
     and not private.can_handle_ticket(new.id) then
    if new.priority    is distinct from old.priority
    or new.category    is distinct from old.category
    or new.assigned_to is distinct from old.assigned_to then
      raise exception 'only the office this was addressed to may triage it'
        using errcode = '42501';
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
