-- ============================================================================
-- 037 · Images on questions
-- ============================================================================
-- `media_path` has existed on `assessment_questions` since migration 029 and
-- nothing wrote it, so a question could not carry a diagram — which for an
-- aerospace paper is a real limitation rather than a cosmetic one.
--
-- The object lives in the private `learning-materials` bucket under the
-- institution's own prefix, so the storage policies already written cover it:
-- any live member of the tenant may read it, nobody outside may.
--
-- That is deliberately broader than the question's own visibility. A diagram is
-- not an answer key, the path is 32 random hex characters, and it is only ever
-- handed out as a signed URL that expires. Narrowing it further would mean a
-- per-object policy joining back to `assessment_questions`, which is a lot of
-- machinery to protect a picture of a wing.
--
-- The two functions below are the only way a path is attached or read.
-- ============================================================================

create or replace function public.teacher_set_question_media(
  target_question_id uuid,
  path               text,
  content_type       text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  question public.assessment_questions;
  expected text;
begin
  select * into question
  from public.assessment_questions q where q.id = target_question_id;

  if question.id is null then
    raise exception 'question not found' using errcode = '42501';
  end if;

  -- Only the teacher who owns the paper.
  if not private.owns_assessment(question.assessment_id) then
    raise exception 'not your assessment' using errcode = '42501';
  end if;

  -- Confined to the institution's own prefix, matching the storage policy.
  if path is not null then
    expected := question.institution_id::text || '/questions/';
    if position(expected in path) <> 1 then
      raise exception 'storage path outside this institution' using errcode = '42501';
    end if;
  end if;

  update public.assessment_questions q set
    media_path      = path,
    media_mime_type = content_type
  where q.id = target_question_id;

  return true;
end;
$$;

/**
 * The image path for a question, to whoever may see the question.
 *
 * A student gets it only while they hold a live attempt that was served this
 * question — so a diagram cannot be fetched by anyone who has not opened the
 * paper, and not at all once the paper is closed to them.
 */
create or replace function public.assessment_question_media(target_question_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  question public.assessment_questions;
begin
  select * into question
  from public.assessment_questions q where q.id = target_question_id;

  if question.id is null or question.media_path is null then
    return null;
  end if;

  if private.owns_assessment(question.assessment_id) then
    return question.media_path;
  end if;

  if exists (
    select 1 from public.assessment_attempts t
    where t.student_id = auth.uid()
      and t.assessment_id = question.assessment_id
      and target_question_id = any(t.question_set)
  ) then
    return question.media_path;
  end if;

  return null;
end;
$$;

revoke execute on function
  public.teacher_set_question_media(uuid, text, text),
  public.assessment_question_media(uuid)
from public, anon;

grant execute on function
  public.teacher_set_question_media(uuid, text, text),
  public.assessment_question_media(uuid)
to authenticated, service_role;
