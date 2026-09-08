-- ============================================================================
-- 039 · Archiving must not erase the fact that a paper was published
-- ============================================================================
-- `private.enforce_assessment_status()` derives `is_published` from `status`,
-- then clears `published_at` whenever the derived flag comes out false:
--
--     if not new.is_published then
--       new.published_at := null;
--     end if;
--
-- ARCHIVED is not in the published set, so archiving a paper that had been
-- published to a class silently destroyed the record of when that happened.
-- Migration 028 describes ARCHIVED as "retained for the record, out of the
-- way" — the record is precisely what was being thrown away.
--
-- Returning to DRAFT is a genuine un-publish and still clears the timestamp:
-- the paper is being taken back and reworked, and republishing sets it afresh.
-- Archiving is filing something away, and a filed paper keeps its history.
--
-- `is_published` is unchanged. An archived paper is still hidden from students,
-- which is what archiving is for.
-- ============================================================================

create or replace function private.enforce_assessment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  intended public.assessment_status := new.status;
begin
  /*
   * A caller that changed `is_published` but not `status` means to publish or
   * unpublish. Translate that into the state machine rather than overwriting
   * their intent — which is what this trigger did before, turning a deliberate
   * publish into a no-op.
   */
  if new.is_published is distinct from old.is_published
     and new.status is not distinct from old.status then
    if new.is_published then
      intended := case
        when old.status = 'DRAFT' then 'PUBLISHED'::public.assessment_status
        else old.status
      end;
    else
      intended := 'DRAFT'::public.assessment_status;
    end if;
  end if;

  new.status := intended;

  if new.status is distinct from old.status then
    if not private.assessment_transition_allowed(old.status, new.status) then
      raise exception 'cannot move an assessment from % to %', old.status, new.status
        using errcode = '23514';
    end if;

    -- Editing underneath somebody mid-attempt is what versioning exists to
    -- prevent, and the cheapest place to prevent it is here.
    if new.status = 'DRAFT' and old.status <> 'ARCHIVED' and exists (
      select 1 from public.assessment_attempts t where t.assessment_id = new.id
    ) then
      raise exception 'this paper has been started by a student and cannot return to draft'
        using errcode = '23514';
    end if;

    if new.status = 'ARCHIVED' and new.archived_at is null then
      new.archived_at := now();
    end if;
  end if;

  -- `is_published` is derived, always, from whatever status we settled on.
  new.is_published := new.status in
    ('SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'GRADING', 'COMPLETED');

  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;

  -- Only a return to DRAFT is an un-publish. Archiving keeps the record.
  if new.status = 'DRAFT' then
    new.published_at := null;
  end if;

  return new;
end;
$$;

comment on function private.enforce_assessment_status() is
  'Keeps status and is_published in agreement, and honours a write to either. Illegal transitions raise 23514; a paper somebody has started cannot go back to draft; archiving preserves published_at.';
