-- ============================================================================
-- 036 · The paper tells the student whether pausing is available
-- ============================================================================
-- `student_get_paper()` did not project `paused_at` or the paper's
-- `allow_pause`, so the runner had no way to render a pause control or to know
-- the clock was frozen. Two fields, added to the same projection — and still no
-- answer key.
-- ============================================================================

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

  select jsonb_build_object(
    'attempt_id', attempt.id,
    'assessment_id', paper.id,
    'title', paper.title,
    'kind', paper.kind,
    'instructions', paper.instructions,
    'duration_minutes', paper.duration_minutes,
    'expires_at', attempt.expires_at,
    'server_now', now(),
    'paused_at', attempt.paused_at,
    'allow_pause', paper.allow_pause,
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
                'media_path', o.media_path
              )
              order by case when paper.shuffle_options then random() else o.position::numeric end
            )
            from public.assessment_options o
            where o.question_id = q.id
          ), '[]'::jsonb),
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
