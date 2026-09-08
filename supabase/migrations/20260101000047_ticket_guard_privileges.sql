-- ============================================================================
-- 047 · The ticket guard could not run as the person it was guarding
-- ============================================================================
-- Two failures with one cause: `usage on schema private` is revoked from
-- `authenticated` in migration 001.
--
-- RLS policy expressions are evaluated with the table owner's privileges, so a
-- policy may call `private.*` freely — which is why every policy in this schema
-- does. A TRIGGER function is different: declared `security invoker`, it runs
-- as whoever performed the write. `private.guard_ticket_columns()` called
-- `private.is_hq()` from that position, so a raiser closing their own ticket
-- got "permission denied for schema private" instead of a closed ticket.
--
-- It becomes SECURITY DEFINER, matching `private.enforce_assessment_status()`
-- and the other guards in this schema that consult a private helper.
--
-- `private.owns_ticket()` gets an explicit EXECUTE grant for the same family of
-- reason, following the precedent migration 024 set for
-- `private.oversees_teaching()`: a helper a policy leans on is granted rather
-- than left to depend on how the expression happens to be evaluated.
-- ============================================================================

create or replace function private.guard_ticket_columns()
returns trigger
language plpgsql
-- Was `security invoker`, which could not reach `private.is_hq()`.
security definer
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
  if not private.is_hq() then
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

grant execute on function private.owns_ticket(uuid) to authenticated, service_role;
