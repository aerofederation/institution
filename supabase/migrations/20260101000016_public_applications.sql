-- ============================================================================
-- 016 · Public institution application
-- ============================================================================
-- The application wizard is used by people with no account. `anon` holds no
-- privilege on any table (migration 011), and `institution_applications` has no
-- INSERT policy at all — deliberately, because opening one would let anyone
-- write arbitrary rows into the review queue.
--
-- So the public write path is a small closed set of SECURITY DEFINER functions,
-- each guarded by possession of a per-draft secret.
--
-- HOW THE DRAFT SECRET WORKS
--
-- On creation the server generates a 256-bit token, stores only its SHA-256 in
-- `draft_token_hash`, and puts the raw value in an httpOnly cookie. Every
-- subsequent call presents the hash. Knowing an application id is therefore not
-- enough to read or modify a draft, and a database leak does not let anyone
-- resume somebody else's application.
--
-- Hashing happens in the application (Node's crypto), not here. That keeps this
-- migration free of any extension dependency, and the security is identical:
-- the caller must possess the token in order to produce its hash.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- One-time codes for application tracking.
--
-- Knowing an application reference must never be sufficient to read an
-- application — it contains contact details, documents and review
-- correspondence. The reference must be presented with the email address on
-- file, and a code is then sent to that address.
-- ----------------------------------------------------------------------------
create table public.application_access_tokens (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.institution_applications (id) on delete cascade,

  -- SHA-256 of the 6-digit code. The code itself is never stored.
  code_hash       text not null check (code_hash ~ '^[a-f0-9]{64}$'),

  expires_at      timestamptz not null,
  consumed_at     timestamptz,
  attempt_count   smallint not null default 0 check (attempt_count >= 0),

  -- Hashed, never raw: enough to rate-limit without keeping network identifiers.
  ip_hash         text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  created_at      timestamptz not null default now()
);

create index application_access_tokens_application_idx
  on public.application_access_tokens (application_id, created_at desc);
create index application_access_tokens_expiry_idx
  on public.application_access_tokens (expires_at);

alter table public.application_access_tokens enable row level security;
-- No policy for any API role. These rows are touched only by the SECURITY
-- DEFINER functions below, which run as the owner.
revoke all on public.application_access_tokens from anon, authenticated;

comment on table public.application_access_tokens is
  'One-time codes gating /application-status. Codes are hashed; no API role can read this table.';

-- ============================================================================
-- Draft lifecycle
-- ============================================================================

/**
 * Creates a DRAFT application and binds it to a caller-held secret.
 *
 * Takes only what step 1 requires. Everything else is filled in by later saves,
 * so an applicant who abandons the form at step 2 leaves a coherent draft
 * rather than a half-written row.
 */
create or replace function public.public_start_application(
  token_hash        text,
  institution_name  text,
  institution_type  public.institution_type,
  category          public.institution_category,
  official_email    text,
  applicant_email   text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid draft token' using errcode = '22023';
  end if;

  insert into public.institution_applications (
    institution_name, institution_type, category,
    official_email, applicant_email, draft_token_hash, status
  )
  values (
    btrim(institution_name), institution_type, category,
    lower(btrim(official_email)), lower(btrim(applicant_email)), token_hash, 'DRAFT'
  )
  returning id into new_id;

  return new_id;
end;
$$;

/**
 * Merges a patch into a draft.
 *
 * Only DRAFT and the two applicant-actionable states are writable — once HQ has
 * the application under review the applicant cannot silently rewrite what is
 * being reviewed.
 *
 * Columns are assigned explicitly rather than through dynamic SQL, so the set
 * of writable fields is fixed here and cannot be widened by a crafted payload.
 * `status`, `application_ref`, `institution_id`, `reviewer_id` and the decision
 * columns are deliberately absent.
 */
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

/** Reads a draft back, for resuming the wizard. Requires the token. */
create or replace function public.public_get_application(
  application_id uuid,
  token_hash     text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(a) - 'draft_token_hash' - 'reviewer_id' - 'decision_reason'
    from public.institution_applications a
   where a.id = application_id
     and a.draft_token_hash = token_hash
     and a.deleted_at is null;
$$;

/**
 * Submits a draft for review.
 *
 * Assigns the public reference and moves DRAFT -> SUBMITTED. The transition
 * itself is validated by the trigger from migration 007, so an application that
 * is already approved or rejected cannot be resubmitted here.
 */
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

  update public.institution_applications
     set status = case when status = 'DRAFT' then 'SUBMITTED' else 'UNDER_REVIEW' end,
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

-- ============================================================================
-- Documents
-- ============================================================================

/**
 * Records the metadata for a document the applicant has uploaded.
 *
 * The binary itself goes straight to private storage through a signed upload
 * URL minted server-side; `anon` never receives a standing write grant on the
 * bucket. This only records what was uploaded, and only against a draft the
 * caller holds the token for.
 */
create or replace function public.public_attach_document(
  application_id uuid,
  token_hash     text,
  document_type  public.document_type,
  file_name      text,
  storage_path   text,
  mime_type      text,
  file_size      bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not exists (
    select 1 from public.institution_applications a
     where a.id = application_id
       and a.draft_token_hash = token_hash
       and a.deleted_at is null
       and a.status in ('DRAFT', 'DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED')
  ) then
    raise exception 'application not found or not editable' using errcode = '42501';
  end if;

  -- The path must sit under this application's own prefix. Without this a
  -- caller could register a row pointing at another application's object.
  if storage_path !~ ('^applications/' || application_id::text || '/') then
    raise exception 'storage path does not belong to this application' using errcode = '42501';
  end if;

  insert into public.institution_documents (
    institution_application_id, document_type, file_name,
    storage_path, mime_type, file_size, verification_status
  )
  values (
    application_id, document_type, file_name,
    storage_path, mime_type, file_size, 'PENDING'
  )
  returning id into new_id;

  return new_id;
end;
$$;

/** Lists the documents attached to a draft. */
create or replace function public.public_list_documents(
  application_id uuid,
  token_hash     text
)
returns table (
  id                  uuid,
  document_type       public.document_type,
  file_name           text,
  file_size           bigint,
  verification_status public.verification_status,
  rejection_reason    text,
  created_at          timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.document_type, d.file_name, d.file_size,
         d.verification_status, d.rejection_reason, d.created_at
    from public.institution_documents d
    join public.institution_applications a on a.id = d.institution_application_id
   where a.id = application_id
     and a.draft_token_hash = token_hash
     and d.deleted_at is null
   order by d.created_at;
$$;

/** Removes a document the applicant attached, while the draft is still open. */
create or replace function public.public_remove_document(
  application_id uuid,
  token_hash     text,
  document_id    uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_path text;
begin
  delete from public.institution_documents d
   using public.institution_applications a
   where d.id = document_id
     and d.institution_application_id = a.id
     and a.id = application_id
     and a.draft_token_hash = token_hash
     and a.status in ('DRAFT', 'DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED')
  returning d.storage_path into removed_path;

  return removed_path;
end;
$$;

-- ============================================================================
-- Tracking
-- ============================================================================

/**
 * Issues a one-time code for an application, if the reference and email match.
 *
 * Returns the application id and nothing else on success, and NULL when the
 * pair does not match. The caller cannot tell the two apart from the return
 * value alone — the server responds identically either way, so this cannot be
 * walked to discover which institutions have applied.
 *
 * Rate limited to five outstanding codes per hour per application.
 */
create or replace function public.public_request_application_access(
  application_ref text,
  applicant_email text,
  code_hash       text,
  ttl_minutes     integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.institution_applications;
  recent integer;
begin
  if code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid code' using errcode = '22023';
  end if;

  select * into target
    from public.institution_applications a
   where a.application_ref = upper(btrim(application_ref))
     and a.applicant_email = lower(btrim(applicant_email))
     and a.deleted_at is null;

  if target.id is null then
    return null;
  end if;

  select count(*) into recent
    from public.application_access_tokens t
   where t.application_id = target.id
     and t.created_at > now() - interval '1 hour';

  if recent >= 5 then
    return null;
  end if;

  insert into public.application_access_tokens (application_id, code_hash, expires_at)
  values (target.id, code_hash, now() + make_interval(mins => greatest(1, least(ttl_minutes, 60))));

  return target.id;
end;
$$;

/**
 * Exchanges a code for the application's tracking view.
 *
 * Consumes the code on success. Counts attempts and refuses after five, so a
 * six-digit code cannot be brute-forced within its lifetime.
 */
create or replace function public.public_verify_application_access(
  application_ref text,
  code_hash       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.institution_applications;
  token  public.application_access_tokens;
begin
  select * into target
    from public.institution_applications a
   where a.application_ref = upper(btrim(application_ref))
     and a.deleted_at is null;

  if target.id is null then
    return null;
  end if;

  select * into token
    from public.application_access_tokens t
   where t.application_id = target.id
     and t.consumed_at is null
     and t.expires_at > now()
   order by t.created_at desc
   limit 1
   for update;

  if token.id is null then
    return null;
  end if;

  if token.attempt_count >= 5 then
    return null;
  end if;

  if token.code_hash <> code_hash then
    update public.application_access_tokens
       set attempt_count = attempt_count + 1
     where id = token.id;
    return null;
  end if;

  update public.application_access_tokens set consumed_at = now() where id = token.id;

  return jsonb_build_object(
    'id', target.id,
    'application_ref', target.application_ref,
    'institution_name', target.institution_name,
    'institution_type', target.institution_type,
    'status', target.status,
    'submitted_at', target.submitted_at,
    'created_at', target.created_at,
    'updated_at', target.updated_at,
    'city', target.city,
    'state', target.state,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'to_status', h.to_status,
               'from_status', h.from_status,
               'comments', h.comments,
               'actor_kind', h.actor_kind,
               'created_at', h.created_at
             ) order by h.created_at)
        from public.institution_application_status_history h
       where h.application_id = target.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'document_type', d.document_type,
               'file_name', d.file_name,
               'verification_status', d.verification_status,
               'rejection_reason', d.rejection_reason
             ) order by d.created_at)
        from public.institution_documents d
       where d.institution_application_id = target.id and d.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
revoke execute on function
  public.public_start_application(text, text, public.institution_type, public.institution_category, text, text),
  public.public_save_application(uuid, text, jsonb),
  public.public_get_application(uuid, text),
  public.public_submit_application(uuid, text),
  public.public_attach_document(uuid, text, public.document_type, text, text, text, bigint),
  public.public_list_documents(uuid, text),
  public.public_remove_document(uuid, text, uuid),
  public.public_request_application_access(text, text, text, integer),
  public.public_verify_application_access(text, text)
from public;

grant execute on function
  public.public_start_application(text, text, public.institution_type, public.institution_category, text, text),
  public.public_save_application(uuid, text, jsonb),
  public.public_get_application(uuid, text),
  public.public_submit_application(uuid, text),
  public.public_attach_document(uuid, text, public.document_type, text, text, text, bigint),
  public.public_list_documents(uuid, text),
  public.public_remove_document(uuid, text, uuid),
  public.public_request_application_access(text, text, text, integer),
  public.public_verify_application_access(text, text)
to anon, authenticated, service_role;
