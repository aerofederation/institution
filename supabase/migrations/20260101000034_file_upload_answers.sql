-- ============================================================================
-- 034 · File upload answers
-- ============================================================================
-- A FILE_UPLOAD question could be authored but not answered: the student runner
-- had no way to attach anything, and said so rather than pretending. This is
-- the missing half.
--
-- The object itself goes to the private `assignment-submissions` bucket through
-- a signed URL the server mints for exactly one path. This function records the
-- metadata, and it is the part that decides whether the upload was legitimate:
--
--   * the attempt is the caller's own, still running, and not past its deadline;
--   * the question was actually served to this attempt, and is a FILE_UPLOAD;
--   * the path lies under this attempt's own prefix, so a forged path pointing
--     at somebody else's file is refused;
--   * the declared type and size satisfy what the question asked for.
--
-- The path check is the important one. Storage policies confine a write to the
-- institution's own folder, which stops cross-tenant writes but not one student
-- claiming another student's object as their answer. Pinning the prefix to the
-- attempt closes that.
-- ============================================================================

create or replace function public.student_attach_file(
  target_attempt_id  uuid,
  target_question_id uuid,
  path               text,
  original_name      text,
  size_bytes         bigint,
  content_type       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt  public.assessment_attempts;
  question public.assessment_questions;
  expected text;
begin
  select * into attempt
  from public.assessment_attempts t
  where t.id = target_attempt_id
    and t.student_id = auth.uid()
    and t.status = 'IN_PROGRESS';

  if attempt.id is null then
    return jsonb_build_object('saved', false, 'reason', 'not_active');
  end if;

  if attempt.expires_at is not null and now() > attempt.expires_at then
    return jsonb_build_object('saved', false, 'reason', 'expired');
  end if;

  if not (target_question_id = any(attempt.question_set)) then
    return jsonb_build_object('saved', false, 'reason', 'not_in_paper');
  end if;

  select * into question
  from public.assessment_questions q where q.id = target_question_id;

  if question.question_type <> 'FILE_UPLOAD' then
    return jsonb_build_object('saved', false, 'reason', 'not_a_file_question');
  end if;

  -- The object must live under this attempt's own prefix.
  expected := attempt.institution_id::text || '/attempts/' || attempt.id::text || '/';
  if position(expected in path) <> 1 then
    raise exception 'storage path outside this attempt' using errcode = '42501';
  end if;

  if coalesce(array_length(question.allowed_mime_types, 1), 0) > 0
     and not (content_type = any(question.allowed_mime_types)) then
    return jsonb_build_object('saved', false, 'reason', 'type_not_allowed');
  end if;

  if question.max_file_bytes is not null and size_bytes > question.max_file_bytes then
    return jsonb_build_object('saved', false, 'reason', 'too_large');
  end if;

  insert into public.assessment_answers (
    institution_id, attempt_id, question_id, storage_path, file_name, file_size, mime_type
  )
  values (
    attempt.institution_id, attempt.id, target_question_id,
    path, original_name, size_bytes, content_type
  )
  on conflict (attempt_id, question_id) do update
    set storage_path = excluded.storage_path,
        file_name    = excluded.file_name,
        file_size    = excluded.file_size,
        mime_type    = excluded.mime_type;

  update public.assessment_attempts t set last_seen_at = now() where t.id = attempt.id;

  return jsonb_build_object('saved', true, 'file_name', original_name);
end;
$$;

/**
 * The stored path for one answer, for whoever is entitled to read it.
 *
 * Returns the path only — the caller mints a short-lived signed URL from it. A
 * student may fetch their own; the owning teacher may fetch any on their paper.
 * Nobody else gets anything, and no path is ever a public URL.
 */
create or replace function public.assessment_answer_file(target_answer_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  answer  public.assessment_answers;
  attempt public.assessment_attempts;
begin
  select * into answer from public.assessment_answers a where a.id = target_answer_id;
  if answer.id is null or answer.storage_path is null then
    return null;
  end if;

  select * into attempt
  from public.assessment_attempts t where t.id = answer.attempt_id;

  if attempt.student_id = auth.uid() or private.owns_assessment(attempt.assessment_id) then
    return answer.storage_path;
  end if;

  return null;
end;
$$;

revoke execute on function
  public.student_attach_file(uuid, uuid, text, text, bigint, text),
  public.assessment_answer_file(uuid)
from public, anon;

grant execute on function
  public.student_attach_file(uuid, uuid, text, text, bigint, text),
  public.assessment_answer_file(uuid)
to authenticated, service_role;
