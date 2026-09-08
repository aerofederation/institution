-- ============================================================================
-- 025 · A student cannot mark their own work
-- ============================================================================
-- `assignment_submissions` is the one row two different people write to for two
-- different reasons: the student edits their response, the teacher records a
-- mark. Migration 021 expressed that as a single UPDATE policy admitting both,
-- with only the tenant pinned in WITH CHECK.
--
-- That was wrong, and demonstrably so: signed in as a student, `update
-- assignment_submissions set marks = 20` succeeded on their own row. RLS is
-- row-level — a policy can say *which rows* a caller may update, never *which
-- columns* — so "the student may update their own submission" necessarily
-- included the mark.
--
-- Column privileges cannot fix it either: both parties arrive as
-- `authenticated`, so revoking UPDATE on `marks` would stop teachers grading.
--
-- The distinction is between *who is acting*, which only a trigger can see. So
-- the policy still decides which rows are reachable, and this trigger decides
-- which columns each party may have changed on the way through.
-- ============================================================================

create or replace function private.guard_submission_columns()
returns trigger
language plpgsql
-- SECURITY INVOKER, and it matters: under DEFINER, `auth.uid()` still resolves
-- to the caller, but keeping this INVOKER means the function holds no authority
-- of its own. It reads nothing the caller could not read.
security invoker
set search_path = ''
as $$
declare
  acting_student boolean := (new.student_id = (select auth.uid()));
  acting_teacher boolean := private.owns_assignment(new.assignment_id);
begin
  /*
   * The student who owns the row. They may rewrite their response and resubmit;
   * they may not touch anything that represents a judgement about it.
   */
  if acting_student and not acting_teacher then
    if new.marks     is distinct from old.marks
    or new.feedback  is distinct from old.feedback
    or new.graded_by is distinct from old.graded_by
    or new.graded_at is distinct from old.graded_at then
      raise exception 'a student cannot set their own mark or feedback'
        using errcode = '42501';
    end if;

    -- Nor may they declare their own work graded, or move it to a status the
    -- teacher owns.
    if new.status is distinct from old.status
       and new.status not in ('DRAFT', 'SUBMITTED', 'LATE') then
      raise exception 'a student cannot set that status' using errcode = '42501';
    end if;

    -- Work already marked is closed. Editing it afterwards would leave a mark
    -- attached to an answer the teacher never saw.
    if old.status = 'GRADED' then
      raise exception 'this work has been marked and can no longer be changed'
        using errcode = '42501';
    end if;
  end if;

  /*
   * The teacher who set the assignment. They mark and give feedback; they do
   * not edit the student's answer. Rewriting a submission and then marking it
   * would leave no record that the words were not the student's.
   */
  if acting_teacher and not acting_student then
    if new.response_text is distinct from old.response_text
    or new.storage_path  is distinct from old.storage_path
    or new.file_name     is distinct from old.file_name then
      raise exception 'a teacher cannot edit a student''s submitted work'
        using errcode = '42501';
    end if;

    -- The mark is attributed to whoever actually gave it.
    if new.marks is distinct from old.marks and new.graded_by is distinct from (select auth.uid()) then
      raise exception 'a mark must be attributed to the teacher awarding it'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

comment on function private.guard_submission_columns() is
  'Column-level authorship guard for assignment_submissions: students own the response, teachers own the mark. RLS cannot express this because it is row-level.';

drop trigger if exists submissions_guard_columns on public.assignment_submissions;
create trigger submissions_guard_columns
  before update on public.assignment_submissions
  for each row execute function private.guard_submission_columns();

-- ── The same reasoning for attempts and answers ─────────────────────────────
/*
 * `assessment_attempts` has a teacher UPDATE policy so a paper's owner can
 * intervene. Nothing should let them rewrite a score by hand except through
 * `teacher_grade_answer()`, which recomputes it from the marks actually
 * awarded — but the policy alone would permit it, so the same shape applies:
 * the student side is closed entirely (they have no UPDATE policy) and the
 * teacher side is limited to the columns marking legitimately touches.
 */
create or replace function private.guard_attempt_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- A student has no UPDATE policy on this table at all; this is belt and
  -- braces in case one is ever added.
  if new.student_id = (select auth.uid()) then
    raise exception 'an attempt cannot be altered by the student sitting it'
      using errcode = '42501';
  end if;

  if new.assessment_id is distinct from old.assessment_id
  or new.student_id    is distinct from old.student_id
  or new.attempt_no    is distinct from old.attempt_no
  or new.started_at    is distinct from old.started_at then
    raise exception 'an attempt''s identity cannot be rewritten' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists attempts_guard_columns on public.assessment_attempts;
create trigger attempts_guard_columns
  before update on public.assessment_attempts
  for each row execute function private.guard_attempt_columns();
