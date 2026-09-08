-- ============================================================================
-- 048 · The ticket guard was blocking the ticket's own triggers
-- ============================================================================
-- `private.touch_ticket()` runs after a reply and moves the ticket along: a
-- raiser writing back reopens a resolved ticket, HQ answering an OPEN one puts
-- it IN_PROGRESS. That is an UPDATE on `support_tickets`, which fires
-- `private.guard_ticket_columns()`, which asks "is the person doing this HQ?"
-- and refuses a status change if not.
--
-- So the system's own transition was refused as though a raiser had attempted
-- it, and every reply failed with "you may close your ticket, but not set its
-- state". The guard was right about the rule and wrong about who was asking.
--
-- The two are now distinguished by a transaction-local flag that only
-- `touch_ticket` sets. It is set immediately before its update and cleared
-- immediately after, so it cannot be left standing for the rest of a
-- transaction and used to slip a hand-written update past the guard. `true` as
-- the third argument to `set_config` makes it local to the transaction as well,
-- so it cannot outlive the statement that set it even if something raises.
-- ============================================================================

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

  -- Tells `guard_ticket_columns` that this update is the trigger's, not a
  -- person's. Transaction-local, and cleared again below.
  perform set_config('afi.ticket_system_update', 'on', true);

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

  perform set_config('afi.ticket_system_update', 'off', true);

  return new;
end;
$$;

create or replace function private.guard_ticket_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * The original report is immutable for everybody, including HQ and including
   * the triggers. Nothing legitimately rewrites what somebody said happened.
   */
  if new.raised_by is distinct from old.raised_by
  or new.raised_as is distinct from old.raised_as
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
     and not private.is_hq() then
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
