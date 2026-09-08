-- ============================================================================
-- 019 · Allow the tracking address to follow the authorised representative
-- ============================================================================
-- `applicant_email` is the address that receives the application confirmation
-- and every tracking code. Migration 016 left it out of the writable whitelist,
-- so it was fixed at whatever was supplied when the draft was created — the
-- institution's official email, since that is the only address available at
-- step 1 and the column is NOT NULL.
--
-- That is often a generic office@ inbox the person filling the form cannot
-- read, which leaves them unable to receive their own tracking code. So the
-- column becomes writable while the applicant still owns the form, and the
-- application layer points it at the authorised representative once step 3 is
-- saved.
--
-- The existing status guard still applies: only DRAFT and the two
-- applicant-actionable states are writable, so the tracking address cannot be
-- changed once HQ has the application under review.
-- ============================================================================

create or replace function public.public_save_application(
  application_id uuid,
  token_hash     text,
  patch          jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated integer;
begin
  update public.institution_applications a set
    institution_name    = coalesce(nullif(btrim(patch->>'institution_name'), ''), a.institution_name),
    institution_type    = coalesce((patch->>'institution_type')::public.institution_type, a.institution_type),
    category            = coalesce((patch->>'category')::public.institution_category, a.category),
    official_email      = coalesce(lower(nullif(btrim(patch->>'official_email'), '')), a.official_email),
    official_phone      = case when patch ? 'official_phone' then nullif(btrim(patch->>'official_phone'), '') else a.official_phone end,
    website             = case when patch ? 'website' then nullif(btrim(patch->>'website'), '') else a.website end,
    year_established    = case when patch ? 'year_established' then (patch->>'year_established')::smallint else a.year_established end,
    registration_number = case when patch ? 'registration_number' then nullif(btrim(patch->>'registration_number'), '') else a.registration_number end,
    description         = case when patch ? 'description' then nullif(btrim(patch->>'description'), '') else a.description end,
    field_of_work       = case when patch ? 'field_of_work' then nullif(btrim(patch->>'field_of_work'), '') else a.field_of_work end,

    address_line        = case when patch ? 'address_line' then nullif(btrim(patch->>'address_line'), '') else a.address_line end,
    city                = case when patch ? 'city' then nullif(btrim(patch->>'city'), '') else a.city end,
    state               = case when patch ? 'state' then nullif(btrim(patch->>'state'), '') else a.state end,
    country             = coalesce(nullif(btrim(patch->>'country'), ''), a.country),
    postal_code         = case when patch ? 'postal_code' then nullif(btrim(patch->>'postal_code'), '') else a.postal_code end,

    representative_name        = case when patch ? 'representative_name' then nullif(btrim(patch->>'representative_name'), '') else a.representative_name end,
    representative_designation = case when patch ? 'representative_designation' then nullif(btrim(patch->>'representative_designation'), '') else a.representative_designation end,
    representative_email       = case when patch ? 'representative_email' then lower(nullif(btrim(patch->>'representative_email'), '')) else a.representative_email end,
    representative_phone       = case when patch ? 'representative_phone' then nullif(btrim(patch->>'representative_phone'), '') else a.representative_phone end,

    -- Newly writable. NULL is never accepted: the column is NOT NULL and losing
    -- it would strand the applicant with no way to receive a tracking code.
    applicant_email     = coalesce(lower(nullif(btrim(patch->>'applicant_email'), '')), a.applicant_email),

    estimated_student_count = case when patch ? 'estimated_student_count' then (patch->>'estimated_student_count')::int else a.estimated_student_count end,
    estimated_teacher_count = case when patch ? 'estimated_teacher_count' then (patch->>'estimated_teacher_count')::int else a.estimated_teacher_count end,
    departments      = case when patch ? 'departments' then array(select jsonb_array_elements_text(patch->'departments')) else a.departments end,
    programs         = case when patch ? 'programs' then array(select jsonb_array_elements_text(patch->'programs')) else a.programs end,
    specializations  = case when patch ? 'specializations' then array(select jsonb_array_elements_text(patch->'specializations')) else a.specializations end,
    aerospace_relevance = case when patch ? 'aerospace_relevance' then nullif(btrim(patch->>'aerospace_relevance'), '') else a.aerospace_relevance end
  where a.id = application_id
    and a.draft_token_hash = token_hash
    and a.deleted_at is null
    and a.status in ('DRAFT', 'DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED');

  get diagnostics updated = row_count;
  return updated > 0;
end;
$$;

revoke execute on function public.public_save_application(uuid, text, jsonb) from public;
grant execute on function public.public_save_application(uuid, text, jsonb)
  to anon, authenticated, service_role;
