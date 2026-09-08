-- ============================================================================
-- 017 · Fix the status cast in public_submit_application
-- ============================================================================
-- Migration 016 wrote the transition as:
--
--   set status = case when status = 'DRAFT' then 'SUBMITTED' else 'UNDER_REVIEW' end
--
-- Both branches are untyped string literals, so PostgreSQL infers the CASE as
-- `text` and the assignment fails against an `application_status` column:
--
--   column "status" is of type public.application_status
--   but expression is of type text
--
-- Nothing catches this until the function actually runs — the function body is
-- not type-checked at creation time, so the migration applied cleanly and the
-- failure only appeared on the first real submission.
--
-- Each branch is now cast explicitly.
-- ============================================================================

create or replace function public.public_submit_application(
  application_id uuid,
  token_hash     text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  application public.institution_applications;
begin
  select * into application
    from public.institution_applications a
   where a.id = application_id
     and a.draft_token_hash = token_hash
     and a.deleted_at is null
   for update;

  if application.id is null then
    raise exception 'application not found' using errcode = '42501';
  end if;

  -- Everything the review actually needs. Checked here as well as in the form,
  -- because the form is not the only way to reach this function.
  if application.representative_name is null
     or application.representative_email is null
     or application.representative_phone is null
     or application.representative_designation is null then
    raise exception 'the authorised representative is incomplete' using errcode = '23514';
  end if;

  if application.city is null or application.state is null then
    raise exception 'the address is incomplete' using errcode = '23514';
  end if;

  if application.status <> 'DRAFT'
     and application.status not in ('DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED') then
    raise exception 'this application has already been submitted' using errcode = '23514';
  end if;

  -- A first submission goes to SUBMITTED. A resubmission after HQ asked for
  -- documents or corrections returns straight to UNDER_REVIEW, because it is
  -- already in the reviewer's hands. Both branches are cast explicitly.
  update public.institution_applications
     set status = case
                    when status = 'DRAFT' then 'SUBMITTED'::public.application_status
                    else 'UNDER_REVIEW'::public.application_status
                  end,
         submitted_at = coalesce(submitted_at, now())
   where id = application_id
  returning * into application;

  return jsonb_build_object(
    'id', application.id,
    'application_ref', application.application_ref,
    'status', application.status,
    'submitted_at', application.submitted_at,
    'institution_name', application.institution_name,
    'applicant_email', application.applicant_email
  );
end;
$$;

revoke execute on function public.public_submit_application(uuid, text) from public;
grant execute on function public.public_submit_application(uuid, text)
  to anon, authenticated, service_role;
