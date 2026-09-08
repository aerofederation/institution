-- ============================================================================
-- 035 · Pausing an attempt
-- ============================================================================
-- `allow_pause` has been a setting since migration 029 and has done nothing.
-- A control that looks like it works and does not is worse than no control, so
-- this is the behaviour behind it.
--
-- The rule, stated before the code:
--
--   Pausing stops the clock. Resuming moves the deadline forward by exactly the
--   time spent paused — never more, and never past the paper's own closing time.
--
-- Two limits keep that from becoming unlimited time.
--
--   * The deadline can never exceed `closes_at + grace_minutes`. That ceiling
--     already applied when the attempt started and it still applies here, so a
--     student cannot pause their way past the end of an exam window.
--   * Cumulative pause is capped at the paper's own duration. Without a cap, a
--     paper with no `closes_at` could be paused indefinitely, which is not a
--     pause — it is an open-book take-home with a timer drawn on it.
--
-- While paused, answers are refused. Otherwise "pause" would mean "stop the
-- clock and keep working", which is the whole exploit.
-- ============================================================================

create or replace function public.student_pause_attempt(target_attempt_id uuid)
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
  where t.id = target_attempt_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS'
  for update;

  if attempt.id is null then
    return jsonb_build_object('paused', false, 'reason', 'not_active');
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  if not paper.allow_pause then
    return jsonb_build_object('paused', false, 'reason', 'not_allowed');
  end if;

  -- Already paused: report the existing state rather than restarting the clock,
  -- so a double-click cannot discard time already accrued.
  if attempt.paused_at is not null then
    return jsonb_build_object('paused', true, 'paused_at', attempt.paused_at);
  end if;

  if attempt.expires_at is not null and now() > attempt.expires_at then
    return jsonb_build_object('paused', false, 'reason', 'expired');
  end if;

  update public.assessment_attempts t
     set paused_at = now()
   where t.id = attempt.id;

  return jsonb_build_object('paused', true, 'paused_at', now());
end;
$$;

create or replace function public.student_resume_attempt(target_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt   public.assessment_attempts;
  paper     public.assessments;
  spent_ms  bigint;
  allowance bigint;
  granted   bigint;
  ceiling   timestamptz;
  deadline  timestamptz;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS'
  for update;

  if attempt.id is null then
    return jsonb_build_object('resumed', false, 'reason', 'not_active');
  end if;

  if attempt.paused_at is null then
    return jsonb_build_object('resumed', true, 'expires_at', attempt.expires_at);
  end if;

  select * into paper from public.assessments a where a.id = attempt.assessment_id;

  spent_ms := (extract(epoch from (now() - attempt.paused_at)) * 1000)::bigint;

  /*
   * How much pause this attempt may still convert into extra time. Beyond the
   * cap the clock simply resumes where it was — the student is not penalised,
   * but they gain nothing further either.
   */
  allowance := case
    when paper.duration_minutes is null then 0
    else (paper.duration_minutes::bigint * 60000) - attempt.paused_ms
  end;

  granted := greatest(least(spent_ms, greatest(allowance, 0)), 0);

  -- The paper's own window is an absolute ceiling, exactly as it was when the
  -- attempt started.
  ceiling := case
    when paper.closes_at is null then null
    else paper.closes_at + make_interval(mins => paper.grace_minutes)
  end;

  deadline := case
    when attempt.expires_at is null then null
    else attempt.expires_at + make_interval(secs => granted / 1000.0)
  end;

  if deadline is not null and ceiling is not null and deadline > ceiling then
    deadline := ceiling;
  end if;

  update public.assessment_attempts t
     set paused_at  = null,
         paused_ms  = t.paused_ms + spent_ms,
         expires_at = deadline
   where t.id = attempt.id;

  return jsonb_build_object(
    'resumed', true,
    'expires_at', deadline,
    'paused_ms_total', attempt.paused_ms + spent_ms,
    'granted_ms', granted
  );
end;
$$;

/*
 * A paused attempt accepts no answers.
 *
 * Added to the existing guard rather than to a new one, so there is a single
 * place that decides whether a save is allowed.
 */
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

  if attempt.paused_at is not null then
    return jsonb_build_object('saved', false, 'reason', 'paused');
  end if;

  if attempt.expires_at is not null and now() > attempt.expires_at then
    return jsonb_build_object('saved', false, 'reason', 'expired');
  end if;

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

revoke execute on function
  public.student_pause_attempt(uuid),
  public.student_resume_attempt(uuid)
from public, anon;

grant execute on function
  public.student_pause_attempt(uuid),
  public.student_resume_attempt(uuid)
to authenticated, service_role;
