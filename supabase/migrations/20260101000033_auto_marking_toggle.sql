-- ============================================================================
-- 033 · Auto marking, on or off
-- ============================================================================
-- Until now the engine marked every objective question the moment a paper was
-- submitted. That is the right default and it is not always what a teacher
-- wants: a paper may be moderated, or marked to a rubric the key only
-- approximates, or simply checked by a person before any mark exists.
--
-- So marking becomes a choice, and OFF means what it says:
--
--   * nothing is finalised. Every answer stays `is_correct = null` with zero
--     marks awarded, whatever the key says.
--   * the attempt goes to the teacher with every question outstanding.
--   * the score stays zero and the result stays withheld until a person has
--     been through it.
--
-- The engine still *computes* what it would have awarded and records it in
-- `suggested_marks`. That is a convenience for the grading screen — a starting
-- number in the input box — and nothing else reads it. It is never added to a
-- score, never shown to a student, and never counts as a mark. Withholding the
-- arithmetic as well as the decision would make a fifty-question paper
-- unmarkable by hand for no gain.
--
-- `awaiting_manual` also changes meaning slightly, and becomes simpler: it is
-- now the count of answers no person has marked, in either mode. Previously it
-- was derived from a list of question types, which was two definitions of the
-- same idea waiting to disagree.
-- ============================================================================

alter table public.assessments
  add column auto_marking boolean not null default true;

comment on column public.assessments.auto_marking is
  'When false, no answer is marked automatically. Every question waits for the teacher, whatever the answer key says.';

alter table public.assessment_answers
  /*
   * What automatic marking *would* have awarded. Advisory only: never summed,
   * never released, never shown to a student. Present so a teacher marking by
   * hand is not made to re-derive what the key already knows.
   */
  add column suggested_marks numeric(6, 2);

comment on column public.assessment_answers.suggested_marks is
  'Advisory. What the engine would have awarded. Not a mark: never summed into a score and never shown to a student.';

-- ── Submitting, in both modes ───────────────────────────────────────────────

create or replace function public.student_submit_attempt(
  target_attempt_id uuid,
  expired           boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt   public.assessment_attempts;
  paper     public.assessments;
  question  public.assessment_questions;
  answer    public.assessment_answers;
  awarded   numeric;
  total     numeric(8, 2) := 0;
  possible  numeric(8, 2) := 0;
  pending   integer := 0;
  late      boolean := false;
  penalty   numeric(8, 2) := 0;
  pct       numeric(5, 2);
  final_status public.attempt_status;
  release   boolean;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and (t.student_id = auth.uid() or expired)
    and t.status = 'IN_PROGRESS'
  for update;

  /*
   * Idempotency. A double-clicked button, a retried request and a client
   * submitting as the timer hits zero all arrive here; the row lock plus this
   * check mean the second one reports the existing outcome rather than scoring
   * the paper twice.
   */
  if attempt.id is null then
    select * into attempt
    from public.assessment_attempts t
    where t.id = target_attempt_id and (t.student_id = auth.uid() or expired);

    if attempt.id is null then
      raise exception 'attempt not found' using errcode = '42501';
    end if;

    return jsonb_build_object(
      'attempt_id', attempt.id,
      'score', attempt.score,
      'max_score', attempt.max_score,
      'percentage', attempt.percentage,
      'awaiting_marking', attempt.awaiting_manual > 0,
      'released', attempt.released_at is not null,
      'is_late', attempt.is_late,
      'already_submitted', true
    );
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  late := paper.closes_at is not null and now() > paper.closes_at;

  for question in
    select q.* from public.assessment_questions q
    where q.id = any(attempt.question_set)
  loop
    possible := possible + question.marks;

    select * into answer
    from public.assessment_answers a
    where a.attempt_id = attempt.id and a.question_id = question.id;

    if answer.id is null then
      insert into public.assessment_answers (
        institution_id, attempt_id, question_id, is_correct, marks_awarded
      )
      values (attempt.institution_id, attempt.id, question.id, null, 0)
      returning * into answer;
    end if;

    awarded := private.mark_answer(question, answer, paper.negative_marking);

    if not paper.auto_marking then
      /*
       * Marking is off. Whatever the key says, nothing is decided here — the
       * computed value is recorded as a suggestion and the question waits for
       * a person.
       */
      pending := pending + 1;
      update public.assessment_answers a
         set is_correct      = null,
             marks_awarded   = 0,
             suggested_marks = case when awarded is null then null else greatest(awarded, 0) end
       where a.id = answer.id;

    elsif awarded is null then
      -- Auto marking is on, but this question needs a person regardless.
      pending := pending + 1;
      update public.assessment_answers a
         set is_correct = null, marks_awarded = 0, suggested_marks = null
       where a.id = answer.id;

    else
      total := total + awarded;
      update public.assessment_answers a
         set is_correct      = (awarded >= question.marks and question.marks > 0),
             marks_awarded   = greatest(awarded, 0),
             suggested_marks = null
       where a.id = answer.id;
    end if;
  end loop;

  -- Negative marking can drive a paper below zero; a negative total is not a
  -- meaningful score, so it floors at nothing.
  total := greatest(total, 0);

  if late and paper.late_penalty_percent > 0 then
    penalty := round(total * paper.late_penalty_percent / 100, 2);
    total := greatest(total - penalty, 0);
  end if;

  pct := case when possible > 0 then round(total * 100 / possible, 2) else 0 end;

  final_status := case
    when pending > 0 then 'SUBMITTED'::public.attempt_status
    when expired then 'EXPIRED'::public.attempt_status
    else 'GRADED'::public.attempt_status
  end;

  /*
   * Nothing is released while anything is outstanding — which, with marking
   * off, is always the case at submission. A score of zero shown to a student
   * because nobody has marked their paper yet would be worse than silence.
   */
  release := case paper.release_policy
    when 'IMMEDIATE' then pending = 0
    when 'AFTER_GRADING' then pending = 0
    when 'AFTER_CLOSE' then pending = 0 and paper.closes_at is not null and now() > paper.closes_at
    else false
  end;

  update public.assessment_attempts t set
    status          = final_status,
    submitted_at    = now(),
    score           = total,
    max_score       = possible,
    percentage      = pct,
    passed          = case
                        when pending > 0 then null
                        when paper.pass_marks is null then null
                        else total >= paper.pass_marks
                      end,
    awaiting_manual = pending,
    is_late         = late,
    penalty_applied = penalty,
    released_at     = case when release then now() else null end
  where t.id = attempt.id;

  if expired then
    insert into public.assessment_integrity_events (institution_id, attempt_id, event)
    values (attempt.institution_id, attempt.id, 'TIME_EXPIRED');
  end if;

  return jsonb_build_object(
    'attempt_id', attempt.id,
    'score', total,
    'max_score', possible,
    'percentage', pct,
    'awaiting_marking', pending > 0,
    'auto_marking', paper.auto_marking,
    'released', release,
    'is_late', late,
    'already_submitted', false
  );
end;
$$;

-- ── Marking by a person, in both modes ──────────────────────────────────────

create or replace function public.teacher_grade_answer(
  target_answer_id uuid,
  awarded          numeric,
  comment          text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  answer    public.assessment_answers;
  attempt   public.assessment_attempts;
  paper     public.assessments;
  question  public.assessment_questions;
  total     numeric(8, 2);
  remaining integer;
  was_score numeric(8, 2);
  release   boolean;
begin
  select * into answer from public.assessment_answers a where a.id = target_answer_id;
  if answer.id is null then
    raise exception 'answer not found' using errcode = '42501';
  end if;

  select * into attempt
  from public.assessment_attempts t where t.id = answer.attempt_id for update;

  if not private.owns_assessment(attempt.assessment_id) then
    raise exception 'not your assessment' using errcode = '42501';
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;
  select * into question
  from public.assessment_questions q where q.id = answer.question_id;

  if awarded < 0 or awarded > question.marks then
    raise exception 'mark must be between 0 and %', question.marks using errcode = '22023';
  end if;

  was_score := attempt.score;

  update public.assessment_answers a set
    marks_awarded   = awarded,
    is_correct      = (awarded >= question.marks),
    suggested_marks = null,
    feedback        = nullif(btrim(coalesce(comment, '')), ''),
    graded_by       = auth.uid(),
    graded_at       = now()
  where a.id = target_answer_id;

  select coalesce(sum(a.marks_awarded), 0) into total
  from public.assessment_answers a where a.attempt_id = attempt.id;

  /*
   * Outstanding work is now simply "answers nobody has marked", which is right
   * in both modes — with auto marking off that is every question, and with it
   * on it is the subjective ones. The previous version derived this from a list
   * of question types, which could not express the off case at all.
   */
  select count(*) into remaining
  from public.assessment_answers a
  where a.attempt_id = attempt.id and a.is_correct is null;

  release := attempt.released_at is not null
    or (paper.release_policy in ('IMMEDIATE', 'AFTER_GRADING') and remaining = 0);

  update public.assessment_attempts t set
    score           = total,
    percentage      = case when t.max_score > 0 then round(total * 100 / t.max_score, 2) else 0 end,
    passed          = case
                        when remaining > 0 then null
                        when paper.pass_marks is null then null
                        else total >= paper.pass_marks
                      end,
    awaiting_manual = remaining,
    status          = case when remaining = 0 then 'GRADED'::public.attempt_status else t.status end,
    released_at     = case when release then coalesce(t.released_at, now()) else t.released_at end
  where t.id = attempt.id;

  -- A result the student has already seen is never silently rewritten.
  if attempt.released_at is not null and total is distinct from was_score then
    insert into public.assessment_grade_revisions (
      institution_id, attempt_id, previous_score, new_score, reason, revised_by
    )
    values (
      attempt.institution_id, attempt.id, was_score, total,
      'Manual grading after release', auth.uid()
    );
  end if;

  return jsonb_build_object('score', total, 'awaiting', remaining, 'released', release);
end;
$$;

grant execute on function public.student_submit_attempt(uuid, boolean)
  to authenticated, service_role;
grant execute on function public.teacher_grade_answer(uuid, numeric, text)
  to authenticated, service_role;
