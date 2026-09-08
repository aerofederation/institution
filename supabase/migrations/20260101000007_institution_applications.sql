-- ============================================================================
-- 007 · Institution applications, status history and document metadata
-- ============================================================================
-- An application is created by an anonymous applicant — no account exists yet,
-- and none is created until HQ approves. That shapes several columns here:
-- uploaders and history actors are nullable, and the draft is protected by a
-- token hash rather than by a session.
-- ============================================================================

create table public.institution_applications (
  id                      uuid primary key default gen_random_uuid(),

  -- Public identifier, separate from the primary key by design. The UUID is
  -- internal and never shown; this is what the applicant quotes. Random rather
  -- than sequential, so it discloses nothing about volume or ordering and
  -- cannot be walked.
  application_ref         text not null unique default private.generate_application_ref()
                          check (application_ref ~ '^AFI-[0-9]{4}-[0-9A-HJ-NP-TV-Z]{8}$'),

  status                  public.application_status not null default 'DRAFT',

  -- ── Step 1 · Organization ────────────────────────────────────────────────
  institution_name        text not null check (length(btrim(institution_name)) between 2 and 200),
  institution_type        public.institution_type not null,
  category                public.institution_category not null,
  official_email          public.email_address not null,
  official_phone          text check (official_phone is null or official_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  website                 text check (website is null or website ~* '^https?://'),
  year_established        smallint check (year_established is null or year_established between 1800 and extract(year from now())::smallint),
  registration_number     text,
  description             text check (description is null or length(description) <= 5000),
  field_of_work           text check (field_of_work is null or length(field_of_work) <= 300),

  -- ── Step 2 · Address ─────────────────────────────────────────────────────
  address_line            text,
  city                    text,
  state                   text,
  country                 text not null default 'India',
  postal_code             text,

  -- ── Step 3 · Authorized representative ───────────────────────────────────
  representative_name         text check (representative_name is null or length(btrim(representative_name)) between 2 and 150),
  representative_designation  text,
  representative_email        public.email_address,
  representative_phone        text check (representative_phone is null or representative_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),

  -- ── Step 4 · Institution detail ──────────────────────────────────────────
  estimated_student_count int check (estimated_student_count is null or estimated_student_count between 0 and 1000000),
  estimated_teacher_count int check (estimated_teacher_count is null or estimated_teacher_count between 0 and 100000),
  departments             text[] not null default '{}',
  programs                text[] not null default '{}',
  specializations         text[] not null default '{}',
  aerospace_relevance     text check (aerospace_relevance is null or length(aerospace_relevance) <= 3000),

  -- ── Tracking and review ──────────────────────────────────────────────────
  -- The address the applicant uses to track the application. Kept separate from
  -- official_email and representative_email so a change to either does not
  -- silently move where tracking codes are delivered.
  applicant_email         public.email_address not null,

  -- SHA-256 of the anonymous draft cookie. The raw token is never stored, so a
  -- database read does not let anyone resume somebody else's draft.
  draft_token_hash        text check (draft_token_hash is null or draft_token_hash ~ '^[a-f0-9]{64}$'),

  submitted_at            timestamptz,
  review_started_at       timestamptz,
  reviewer_id             uuid references public.profiles (id) on delete set null,
  decided_at              timestamptz,
  decision_reason         text,

  -- Set when the application is approved and the tenant is provisioned.
  institution_id          uuid references public.institutions (id) on delete set null,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz,

  -- Status and evidence cannot drift apart.
  constraint applications_submitted_coherent check (
    status = 'DRAFT' or submitted_at is not null
  ),
  constraint applications_approved_coherent check (
    status <> 'APPROVED' or (institution_id is not null and decided_at is not null)
  ),
  constraint applications_rejected_coherent check (
    status <> 'REJECTED' or (decided_at is not null and decision_reason is not null)
  ),
  -- Target for the composite foreign key from documents, so a document can
  -- never be attached to one application while claiming another's tenant.
  constraint applications_id_institution_uk unique (id, institution_id)
);

comment on table public.institution_applications is
  'Institution onboarding applications. Created anonymously; no account exists until approval.';
comment on column public.institution_applications.application_ref is
  'Public reference (AFI-YYYY-XXXXXXXX). Deliberately decoupled from the UUID primary key and non-sequential.';
comment on column public.institution_applications.draft_token_hash is
  'SHA-256 of the anonymous draft cookie. Knowing the reference alone never grants access.';

create index applications_status_idx on public.institution_applications (status, created_at desc) where deleted_at is null;
create index applications_applicant_email_idx on public.institution_applications (applicant_email);
create index applications_reviewer_idx on public.institution_applications (reviewer_id) where reviewer_id is not null;
create index applications_institution_idx on public.institution_applications (institution_id) where institution_id is not null;
create index applications_name_idx on public.institution_applications (lower(institution_name));

create trigger applications_set_updated_at
  before update on public.institution_applications
  for each row execute function private.set_updated_at();

-- Close the cycle from migration 004.
alter table public.institutions
  add constraint institutions_source_application_fk
    foreign key (source_application_id)
    references public.institution_applications (id) on delete set null;

-- ============================================================================
-- Status history — every transition is traceable
-- ============================================================================

create table public.institution_application_status_history (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.institution_applications (id) on delete cascade,

  from_status     public.application_status,   -- NULL for the row recording creation
  to_status       public.application_status not null,

  -- NULL when the actor is the anonymous applicant.
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_kind      text not null default 'SYSTEM'
                  check (actor_kind in ('APPLICANT', 'HQ', 'SYSTEM')),

  comments          text check (comments is null or length(comments) <= 4000),
  required_actions  jsonb not null default '[]'::jsonb,

  created_at      timestamptz not null default now()
);

comment on table public.institution_application_status_history is
  'Append-only transition log. Written by trigger so a transition cannot happen untraced.';

create index application_history_application_idx
  on public.institution_application_status_history (application_id, created_at desc);

-- ----------------------------------------------------------------------------
-- The state machine, enforced in the database
-- ----------------------------------------------------------------------------
create or replace function private.application_transition_allowed(
  from_status public.application_status,
  to_status   public.application_status
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select case from_status
    when 'DRAFT'                  then to_status in ('SUBMITTED')
    when 'SUBMITTED'              then to_status in ('UNDER_REVIEW', 'REJECTED')
    when 'UNDER_REVIEW'           then to_status in ('DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED', 'APPROVED', 'REJECTED')
    when 'DOCUMENTS_REQUIRED'     then to_status in ('UNDER_REVIEW', 'REJECTED')
    when 'RESUBMISSION_REQUIRED'  then to_status in ('UNDER_REVIEW', 'REJECTED')
    when 'APPROVED'               then to_status in ('SUSPENDED')
    when 'SUSPENDED'              then to_status in ('APPROVED')
    when 'REJECTED'               then false          -- terminal
    else false
  end;
$$;

comment on function private.application_transition_allowed(public.application_status, public.application_status) is
  'The single source of truth for legal application transitions. An illegal transition raises rather than silently succeeding.';

create or replace function private.enforce_application_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor       uuid := auth.uid();
  actor_role  text;
  actor_kind  text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not private.application_transition_allowed(old.status, new.status) then
    raise exception 'illegal application transition % -> %', old.status, new.status
      using errcode = '23514';
  end if;

  if actor is null then
    actor_kind := 'APPLICANT';
  else
    select p.role into actor_role from public.profiles p where p.id = actor;
    actor_kind := case when actor_role = 'HQ_ADMIN' then 'HQ' else 'APPLICANT' end;
  end if;

  insert into public.institution_application_status_history
    (application_id, from_status, to_status, actor_id, actor_kind, comments)
  values (
    new.id,
    old.status,
    new.status,
    actor,
    actor_kind,
    nullif(current_setting('afi.transition_comment', true), '')
  );

  return new;
end;
$$;

create trigger applications_enforce_transition
  before update of status on public.institution_applications
  for each row execute function private.enforce_application_transition();

-- Record creation so the history is complete from the first row.
create or replace function private.record_application_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.institution_application_status_history
    (application_id, from_status, to_status, actor_id, actor_kind)
  values (new.id, null, new.status, auth.uid(), case when auth.uid() is null then 'APPLICANT' else 'HQ' end);
  return new;
end;
$$;

create trigger applications_record_created
  after insert on public.institution_applications
  for each row execute function private.record_application_created();

-- ----------------------------------------------------------------------------
-- Transition entry point for the application layer.
--
-- SECURITY INVOKER so the caller's RLS still applies — this function is a
-- convenience for carrying the reviewer's comment into the trigger inside one
-- transaction, not an authorization bypass.
-- ----------------------------------------------------------------------------
create or replace function public.transition_application(
  target_id  uuid,
  new_status public.application_status,
  comments   text default null
)
returns public.institution_applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated public.institution_applications;
begin
  perform set_config('afi.transition_comment', coalesce(comments, ''), true);

  update public.institution_applications a
     set status            = new_status,
         reviewer_id       = case when new_status = 'UNDER_REVIEW' then auth.uid() else a.reviewer_id end,
         review_started_at = case when new_status = 'UNDER_REVIEW' and a.review_started_at is null
                                  then now() else a.review_started_at end,
         decided_at        = case when new_status in ('APPROVED', 'REJECTED') then now() else a.decided_at end,
         decision_reason   = case when new_status in ('APPROVED', 'REJECTED') then comments else a.decision_reason end,
         submitted_at      = case when new_status = 'SUBMITTED' and a.submitted_at is null
                                  then now() else a.submitted_at end
   where a.id = target_id
     and a.deleted_at is null
  returning * into updated;

  if updated.id is null then
    raise exception 'application not found or not accessible' using errcode = '42501';
  end if;

  return updated;
end;
$$;

revoke execute on function public.transition_application(uuid, public.application_status, text) from public, anon;
grant execute on function public.transition_application(uuid, public.application_status, text) to authenticated, service_role;

-- ============================================================================
-- Document metadata
--
-- Binaries live in Supabase Storage. This table holds only metadata, and the
-- storage_path is never rendered into a page — downloads go through a
-- short-lived signed URL minted after an authorization check.
-- ============================================================================

create table public.institution_documents (
  id                        uuid primary key default gen_random_uuid(),

  -- A document belongs to an application, to an institution, or to both once
  -- the application has been approved. At least one must be present.
  institution_application_id uuid references public.institution_applications (id) on delete cascade,
  institution_id            uuid references public.institutions (id) on delete cascade,

  -- NULL while the applicant is still anonymous and has no account.
  uploaded_by               uuid references public.profiles (id) on delete set null,

  document_type             public.document_type not null,
  file_name                 text not null check (length(btrim(file_name)) between 1 and 255),
  storage_path              text not null unique check (length(storage_path) between 3 and 1024),
  mime_type                 text not null check (
                              mime_type in (
                                'application/pdf',
                                'image/jpeg', 'image/png', 'image/webp',
                                'application/msword',
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                              )
                            ),
  file_size                 bigint not null check (file_size between 1 and 26214400),  -- 25 MiB
  checksum_sha256           text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  version                   integer not null default 1 check (version >= 1),

  verification_status       public.verification_status not null default 'PENDING',
  reviewer_id               uuid references public.profiles (id) on delete set null,
  reviewed_at               timestamptz,
  rejection_reason          text check (rejection_reason is null or length(rejection_reason) <= 2000),

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  deleted_at                timestamptz,

  constraint documents_have_an_owner check (
    institution_application_id is not null or institution_id is not null
  ),
  constraint documents_rejection_needs_reason check (
    verification_status <> 'REJECTED' or rejection_reason is not null
  ),
  constraint documents_review_coherent check (
    verification_status = 'PENDING' or (reviewer_id is not null and reviewed_at is not null)
  )
);

comment on table public.institution_documents is
  'Metadata only. Binaries are in Supabase Storage; storage_path is never exposed to a browser.';
comment on column public.institution_documents.file_size is
  'Bytes. Capped at 25 MiB, matching the storage upload policy.';

create index documents_application_idx on public.institution_documents (institution_application_id) where deleted_at is null;
create index documents_institution_idx on public.institution_documents (institution_id) where deleted_at is null;
create index documents_verification_idx on public.institution_documents (verification_status, created_at desc);
create index documents_type_idx on public.institution_documents (document_type);

create trigger documents_set_updated_at
  before update on public.institution_documents
  for each row execute function private.set_updated_at();
