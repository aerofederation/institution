-- ============================================================================
-- 026 · Two defects found by running the thing
-- ============================================================================
-- 1. `student_submit_attempt()` and `teacher_grade_answer()` assign a CASE
--    expression to `assessment_attempts.status`. PostgreSQL types an untyped
--    literal in a CASE as `text`, so the assignment fails at *execution* with
--    "column status is of type public.attempt_status but expression is of type
--    text". The function created cleanly, because plpgsql does not type-check a
--    body at CREATE time — exactly the defect migration 017 fixed for
--    `application_status`, in a function written the same way.
--
-- 2. The column guards added in migration 025 were SECURITY INVOKER. Migration
--    001 revokes USAGE on schema `private` from `authenticated`, so the moment a
--    teacher tried to mark anything the trigger raised "permission denied for
--    schema private". The intent behind INVOKER was that the guard should hold
--    no authority of its own; the effect was that it could not run.
--
--    DEFINER is correct here and safe. `auth.uid()` reads the request's JWT
--    claim rather than the executing role, so it still identifies the caller —
--    and the guard reads nothing beyond the row already being written and the
--    ownership predicate. What must NOT be used inside a DEFINER function is
--    `current_user`, which becomes the owner; none of these do.
-- ============================================================================

create or replace function public.student_submit_attempt(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt       public.assessment_attempts;
  question      record;
  correct_ids   uuid[];
  chosen_ids    uuid[];
  awarded       numeric(6, 2);
  correct       boolean;
  total         numeric(8, 2) := 0;
  possible      numeric(8, 2) := 0;
  needs_marking boolean := false;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and (t.student_id = auth.uid() or auth.uid() is null)
    and t.status = 'IN_PROGRESS';

  if attempt.id is null then
    raise exception 'no attempt in progress' using errcode = '42501';
  end if;

  for question in
    select q.id, q.question_type, q.marks
    from public.assessment_questions q
    where q.assessment_id = attempt.assessment_id
  loop
    possible := possible + question.marks;

    select coalesce(array_agg(o.id order by o.id), '{}')
      into correct_ids
    from public.assessment_options o
    where o.question_id = question.id and o.is_correct;

    select coalesce(array_agg(x order by x), '{}')
      into chosen_ids
    from (
      select unnest(a.selected_option_ids) as x
      from public.assessment_answers a
      where a.attempt_id = attempt.id and a.question_id = question.id
    ) as chosen;

    if question.question_type = 'SHORT_ANSWER' then
      -- Free text is not guessed at. It is left unmarked and the attempt stays
      -- SUBMITTED until a person reads it: a wrong automatic zero is worse than
      -- an honest "not marked yet".
      needs_marking := true;
      correct := null;
      awarded := 0;
    else
      -- Exact set match, so a partially correct multi-choice earns nothing
      -- rather than silently awarding a mark the teacher did not intend.
      correct := (correct_ids = chosen_ids) and array_length(correct_ids, 1) is not null;
      awarded := case when correct then question.marks else 0 end;
    end if;

    total := total + awarded;

    insert into public.assessment_answers (
      institution_id, attempt_id, question_id, selected_option_ids, is_correct, marks_awarded
    )
    values (attempt.institution_id, attempt.id, question.id, chosen_ids, correct, awarded)
    on conflict (attempt_id, question_id) do update
      set is_correct    = excluded.is_correct,
          marks_awarded = excluded.marks_awarded;
  end loop;

  update public.assessment_attempts t set
    -- Cast explicitly. Without it both branches are `text` and the assignment
    -- fails at runtime against the enum column.
    status       = case
                     when needs_marking then 'SUBMITTED'::public.attempt_status
                     else 'GRADED'::public.attempt_status
                   end,
    submitted_at = now(),
    score        = total,
    max_score    = possible
  where t.id = attempt.id;

  return jsonb_build_object(
    'attempt_id', attempt.id,
    'score', total,
    'max_score', possible,
    'awaiting_marking', needs_marking
  );
end;
$$;

create or replace function public.teacher_grade_answer(
  target_answer_id uuid,
  awarded          numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer    public.assessment_answers;
  attempt   public.assessment_attempts;
  question  public.assessment_questions;
  total     numeric(8, 2);
  remaining integer;
begin
  select * into answer from public.assessment_answers a where a.id = target_answer_id;
  if answer.id is null then
    raise exception 'answer not found' using errcode = '42501';
  end if;

  select * into attempt
  from public.assessment_attempts t where t.id = answer.attempt_id;

  if not private.owns_assessment(attempt.assessment_id) then
    raise exception 'not your assessment' using errcode = '42501';
  end if;

  select * into question
  from public.assessment_questions q where q.id = answer.question_id;

  if awarded < 0 or awarded > question.marks then
    raise exception 'mark must be between 0 and %', question.marks using errcode = '22023';
  end if;

  update public.assessment_answers a set
    marks_awarded = awarded,
    is_correct    = (awarded >= question.marks)
  where a.id = target_answer_id;

  select coalesce(sum(a.marks_awarded), 0) into total
  from public.assessment_answers a where a.attempt_id = attempt.id;

  select count(*) into remaining
  from public.assessment_answers a
  join public.assessment_questions q on q.id = a.question_id
  where a.attempt_id = attempt.id
    and q.question_type = 'SHORT_ANSWER'
    and a.is_correct is null;

  update public.assessment_attempts t set
    score  = total,
    status = case
               when remaining = 0 then 'GRADED'::public.attempt_status
               else 'SUBMITTED'::public.attempt_status
             end
  where t.id = attempt.id;

  return jsonb_build_object('score', total, 'awaiting', remaining);
end;
$$;

-- ── The column guards, now able to run ──────────────────────────────────────

create or replace function private.guard_submission_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  acting_student boolean := (new.student_id = (select auth.uid()));
  acting_teacher boolean := private.owns_assignment(new.assignment_id);
begin
  if acting_student and not acting_teacher then
    if new.marks     is distinct from old.marks
    or new.feedback  is distinct from old.feedback
    or new.graded_by is distinct from old.graded_by
    or new.graded_at is distinct from old.graded_at then
      raise exception 'a student cannot set their own mark or feedback'
        using errcode = '42501';
    end if;

    if new.status is distinct from old.status
       and new.status not in ('DRAFT', 'SUBMITTED', 'LATE') then
      raise exception 'a student cannot set that status' using errcode = '42501';
    end if;

    if old.status = 'GRADED' then
      raise exception 'this work has been marked and can no longer be changed'
        using errcode = '42501';
    end if;
  end if;

  if acting_teacher and not acting_student then
    if new.response_text is distinct from old.response_text
    or new.storage_path  is distinct from old.storage_path
    or new.file_name     is distinct from old.file_name then
      raise exception 'a teacher cannot edit a student''s submitted work'
        using errcode = '42501';
    end if;

    if new.marks is distinct from old.marks
       and new.graded_by is distinct from (select auth.uid()) then
      raise exception 'a mark must be attributed to the teacher awarding it'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.guard_attempt_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  /*
   * The service role legitimately writes attempts — `student_submit_attempt()`
   * runs as DEFINER and updates the score. `auth.uid()` is null in that context,
   * so the student check below cannot fire on it.
   */
  if auth.uid() is not null and new.student_id = (select auth.uid()) then
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
