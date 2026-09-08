-- ============================================================================
-- 032 · Writing `is_published` must not silently do nothing
-- ============================================================================
-- Migration 029 made `is_published` a derived column: the trigger recomputes it
-- from `status` on every write. That kept the RLS in 021 working unchanged,
-- which was the goal — and quietly broke every caller that published a paper
-- the old way, by setting `is_published` directly.
--
-- The update succeeded, returned a row, and had no effect. Nothing errored.
-- `verify:teaching` caught it as "the addressed student does receive the paper"
-- failing, four steps downstream of the actual cause.
--
-- Two fixes, and both are wanted:
--
--   * the application now sets `status`, which is the real state; and
--   * a write to `is_published` alone is honoured here rather than discarded,
--     so no caller can be silently ignored again.
--
-- The second is a compatibility shim, not a second way to publish. It maps the
-- boolean onto the state machine and lets the machine decide — an illegal
-- transition still raises.
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

  if not new.is_published then
    new.published_at := null;
  end if;

  return new;
end;
$$;

comment on function private.enforce_assessment_status() is
  'Keeps status and is_published in agreement, and honours a write to either. Illegal transitions raise 23514; a paper somebody has started cannot go back to draft.';
