-- ============================================================================
-- 027 · The attempt guard was blocking the only legitimate writer
-- ============================================================================
-- Migration 026 gave `assessment_attempts` a trigger that refused any update
-- where `auth.uid()` matched the attempt's student, on the assumption that
-- `auth.uid()` would be null inside a SECURITY DEFINER function.
--
-- It is not. `auth.uid()` reads the request's JWT claim from a GUC; SECURITY
-- DEFINER changes the executing role, not the claim. So when a student
-- submitted their paper, `student_submit_attempt()` — running as DEFINER, on
-- that student's request — tried to write the score and was refused by its own
-- guard. Scoring was impossible for the only person it exists for.
--
-- The student check was belt-and-braces in the first place, and unnecessary:
-- `assessment_attempts` has no INSERT or UPDATE policy for a student at all, so
-- a direct write from a browser is already refused by RLS. (The verification
-- confirms this independently: "a student cannot write their own score" and
-- "a student cannot insert an attempt row directly" both pass without this
-- trigger.)
--
-- What is worth keeping is the immutability of an attempt's identity, which no
-- caller has a reason to rewrite.
-- ============================================================================

create or replace function private.guard_attempt_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * Who may update at all is settled by RLS: students hold no policy on this
   * table, and the teacher policy admits only the owner of the assessment. This
   * trigger's remaining job is narrower — an attempt's identity is fixed once
   * it is created, whoever is asking.
   */
  if new.assessment_id is distinct from old.assessment_id
  or new.student_id    is distinct from old.student_id
  or new.attempt_no    is distinct from old.attempt_no
  or new.started_at    is distinct from old.started_at then
    raise exception 'an attempt''s identity cannot be rewritten' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function private.guard_attempt_columns() is
  'Keeps an attempt''s identity immutable. Who may update at all is decided by RLS, which gives students no policy on this table.';
