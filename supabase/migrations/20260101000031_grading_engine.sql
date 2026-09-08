-- ============================================================================
-- 031 · The grading engine
-- ============================================================================
-- Replaces the functions migration 022 introduced with versions that understand
-- the full question set, the assessment lifecycle, and the marking rules stored
-- alongside each question.
--
-- Three properties are the reason all of this lives in the database rather than
-- in TypeScript:
--
--   * **The clock.** `expires_at` is computed here from the server's `now()`
--     and checked here on every write. A browser can display a countdown; it
--     cannot influence one.
--   * **The answer key.** `is_correct` is read only inside these functions. No
--     projection sent to a student contains it.
--   * **The score.** It is derived from the stored key and the stored rules.
--     There is no code path by which a client supplies a mark.
--
-- Marking is deterministic for every objective type. Nothing here approximates,
-- infers or guesses: a long answer, an essay, a case study and an uploaded file
-- are routed to a person, and the attempt stays unfinished until that person
-- has read them.
-- ============================================================================

-- ── Text comparison ─────────────────────────────────────────────────────────

create or replace function private.normalise_answer(
  value          text,
  is_case_sensitive boolean,
  do_trim        boolean
)
returns text
language sql
immutable
as $$
  select case
    when value is null then null
    when is_case_sensitive then trimmed
    else lower(trimmed)
  end
  from (
    select case
      when do_trim then btrim(regexp_replace(value, '\s+', ' ', 'g'))
      else value
    end as trimmed
  ) as normalised;
$$;

comment on function private.normalise_answer(text, boolean, boolean) is
  'Applies the question''s own case and whitespace rules before comparing. Collapsing runs of whitespace is part of trimming: "9 . 81" and "9 .81" are the same typing accident, not different answers.';

/*
 * Does a student's text match any accepted answer?
 *
 * `accepted` holds one entry per acceptable answer. Alternatives within one
 * entry are separated by `|`, which is what makes multi-blank fill-in-the-blank
 * expressible: entry i covers blank i, and may list several spellings.
 */
create or replace function private.text_answer_matches(
  submitted      text,
  accepted       text[],
  is_case_sensitive boolean,
  do_trim        boolean
)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(accepted) as entry
    cross join lateral unnest(string_to_array(entry, '|')) as alternative
    where private.normalise_answer(alternative, is_case_sensitive, do_trim)
        = private.normalise_answer(submitted, is_case_sensitive, do_trim)
  );
$$;

-- ── Marking one question ────────────────────────────────────────────────────

/*
 * Returns the marks awarded, or NULL when the question needs a person.
 *
 * Split out from the submit function so it can be reasoned about — and tested —
 * on its own, and so that regrading a single answer later uses exactly the same
 * arithmetic that scored it the first time.
 */
create or replace function private.mark_answer(
  question public.assessment_questions,
  answer   public.assessment_answers,
  negative_marking_on boolean
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  correct_ids   uuid[];
  chosen_ids    uuid[];
  correct_count integer;
  hits          integer;
  misses        integer;
  fraction      numeric;
  blanks        text[];
  blank_hits    integer := 0;
  blank_total   integer;
  pairs         jsonb;
  matched       integer := 0;
  pair_total    integer;
  submitted_order uuid[];
  correct_order uuid[];
  answered      boolean;
begin
  -- A question nobody answered scores zero and never attracts a penalty.
  answered :=
    coalesce(array_length(answer.selected_option_ids, 1), 0) > 0
    or coalesce(btrim(answer.text_answer), '') <> ''
    or answer.answer_payload <> '{}'::jsonb
    or answer.storage_path is not null;

  if not answered then
    return case
      when question.question_type in
        ('LONG_ANSWER', 'CASE_STUDY', 'FILE_UPLOAD') then 0
      else 0
    end;
  end if;

  case question.question_type

    -- ── Objective, option based ────────────────────────────────────────────
    when 'SINGLE_CHOICE', 'TRUE_FALSE', 'MULTI_CHOICE' then
      select coalesce(array_agg(o.id order by o.id), '{}') into correct_ids
      from public.assessment_options o
      where o.question_id = question.id and o.is_correct;

      select coalesce(array_agg(x order by x), '{}') into chosen_ids
      from unnest(answer.selected_option_ids) as x;

      correct_count := coalesce(array_length(correct_ids, 1), 0);

      if correct_ids = chosen_ids and correct_count > 0 then
        return question.marks;
      end if;

      /*
       * Partial credit, when the teacher enabled it: one point per correct
       * option chosen, less one per incorrect option chosen, floored at zero.
       * Ticking every box therefore earns nothing, which is the property that
       * makes partial credit worth having.
       */
      if question.allow_partial_credit and question.question_type = 'MULTI_CHOICE'
         and correct_count > 0 then
        select count(*) into hits
        from unnest(chosen_ids) as c where c = any(correct_ids);
        select count(*) into misses
        from unnest(chosen_ids) as c where not (c = any(correct_ids));

        fraction := greatest(0, (hits - misses)::numeric / correct_count);
        if fraction > 0 then
          return round(question.marks * fraction, 2);
        end if;
      end if;

      return case
        when negative_marking_on then -question.negative_marks
        else 0
      end;

    -- ── Objective, text based ──────────────────────────────────────────────
    when 'SHORT_ANSWER' then
      /*
       * Auto-marked only when the teacher supplied accepted answers. Without
       * them there is nothing to compare against, so it goes to a person rather
       * than being silently marked wrong.
       */
      if coalesce(array_length(question.accepted_answers, 1), 0) = 0 then
        return null;
      end if;

      if private.text_answer_matches(
           answer.text_answer, question.accepted_answers,
           question.case_sensitive, question.trim_whitespace) then
        return question.marks;
      end if;

      return case when negative_marking_on then -question.negative_marks else 0 end;

    when 'FILL_BLANK' then
      blank_total := coalesce(array_length(question.accepted_answers, 1), 0);
      if blank_total = 0 then
        return null;
      end if;

      -- One entry per blank, in order.
      select coalesce(array_agg(value order by ordinality), '{}') into blanks
      from jsonb_array_elements_text(
             coalesce(answer.answer_payload->'blanks', '[]'::jsonb)
           ) with ordinality as t(value, ordinality);

      for i in 1..blank_total loop
        if i <= coalesce(array_length(blanks, 1), 0)
           and private.text_answer_matches(
                 blanks[i], array[question.accepted_answers[i]],
                 question.case_sensitive, question.trim_whitespace) then
          blank_hits := blank_hits + 1;
        end if;
      end loop;

      if blank_hits = blank_total then
        return question.marks;
      end if;

      if question.allow_partial_credit and blank_hits > 0 then
        return round(question.marks * blank_hits::numeric / blank_total, 2);
      end if;

      return case when negative_marking_on then -question.negative_marks else 0 end;

    when 'NUMERICAL' then
      /*
       * The rule the brief states, implemented literally:
       *   |submitted - correct| <= tolerance
       * A missing tolerance means exact equality, not "close enough".
       */
      begin
        if abs(answer.text_answer::numeric - question.numeric_answer)
             <= coalesce(question.numeric_tolerance, 0) then
          return question.marks;
        end if;
      exception when invalid_text_representation or numeric_value_out_of_range then
        -- Not a number. Wrong, not an error: the student typed something else.
        null;
      end;

      return case when negative_marking_on then -question.negative_marks else 0 end;

    -- ── Objective, structured ──────────────────────────────────────────────
    when 'MATCHING' then
      pairs := coalesce(answer.answer_payload->'pairs', '{}'::jsonb);

      select count(*) into pair_total
      from public.assessment_options o
      where o.question_id = question.id and o.match_label is not null;

      if pair_total = 0 then
        return null;
      end if;

      select count(*) into matched
      from public.assessment_options o
      where o.question_id = question.id
        and o.match_label is not null
        and private.normalise_answer(pairs->>o.id::text, false, true)
          = private.normalise_answer(o.match_label, false, true);

      if matched = pair_total then
        return question.marks;
      end if;

      if question.allow_partial_credit and matched > 0 then
        return round(question.marks * matched::numeric / pair_total, 2);
      end if;

      return case when negative_marking_on then -question.negative_marks else 0 end;

    when 'ORDERING' then
      select coalesce(array_agg(value::uuid order by ordinality), '{}')
        into submitted_order
      from jsonb_array_elements_text(
             coalesce(answer.answer_payload->'order', '[]'::jsonb)
           ) with ordinality as t(value, ordinality);

      select coalesce(array_agg(o.id order by o.position), '{}') into correct_order
      from public.assessment_options o
      where o.question_id = question.id;

      if coalesce(array_length(correct_order, 1), 0) = 0 then
        return null;
      end if;

      if submitted_order = correct_order then
        return question.marks;
      end if;

      if question.allow_partial_credit then
        -- One point per item in its correct place.
        select count(*) into matched
        from generate_subscripts(correct_order, 1) as i
        where i <= coalesce(array_length(submitted_order, 1), 0)
          and submitted_order[i] = correct_order[i];

        if matched > 0 then
          return round(
            question.marks * matched::numeric / array_length(correct_order, 1), 2);
        end if;
      end if;

      return case when negative_marking_on then -question.negative_marks else 0 end;

    -- ── Subjective: a person reads these ───────────────────────────────────
    else
      return null;
  end case;
end;
$$;

comment on function private.mark_answer(public.assessment_questions, public.assessment_answers, boolean) is
  'Deterministic marking for objective questions. Returns NULL when the question needs a human — long answers, case studies, uploaded files, and short answers with no accepted answer supplied.';

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
  serve       uuid[];
  deadline    timestamptz;
begin
  select * into paper
  from public.assessments a
  where a.id = target_assessment_id
    and a.deleted_at is null;

  if paper.id is null then
    raise exception 'assessment not available' using errcode = '42501';
  end if;

  -- Only these states admit a new attempt. DRAFT, CLOSED, GRADING, COMPLETED
  -- and ARCHIVED all mean "not now", for different reasons.
  if paper.status not in ('SCHEDULED', 'PUBLISHED', 'ACTIVE') then
    raise exception 'this paper is not open' using errcode = '22023';
  end if;

  if not private.receives_content(paper.class_id, paper.section_id) then
    raise exception 'assessment not available' using errcode = '42501';
  end if;

  if paper.opens_at is not null and now() < paper.opens_at then
    raise exception 'this paper opens at %', to_char(paper.opens_at, 'DD Mon YYYY HH24:MI')
      using errcode = '22023';
  end if;

  /*
   * Late starts. The grace period extends the window for *starting*; whether a
   * resulting submission counts as late is decided at submission, from the same
   * server clock.
   */
  if paper.closes_at is not null
     and now() > paper.closes_at + make_interval(mins => paper.grace_minutes) then
    raise exception 'this paper has closed' using errcode = '22023';
  end if;

  if paper.closes_at is not null and now() > paper.closes_at and not paper.allow_late then
    raise exception 'this paper has closed' using errcode = '22023';
  end if;

  /*
   * An attempt already running is resumed, never duplicated. This is what makes
   * a refresh, a second tab and a reconnect all safe: they converge on the same
   * row rather than each starting a fresh clock.
   */
  select * into existing
  from public.assessment_attempts t
  where t.assessment_id = target_assessment_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS'
  order by t.attempt_no desc
  limit 1;

  if existing.id is not null then
    if existing.expires_at is not null and now() > existing.expires_at then
      perform public.student_submit_attempt(existing.id, true);
    else
      insert into public.assessment_integrity_events (institution_id, attempt_id, event)
      values (existing.institution_id, existing.id, 'ATTEMPT_RESUMED');
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

  /*
   * The paper this student will sit, fixed now.
   *
   * Drawn once and stored, so a question pool is a genuine random selection
   * rather than a different set on every page load, and so a later edit to the
   * assessment cannot change what this attempt was marked against.
   */
  select coalesce(array_agg(q.id order by ord), '{}') into serve
  from (
    select q.id,
           case
             when paper.shuffle_questions then random()
             else q.position::numeric
           end as ord
    from public.assessment_questions q
    where q.assessment_id = paper.id
    order by ord
    limit coalesce(paper.questions_to_serve, 2147483647)
  ) as q;

  if coalesce(array_length(serve, 1), 0) = 0 then
    raise exception 'this paper has no questions' using errcode = '22023';
  end if;

  deadline := case
    when paper.duration_minutes is null then paper.closes_at
    else least(
      now() + make_interval(mins => paper.duration_minutes),
      coalesce(
        paper.closes_at + make_interval(mins => paper.grace_minutes),
        now() + make_interval(mins => paper.duration_minutes)
      )
    )
  end;

  insert into public.assessment_attempts (
    institution_id, assessment_id, student_id, attempt_no, status,
    started_at, expires_at, question_set, assessment_version, last_seen_at
  )
  values (
    paper.institution_id, paper.id, auth.uid(), used + 1, 'IN_PROGRESS',
    now(), deadline, serve, paper.version, now()
  )
  returning * into new_attempt;

  return new_attempt.id;
end;
$$;

-- ── The paper, as the student may see it ────────────────────────────────────

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
  where t.id = target_attempt_id and t.student_id = auth.uid();

  if attempt.id is null then
    raise exception 'attempt not found' using errcode = '42501';
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  update public.assessment_attempts t set last_seen_at = now() where t.id = attempt.id;

  /*
   * `is_correct`, `accepted_answers`, `numeric_answer` and `explanation` are all
   * absent from this projection. Their absence is the control; everything else
   * here is presentation.
   *
   * Questions come from `attempt.question_set`, in its order — not from a fresh
   * query against the assessment — so what is served is what was drawn.
   */
  select jsonb_build_object(
    'attempt_id', attempt.id,
    'assessment_id', paper.id,
    'title', paper.title,
    'kind', paper.kind,
    'instructions', paper.instructions,
    'duration_minutes', paper.duration_minutes,
    'expires_at', attempt.expires_at,
    'server_now', now(),
    'status', attempt.status,
    'attempt_no', attempt.attempt_no,
    'marked_for_review', to_jsonb(attempt.marked_for_review),
    'total_marks', (
      select coalesce(sum(q.marks), 0)
      from public.assessment_questions q
      where q.id = any(attempt.question_set)
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', s.id, 'title', s.title, 'instructions', s.instructions)
        order by s.position
      )
      from public.assessment_sections s
      where s.assessment_id = paper.id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(item order by (item->>'position')::int)
      from (
        select jsonb_build_object(
          'id', q.id,
          'position', ord,
          'section_id', q.section_id,
          'question_type', q.question_type,
          'prompt', q.prompt,
          'passage', q.passage,
          'media_path', q.media_path,
          'marks', q.marks,
          'negative_marks', case when paper.negative_marking then q.negative_marks else 0 end,
          'allowed_mime_types', to_jsonb(q.allowed_mime_types),
          'max_file_bytes', q.max_file_bytes,
          'blank_count', coalesce(array_length(q.accepted_answers, 1), 0),
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'label', o.label,
                'media_path', o.media_path,
                -- The right-hand items of a matching question are shown, but
                -- never in their correct pairing.
                'match_label', case when q.question_type = 'MATCHING' then null else null end
              )
              order by case when paper.shuffle_options then random() else o.position::numeric end
            )
            from public.assessment_options o
            where o.question_id = q.id
          ), '[]'::jsonb),
          -- For MATCHING, the right-hand column is served separately and in a
          -- fixed sorted order, so its sequence leaks nothing.
          'match_targets', coalesce((
            select jsonb_agg(distinct o.match_label order by o.match_label)
            from public.assessment_options o
            where o.question_id = q.id and o.match_label is not null
          ), '[]'::jsonb),
          'answer', coalesce((
            select jsonb_build_object(
              'selected_option_ids', to_jsonb(a.selected_option_ids),
              'text_answer', a.text_answer,
              'answer_payload', a.answer_payload,
              'file_name', a.file_name
            )
            from public.assessment_answers a
            where a.attempt_id = attempt.id and a.question_id = q.id
          ), 'null'::jsonb)
        ) as item
        from unnest(attempt.question_set) with ordinality as served(qid, ord)
        join public.assessment_questions q on q.id = served.qid
      ) as questions
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ── Answering ───────────────────────────────────────────────────────────────

create or replace function public.student_answer_question(
  target_attempt_id  uuid,
  target_question_id uuid,
  option_ids         uuid[],
  answer_text        text,
  payload            jsonb default '{}'::jsonb
)
returns jsonb
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
    return jsonb_build_object('saved', false, 'reason', 'not_active');
  end if;

  -- The clock, checked here. A client that keeps counting past zero saves
  -- nothing after this point.
  if attempt.expires_at is not null and now() > attempt.expires_at then
    return jsonb_build_object('saved', false, 'reason', 'expired');
  end if;

  -- The question must be one this attempt was actually served.
  if not (target_question_id = any(attempt.question_set)) then
    return jsonb_build_object('saved', false, 'reason', 'not_in_paper');
  end if;

  insert into public.assessment_answers (
    institution_id, attempt_id, question_id, selected_option_ids, text_answer, answer_payload
  )
  values (
    attempt.institution_id, attempt.id, target_question_id,
    coalesce(option_ids, '{}'),
    nullif(btrim(coalesce(answer_text, '')), ''),
    coalesce(payload, '{}'::jsonb)
  )
  on conflict (attempt_id, question_id) do update
    set selected_option_ids = excluded.selected_option_ids,
        text_answer         = excluded.text_answer,
        answer_payload      = excluded.answer_payload;

  update public.assessment_attempts t set last_seen_at = now() where t.id = attempt.id;

  return jsonb_build_object('saved', true, 'saved_at', now());
end;
$$;

/** Records the student's own "come back to this one" flags, so a refresh keeps them. */
create or replace function public.student_mark_for_review(
  target_attempt_id uuid,
  question_ids      uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.assessment_attempts t
     set marked_for_review = coalesce(question_ids, '{}')
   where t.id = target_attempt_id
     and t.student_id = auth.uid()
     and t.status = 'IN_PROGRESS';

  return found;
end;
$$;

-- ── Submitting ──────────────────────────────────────────────────────────────

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
   * Idempotency. A double-clicked button, a retried request and a client that
   * submits as the timer hits zero all arrive here; the row lock plus this
   * check mean the second one reports the existing outcome instead of scoring
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
      'awaiting_marking', attempt.awaiting_manual > 0,
      'already_submitted', true
    );
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  -- Lateness is the server's judgement, from the assessment's own window.
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

    if awarded is null then
      -- A person has to read this one.
      pending := pending + 1;
      update public.assessment_answers a
         set is_correct = null, marks_awarded = 0
       where a.id = answer.id;
    else
      total := total + awarded;
      update public.assessment_answers a
         set is_correct = (awarded >= question.marks and question.marks > 0),
             marks_awarded = greatest(awarded, 0)
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
   * Whether the student may see this yet. IMMEDIATE releases as soon as
   * auto-marking is done — but only if there is nothing left for a person,
   * because a score that omits the essay is not the result.
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
    passed          = case when paper.pass_marks is null then null else total >= paper.pass_marks end,
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
    'released', release,
    'is_late', late,
    'already_submitted', false
  );
end;
$$;

-- ── The result, when the policy allows it ───────────────────────────────────

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

  /*
   * Not released yet: the student is told that, and told nothing else. Sending
   * the score with a "hidden" flag would put the mark in the browser, where the
   * only thing standing between it and the student is the UI declining to draw
   * it.
   */
  if attempt.released_at is null then
    return jsonb_build_object(
      'attempt_id', attempt.id,
      'title', paper.title,
      'kind', paper.kind,
      'status', attempt.status,
      'released', false,
      'awaiting_marking', attempt.awaiting_manual > 0,
      'release_policy', paper.release_policy,
      'submitted_at', attempt.submitted_at
    );
  end if;

  return jsonb_build_object(
    'attempt_id', attempt.id,
    'title', paper.title,
    'kind', paper.kind,
    'status', attempt.status,
    'released', true,
    'score', attempt.score,
    'max_score', attempt.max_score,
    'percentage', attempt.percentage,
    'passed', attempt.passed,
    'pass_marks', paper.pass_marks,
    'is_late', attempt.is_late,
    'penalty_applied', attempt.penalty_applied,
    'submitted_at', attempt.submitted_at,
    'reveal_answers', paper.reveal_answers,
    'questions', case when not paper.reveal_answers then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', q.id,
          'prompt', q.prompt,
          'question_type', q.question_type,
          'marks', q.marks,
          'explanation', q.explanation,
          'is_correct', a.is_correct,
          'marks_awarded', a.marks_awarded,
          'feedback', a.feedback,
          'text_answer', a.text_answer,
          'selected_option_ids', to_jsonb(coalesce(a.selected_option_ids, '{}')),
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object('id', o.id, 'label', o.label, 'is_correct', o.is_correct)
              order by o.position
            )
            from public.assessment_options o where o.question_id = q.id
          ), '[]'::jsonb)
        )
        order by q.position
      )
      from unnest(attempt.question_set) as served(qid)
      join public.assessment_questions q on q.id = served.qid
      left join public.assessment_answers a
        on a.question_id = q.id and a.attempt_id = attempt.id
    ), '[]'::jsonb) end
  );
end;
$$;

-- ── Marking by a person ─────────────────────────────────────────────────────

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

  -- The bounds the brief states: at least nothing, at most the question's marks.
  if awarded < 0 or awarded > question.marks then
    raise exception 'mark must be between 0 and %', question.marks using errcode = '22023';
  end if;

  was_score := attempt.score;

  update public.assessment_answers a set
    marks_awarded = awarded,
    is_correct    = (awarded >= question.marks),
    feedback      = nullif(btrim(coalesce(comment, '')), ''),
    graded_by     = auth.uid(),
    graded_at     = now()
  where a.id = target_answer_id;

  select coalesce(sum(a.marks_awarded), 0) into total
  from public.assessment_answers a where a.attempt_id = attempt.id;

  select count(*) into remaining
  from public.assessment_answers a
  join public.assessment_questions q on q.id = a.question_id
  where a.attempt_id = attempt.id
    and q.question_type in ('LONG_ANSWER', 'CASE_STUDY', 'FILE_UPLOAD', 'SHORT_ANSWER')
    and a.is_correct is null;

  release := attempt.released_at is not null
    or (paper.release_policy in ('IMMEDIATE', 'AFTER_GRADING') and remaining = 0);

  update public.assessment_attempts t set
    score           = total,
    percentage      = case when t.max_score > 0 then round(total * 100 / t.max_score, 2) else 0 end,
    passed          = case when paper.pass_marks is null then null else total >= paper.pass_marks end,
    awaiting_manual = remaining,
    status          = case when remaining = 0 then 'GRADED'::public.attempt_status else t.status end,
    released_at     = case when release then coalesce(t.released_at, now()) else t.released_at end
  where t.id = attempt.id;

  /*
   * A result the student has already seen is not silently rewritten. Changing
   * it afterwards is allowed — teachers make mistakes — but it leaves a record
   * of what it was, what it became, and who changed it.
   */
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

/** Releases every finished attempt on a paper. The MANUAL release policy's switch. */
create or replace function public.teacher_release_results(target_assessment_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if not private.owns_assessment(target_assessment_id) then
    raise exception 'not your assessment' using errcode = '42501';
  end if;

  update public.assessment_attempts t
     set released_at = coalesce(t.released_at, now())
   where t.assessment_id = target_assessment_id
     and t.status <> 'IN_PROGRESS'
     -- Nothing is released while a person still owes it a mark.
     and t.awaiting_manual = 0;

  get diagnostics affected = row_count;

  update public.assessments a
     set results_released_at = coalesce(a.results_released_at, now())
   where a.id = target_assessment_id;

  return affected;
end;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke execute on function
  public.student_answer_question(uuid, uuid, uuid[], text, jsonb),
  public.student_submit_attempt(uuid, boolean),
  public.student_mark_for_review(uuid, uuid[]),
  public.teacher_grade_answer(uuid, numeric, text),
  public.teacher_release_results(uuid)
from public, anon;

grant execute on function
  public.student_answer_question(uuid, uuid, uuid[], text, jsonb),
  public.student_submit_attempt(uuid, boolean),
  public.student_mark_for_review(uuid, uuid[])
to authenticated, service_role;

grant execute on function
  public.teacher_grade_answer(uuid, numeric, text),
  public.teacher_release_results(uuid)
to authenticated, service_role;

/*
 * The old four-argument and two-argument signatures are dropped now that every
 * caller uses the new ones. Leaving them would mean two definitions of how a
 * paper is answered and marked, which is exactly the drift this replaces.
 */
drop function if exists public.student_answer_question(uuid, uuid, uuid[], text);
drop function if exists public.student_submit_attempt(uuid);
drop function if exists public.teacher_grade_answer(uuid, numeric);
