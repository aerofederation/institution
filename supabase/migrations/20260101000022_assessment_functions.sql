-- ============================================================================
-- 022 · Sitting and marking an assessment
-- ============================================================================
-- Everything a student does with a quiz or test goes through these functions
-- rather than through table writes, for one reason: the parts that must not be
-- client-controlled are the answer key, the clock and the score.
--
--   * `assessment_options.is_correct` is never projected to a student. RLS is
--     row-level, so a policy that let them read the row would hand them the
--     answer. `student_get_paper()` selects the columns instead.
--   * The deadline is computed and checked in the database. A browser clock is
--     not evidence of when something was submitted.
--   * The score is computed here from the stored key. A student who could write
--     their own `assessment_attempts.score` would not need to sit the paper —
--     which is why there is no INSERT policy on that table for `authenticated`.
--
-- Every function re-derives the caller from `auth.uid()` and re-checks that the
-- assessment is published, open, and addressed to a class they are enrolled in.
-- Being handed an id is never sufficient.
-- ============================================================================

-- ── Starting an attempt ─────────────────────────────────────────────────────

create or replace function public.student_start_attempt(target_assessment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  paper       public.assessments;
  used        integer;
  existing    public.assessment_attempts;
  new_attempt public.assessment_attempts;
begin
  select * into paper
  from public.assessments a
  where a.id = target_assessment_id
    and a.deleted_at is null
    and a.is_published;

  if paper.id is null then
    raise exception 'assessment not available' using errcode = '42501';
  end if;

  -- Addressed to a class this student is actively enrolled in.
  if not private.receives_content(paper.class_id, paper.section_id) then
    raise exception 'assessment not available' using errcode = '42501';
  end if;

  if paper.opens_at is not null and now() < paper.opens_at then
    raise exception 'this paper has not opened yet' using errcode = '22023';
  end if;

  if paper.closes_at is not null and now() > paper.closes_at then
    raise exception 'this paper has closed' using errcode = '22023';
  end if;

  -- An attempt already running is resumed rather than duplicated, so a refresh
  -- or a lost connection does not consume one of the allowed attempts.
  select * into existing
  from public.assessment_attempts t
  where t.assessment_id = target_assessment_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS'
  order by t.attempt_no desc
  limit 1;

  if existing.id is not null then
    if existing.expires_at is not null and now() > existing.expires_at then
      -- Out of time. Score what was answered rather than leaving it open.
      perform public.student_submit_attempt(existing.id);
    else
      return existing.id;
    end if;
  end if;

  select count(*) into used
  from public.assessment_attempts t
  where t.assessment_id = target_assessment_id
    and t.student_id = auth.uid()
    and t.status <> 'ABANDONED';

  if used >= paper.max_attempts then
    raise exception 'no attempts remaining' using errcode = '22023';
  end if;

  insert into public.assessment_attempts (
    institution_id, assessment_id, student_id, attempt_no, status, started_at, expires_at
  )
  values (
    paper.institution_id,
    paper.id,
    auth.uid(),
    used + 1,
    'IN_PROGRESS',
    now(),
    case
      when paper.duration_minutes is null then paper.closes_at
      else least(
        now() + make_interval(mins => paper.duration_minutes),
        coalesce(paper.closes_at, now() + make_interval(mins => paper.duration_minutes))
      )
    end
  )
  returning * into new_attempt;

  return new_attempt.id;
end;
$$;

-- ── The paper, without the answers ──────────────────────────────────────────

create or replace function public.student_get_paper(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.assessment_attempts;
  paper   public.assessments;
  result  jsonb;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and t.student_id = auth.uid();

  if attempt.id is null then
    raise exception 'attempt not found' using errcode = '42501';
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  /*
   * `is_correct` and `explanation` are absent from this projection. That
   * absence is the security control — everything else here is convenience.
   */
  select jsonb_build_object(
    'attempt_id', attempt.id,
    'assessment_id', paper.id,
    'title', paper.title,
    'kind', paper.kind,
    'instructions', paper.instructions,
    'duration_minutes', paper.duration_minutes,
    'expires_at', attempt.expires_at,
    'status', attempt.status,
    'questions', coalesce(
      (
        select jsonb_agg(question order by question->>'position')
        from (
          select jsonb_build_object(
            'id', q.id,
            'position', lpad(q.position::text, 6, '0'),
            'question_type', q.question_type,
            'prompt', q.prompt,
            'marks', q.marks,
            'options', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object('id', o.id, 'label', o.label)
                  order by o.position
                )
                from public.assessment_options o
                where o.question_id = q.id
              ),
              '[]'::jsonb
            ),
            'answer', coalesce(
              (
                select jsonb_build_object(
                  'selected_option_ids', ans.selected_option_ids,
                  'text_answer', ans.text_answer
                )
                from public.assessment_answers ans
                where ans.attempt_id = attempt.id and ans.question_id = q.id
              ),
              'null'::jsonb
            )
          ) as question
          from public.assessment_questions q
          where q.assessment_id = paper.id
        ) as questions
      ),
      '[]'::jsonb
    )
  ) into result;

  return result;
end;
$$;

-- ── Answering ───────────────────────────────────────────────────────────────

create or replace function public.student_answer_question(
  target_attempt_id  uuid,
  target_question_id uuid,
  option_ids         uuid[],
  answer_text        text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.assessment_attempts;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS';

  if attempt.id is null then
    return false;
  end if;

  -- The clock is checked here, not in the browser.
  if attempt.expires_at is not null and now() > attempt.expires_at then
    return false;
  end if;

  -- The question must belong to the paper being attempted.
  if not exists (
    select 1 from public.assessment_questions q
    where q.id = target_question_id
      and q.assessment_id = attempt.assessment_id
  ) then
    return false;
  end if;

  insert into public.assessment_answers (
    institution_id, attempt_id, question_id, selected_option_ids, text_answer
  )
  values (
    attempt.institution_id,
    attempt.id,
    target_question_id,
    coalesce(option_ids, '{}'),
    nullif(btrim(coalesce(answer_text, '')), '')
  )
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids,
        text_answer         = excluded.text_answer;

  return true;
end;
$$;

-- ── Submitting and scoring ──────────────────────────────────────────────────

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
      /*
       * Free text is not guessed at. It is left unmarked and the attempt stays
       * SUBMITTED until the teacher grades it — a wrong automatic zero is worse
       * than an honest "not marked yet".
       */
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
    status       = case when needs_marking then 'SUBMITTED' else 'GRADED' end,
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

-- ── The result, once it exists ──────────────────────────────────────────────

create or replace function public.student_get_result(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.assessment_attempts;
  paper   public.assessments;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id and t.student_id = auth.uid();

  if attempt.id is null then
    raise exception 'attempt not found' using errcode = '42501';
  end if;

  if attempt.status = 'IN_PROGRESS' then
    raise exception 'this attempt has not been submitted' using errcode = '22023';
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  return jsonb_build_object(
    'attempt_id', attempt.id,
    'title', paper.title,
    'kind', paper.kind,
    'status', attempt.status,
    'score', attempt.score,
    'max_score', attempt.max_score,
    'pass_marks', paper.pass_marks,
    'submitted_at', attempt.submitted_at,
    'reveal_answers', paper.reveal_answers,
    /*
     * The breakdown — including which option was correct — is released only
     * when the teacher chose to reveal answers. Otherwise the student gets
     * their score and nothing that could be passed to somebody yet to sit it.
     */
    'questions', case when not paper.reveal_answers then '[]'::jsonb else coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', q.id,
            'prompt', q.prompt,
            'marks', q.marks,
            'explanation', q.explanation,
            'is_correct', ans.is_correct,
            'marks_awarded', ans.marks_awarded,
            'selected_option_ids', coalesce(ans.selected_option_ids, '{}'),
            'options', coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct)
                  order by o.position
                )
                from public.assessment_options o
                where o.question_id = q.id
              ),
              '[]'::jsonb
            )
          )
          order by q.position
        )
        from public.assessment_questions q
        left join public.assessment_answers ans
          on ans.question_id = q.id and ans.attempt_id = attempt.id
        where q.assessment_id = paper.id
      ),
      '[]'::jsonb
    ) end
  );
end;
$$;

-- ── Marking free text ───────────────────────────────────────────────────────

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

  -- Only the teacher who owns the paper may mark it.
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

  -- Still SUBMITTED while any free-text answer is unmarked.
  select count(*) into remaining
  from public.assessment_answers a
  join public.assessment_questions q on q.id = a.question_id
  where a.attempt_id = attempt.id
    and q.question_type = 'SHORT_ANSWER'
    and a.is_correct is null;

  update public.assessment_attempts t set
    score  = total,
    status = case when remaining = 0 then 'GRADED' else 'SUBMITTED' end
  where t.id = attempt.id;

  return jsonb_build_object('score', total, 'awaiting', remaining);
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function
  public.student_start_attempt(uuid),
  public.student_get_paper(uuid),
  public.student_answer_question(uuid, uuid, uuid[], text),
  public.student_submit_attempt(uuid),
  public.student_get_result(uuid),
  public.teacher_grade_answer(uuid, numeric)
from public, anon;

grant execute on function
  public.student_start_attempt(uuid),
  public.student_get_paper(uuid),
  public.student_answer_question(uuid, uuid, uuid[], text),
  public.student_submit_attempt(uuid),
  public.student_get_result(uuid)
to authenticated, service_role;

grant execute on function public.teacher_grade_answer(uuid, numeric)
to authenticated, service_role;
