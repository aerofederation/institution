-- ============================================================================
-- 029 · The assessment engine
-- ============================================================================
-- Extends the tables migration 020 created. Nothing is dropped or replaced:
-- `assessments`, `assessment_questions`, `assessment_options`,
-- `assessment_attempts` and `assessment_answers` keep their identity, their
-- data, their foreign keys and their existing policies, and gain what a full
-- examination engine needs.
--
-- Four ideas do most of the work here.
--
-- 1. **Status is a state machine, not a flag.** `is_published` stays, backing
--    the existing policies so nothing that reads it changes behaviour, and is
--    now derived from `status` by trigger. Illegal transitions are refused in
--    the database.
--
-- 2. **An attempt owns its paper.** `assessment_attempts.question_set` records
--    the exact question ids, in the exact order, that were served to that
--    student. Randomisation, question pools and later edits to the assessment
--    therefore cannot change what a submitted attempt was marked against.
--
-- 3. **Grading rules live with the question.** Tolerance, accepted answers,
--    case sensitivity and partial credit are columns, not conventions, so the
--    marking function reads them rather than guessing.
--
-- 4. **The question bank is a source, not a link.** Adding a bank question to
--    an assessment copies it. Editing the bank afterwards cannot alter a paper
--    students have already sat.
-- ============================================================================

-- ── Sections ────────────────────────────────────────────────────────────────

create table public.assessment_sections (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  assessment_id     uuid not null,

  position          integer not null check (position >= 0),
  title             text not null check (length(btrim(title)) between 1 and 150),
  instructions      text check (instructions is null or length(instructions) <= 5000),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint sections_position_uk unique (assessment_id, position),
  constraint assessment_sections_id_institution_uk unique (id, institution_id),
  constraint assessment_sections_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.assessments (id, institution_id) on delete cascade
);

create index assessment_sections_assessment_idx
  on public.assessment_sections (assessment_id, position);

comment on table public.assessment_sections is
  'Optional grouping within a paper — Section A multiple choice, Section B essay.';

-- ── The assessment gains a lifecycle and a rulebook ─────────────────────────

alter table public.assessments
  add column status public.assessment_status not null default 'DRAFT',

  -- Marking
  add column total_marks       numeric(8, 2),
  add column negative_marking  boolean not null default false,

  -- Attempts
  add column attempt_scoring   public.attempt_scoring not null default 'HIGHEST',

  -- Results
  add column release_policy    public.result_release not null default 'AFTER_GRADING',
  add column results_released_at timestamptz,

  -- Availability
  add column allow_late        boolean not null default false,
  add column grace_minutes     smallint not null default 0
      check (grace_minutes between 0 and 180),
  add column late_penalty_percent numeric(5, 2) not null default 0
      check (late_penalty_percent between 0 and 100),

  -- Delivery
  add column shuffle_options   boolean not null default false,
  /*
   * A question pool. NULL means "serve every question". A number means "draw
   * this many at random", which is why the drawn set must be recorded per
   * attempt — see `question_set` below.
   */
  add column questions_to_serve smallint
      check (questions_to_serve is null or questions_to_serve > 0),
  add column allow_pause       boolean not null default false,

  -- Presentation
  add column difficulty        text
      check (difficulty is null or difficulty in ('EASY', 'MODERATE', 'HARD')),
  add column tags              text[] not null default '{}',
  add column learning_objectives text[] not null default '{}',
  add column cover_path        text,

  /*
   * Bumped whenever a published paper is edited in a way that changes what a
   * student would see. Attempts record the version they were served, so a
   * result always says which paper it was a result for.
   */
  add column version           integer not null default 1,

  add column archived_at       timestamptz;

comment on column public.assessments.status is
  'The lifecycle. `is_published` is derived from it by trigger and kept only so the policies written in 021 continue to work unchanged.';

/*
 * Existing rows predate the column. A published quiz is PUBLISHED; an
 * unpublished one is DRAFT. Done as an UPDATE rather than a clever default so
 * the intent is legible.
 */
update public.assessments
   set status = case when is_published then 'PUBLISHED'::public.assessment_status
                     else 'DRAFT'::public.assessment_status end;

-- ── Questions gain their marking rules ──────────────────────────────────────

alter table public.assessment_questions
  add column section_id      uuid,
  add column negative_marks  numeric(6, 2) not null default 0
      check (negative_marks >= 0),
  /*
   * Awards a proportion of the marks for a partly correct MULTI_CHOICE,
   * MATCHING or ORDERING answer. Off by default: a teacher who has not thought
   * about it should get the strict behaviour, which is what the engine did
   * before this migration existed.
   */
  add column allow_partial_credit boolean not null default false,

  -- SHORT_ANSWER and FILL_BLANK
  add column accepted_answers text[] not null default '{}',
  add column case_sensitive   boolean not null default false,
  add column trim_whitespace  boolean not null default true,

  -- NUMERICAL
  add column numeric_answer   numeric,
  add column numeric_tolerance numeric check (numeric_tolerance is null or numeric_tolerance >= 0),
  add column numeric_unit     text check (numeric_unit is null or length(numeric_unit) <= 32),

  -- FILE_UPLOAD
  add column allowed_mime_types text[] not null default '{}',
  add column max_file_bytes   bigint
      check (max_file_bytes is null or max_file_bytes between 1 and 104857600),

  -- Any type may carry an image or a passage.
  add column media_path       text,
  add column media_mime_type  text,
  add column passage          text check (passage is null or length(passage) <= 20000),

  -- Classification, for the bank and for analytics
  add column difficulty       text
      check (difficulty is null or difficulty in ('EASY', 'MODERATE', 'HARD')),
  add column topic            text check (topic is null or length(topic) <= 150),
  add column learning_objective text check (learning_objective is null or length(learning_objective) <= 300),

  /** Where this came from, if it was copied out of the bank. Provenance only. */
  add column source_bank_id   uuid,

  add constraint questions_section_fk
    foreign key (section_id, institution_id)
    references public.assessment_sections (id, institution_id) on delete set null;

/*
 * A numerical question is unanswerable without an answer to compare against,
 * and a tolerance of NULL is not the same as zero. Enforced rather than
 * assumed, because the marking function divides the world by question type.
 */
alter table public.assessment_questions
  add constraint questions_numeric_coherent check (
    question_type <> 'NUMERICAL' or numeric_answer is not null
  );

-- ── Options gain what matching and ordering need ────────────────────────────

alter table public.assessment_options
  /*
   * MATCHING stores the right-hand item here; the left-hand item is `label`.
   * ORDERING ignores it and uses `position` as the correct sequence. Reusing
   * this table rather than adding two more keeps one answer key in one place.
   */
  add column match_label text check (match_label is null or length(btrim(match_label)) between 1 and 1000),
  add column media_path  text;

-- ── Attempts own their paper and their clock ────────────────────────────────

alter table public.assessment_attempts
  /*
   * The exact questions served to this attempt, in the order served.
   *
   * This is what makes randomisation and question pools reproducible. Without
   * it, re-reading a submitted attempt after the assessment was edited would
   * show a different paper than the one that was marked — and a random draw
   * would be redrawn on every page load.
   */
  add column question_set uuid[] not null default '{}',

  /** Which version of the paper this attempt was served. */
  add column assessment_version integer not null default 1,

  -- Pausing, when the teacher allows it.
  add column paused_at    timestamptz,
  add column paused_ms    bigint not null default 0 check (paused_ms >= 0),

  -- Marking outcome, separate from the raw score.
  add column percentage   numeric(5, 2),
  add column passed       boolean,
  add column is_late      boolean not null default false,
  add column penalty_applied numeric(6, 2) not null default 0,

  /** Set when the student may see the result, per the release policy. */
  add column released_at  timestamptz,

  /** Which questions still need a person. Maintained by the marking function. */
  add column awaiting_manual integer not null default 0 check (awaiting_manual >= 0),

  -- The student's own view of where they are, so a refresh restores it.
  add column marked_for_review uuid[] not null default '{}',
  add column last_seen_at timestamptz;

-- ── Answers carry structured payloads ───────────────────────────────────────

alter table public.assessment_answers
  /*
   * MATCHING and ORDERING answers are not a set of option ids and not text.
   * They are a structure, so they go in jsonb rather than being encoded into a
   * string that the marking function would have to parse.
   */
  add column answer_payload jsonb not null default '{}'::jsonb
      check (jsonb_typeof(answer_payload) = 'object'),

  -- FILE_UPLOAD
  add column storage_path text,
  add column file_name    text,
  add column file_size    bigint check (file_size is null or file_size between 1 and 104857600),
  add column mime_type    text,

  add column feedback     text check (feedback is null or length(feedback) <= 5000),
  add column graded_by    uuid,
  add column graded_at    timestamptz,

  /** How long the student spent on this question, from the server's clock. */
  add column time_spent_ms bigint check (time_spent_ms is null or time_spent_ms >= 0);

-- ── The question bank ───────────────────────────────────────────────────────

create table public.question_bank_items (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  /*
   * Owned by the teacher who wrote it, on the same rule as everything else in
   * this area: one teacher's bank is not another's.
   */
  teacher_id        uuid not null,

  subject_id        uuid,
  question_type     public.question_type not null default 'SINGLE_CHOICE',
  prompt            text not null check (length(btrim(prompt)) between 1 and 5000),
  passage           text check (passage is null or length(passage) <= 20000),
  marks             numeric(6, 2) not null default 1 check (marks > 0 and marks <= 1000),
  negative_marks    numeric(6, 2) not null default 0 check (negative_marks >= 0),
  explanation       text check (explanation is null or length(explanation) <= 5000),

  allow_partial_credit boolean not null default false,
  accepted_answers  text[] not null default '{}',
  case_sensitive    boolean not null default false,
  trim_whitespace   boolean not null default true,
  numeric_answer    numeric,
  numeric_tolerance numeric check (numeric_tolerance is null or numeric_tolerance >= 0),
  numeric_unit      text,
  allowed_mime_types text[] not null default '{}',
  max_file_bytes    bigint,

  media_path        text,
  media_mime_type   text,

  difficulty        text check (difficulty is null or difficulty in ('EASY', 'MODERATE', 'HARD')),
  topic             text check (topic is null or length(topic) <= 150),
  learning_objective text check (learning_objective is null or length(learning_objective) <= 300),
  tags              text[] not null default '{}',

  /** How many times it has been copied into an assessment. Usage, not a link. */
  times_used        integer not null default 0 check (times_used >= 0),

  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint question_bank_id_institution_uk unique (id, institution_id),
  constraint question_bank_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint question_bank_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete set null
);

comment on table public.question_bank_items is
  'Reusable questions. Adding one to an assessment COPIES it — editing the bank afterwards never alters a paper students have sat.';

create index question_bank_owner_idx
  on public.question_bank_items (teacher_id, created_at desc) where archived_at is null;
create index question_bank_filter_idx
  on public.question_bank_items (institution_id, subject_id, question_type, difficulty)
  where archived_at is null;

create table public.question_bank_options (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  bank_item_id   uuid not null,

  position       integer not null check (position >= 0),
  label          text not null check (length(btrim(label)) between 1 and 1000),
  match_label    text,
  is_correct     boolean not null default false,

  created_at     timestamptz not null default now(),

  constraint bank_options_position_uk unique (bank_item_id, position),
  constraint question_bank_options_id_institution_uk unique (id, institution_id),
  constraint bank_options_item_fk
    foreign key (bank_item_id, institution_id)
    references public.question_bank_items (id, institution_id) on delete cascade
);

create index bank_options_item_idx on public.question_bank_options (bank_item_id, position);

-- ── Integrity events ────────────────────────────────────────────────────────

create table public.assessment_integrity_events (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  attempt_id     uuid not null,

  event          public.integrity_event not null,
  /*
   * Deliberately small. There is no screenshot, no keystroke log, no camera and
   * no device fingerprint: none of that is needed to tell a teacher "this
   * attempt left the tab nine times", and collecting it would be a far larger
   * intrusion than the question warrants.
   */
  occurred_at    timestamptz not null default now(),
  detail         text check (detail is null or length(detail) <= 200),

  constraint integrity_events_id_institution_uk unique (id, institution_id),
  constraint integrity_attempt_fk
    foreign key (attempt_id, institution_id)
    references public.assessment_attempts (id, institution_id) on delete cascade
);

create index integrity_attempt_idx on public.assessment_integrity_events (attempt_id, occurred_at);

comment on table public.assessment_integrity_events is
  'What the browser reported during an attempt. Context for a teacher; not a cheating prevention mechanism, and must never be described as one.';

-- ── Grade revisions ─────────────────────────────────────────────────────────

create table public.assessment_grade_revisions (
  id             uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions (id) on delete cascade,
  attempt_id     uuid not null,

  previous_score numeric(8, 2),
  new_score      numeric(8, 2),
  reason         text check (reason is null or length(reason) <= 1000),
  revised_by     uuid,
  revised_at     timestamptz not null default now(),

  constraint grade_revisions_id_institution_uk unique (id, institution_id),
  constraint grade_revisions_attempt_fk
    foreign key (attempt_id, institution_id)
    references public.assessment_attempts (id, institution_id) on delete cascade
);

comment on table public.assessment_grade_revisions is
  'A released result is not silently rewritten. Changing a mark after release records what it was, what it became and why.';

create index grade_revisions_attempt_idx
  on public.assessment_grade_revisions (attempt_id, revised_at desc);

-- ── The status state machine ────────────────────────────────────────────────

create or replace function private.assessment_transition_allowed(
  old_status public.assessment_status,
  new_status public.assessment_status
)
returns boolean
language sql
immutable
as $$
  select case old_status
    when 'DRAFT'     then new_status in ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED')
    when 'SCHEDULED' then new_status in ('SCHEDULED', 'DRAFT', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'ARCHIVED')
    when 'PUBLISHED' then new_status in ('PUBLISHED', 'ACTIVE', 'CLOSED', 'DRAFT', 'ARCHIVED')
    when 'ACTIVE'    then new_status in ('ACTIVE', 'CLOSED', 'ARCHIVED')
    when 'CLOSED'    then new_status in ('CLOSED', 'GRADING', 'COMPLETED', 'ARCHIVED')
    when 'GRADING'   then new_status in ('GRADING', 'COMPLETED', 'CLOSED', 'ARCHIVED')
    when 'COMPLETED' then new_status in ('COMPLETED', 'ARCHIVED', 'GRADING')
    when 'ARCHIVED'  then new_status in ('ARCHIVED', 'DRAFT')
  end;
$$;

comment on function private.assessment_transition_allowed(public.assessment_status, public.assessment_status) is
  'The legal moves. DRAFT can go back from PUBLISHED so a teacher can take a paper down and fix it; nothing can go back from CLOSED to open, because students would have sat different papers.';

create or replace function private.enforce_assessment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if not private.assessment_transition_allowed(old.status, new.status) then
      raise exception 'cannot move an assessment from % to %', old.status, new.status
        using errcode = '23514';
    end if;

    /*
     * Taking a live paper back to DRAFT is refused once anybody has started it.
     * Editing underneath a student mid-attempt is the thing versioning exists to
     * prevent, and the cheapest place to prevent it is here.
     */
    if new.status = 'DRAFT' and old.status <> 'ARCHIVED' and exists (
      select 1 from public.assessment_attempts t where t.assessment_id = new.id
    ) then
      raise exception 'this paper has been started by a student and cannot return to draft'
        using errcode = '23514';
    end if;

    if new.status = 'ARCHIVED' and new.archived_at is null then
      new.archived_at := now();
    end if;
  end if;

  /*
   * `is_published` is derived, never set by hand. Every policy written in
   * migration 021 reads it, so keeping it in step with `status` is what allows
   * this migration to add a lifecycle without rewriting that RLS.
   */
  new.is_published := new.status in ('SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'GRADING', 'COMPLETED');

  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;

  if not new.is_published then
    new.published_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists assessments_enforce_status on public.assessments;
create trigger assessments_enforce_status
  before update on public.assessments
  for each row execute function private.enforce_assessment_status();

/*
 * The same derivation on insert, so a paper created directly as PUBLISHED is
 * consistent from its first row.
 */
create or replace function private.derive_assessment_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.is_published := new.status in ('SCHEDULED', 'PUBLISHED', 'ACTIVE', 'CLOSED', 'GRADING', 'COMPLETED');
  if new.is_published and new.published_at is null then
    new.published_at := now();
  end if;
  if not new.is_published then
    new.published_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists assessments_derive_publication on public.assessments;
create trigger assessments_derive_publication
  before insert on public.assessments
  for each row execute function private.derive_assessment_publication();

-- ── Triggers on the new tables ──────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'assessment_sections', 'question_bank_items'
  ]
  loop
    execute format(
      'create trigger %1$s_set_updated_at before update on public.%1$I
         for each row execute function private.set_updated_at()', t);
    execute format(
      'create trigger %1$s_freeze_institution before update on public.%1$I
         for each row execute function private.freeze_institution_id()', t);
  end loop;
end $$;

create trigger question_bank_options_freeze_institution
  before update on public.question_bank_options
  for each row execute function private.freeze_institution_id();

-- ── RLS on, policies in 030 ─────────────────────────────────────────────────

alter table public.assessment_sections           enable row level security;
alter table public.question_bank_items           enable row level security;
alter table public.question_bank_options         enable row level security;
alter table public.assessment_integrity_events   enable row level security;
alter table public.assessment_grade_revisions    enable row level security;

/*
 * Supabase's default privileges hand `anon` everything on a newly created table.
 * Migration 023 revoked that and changed the default, but the revoke is
 * repeated here rather than trusted: the cost is one statement, and the failure
 * mode it guards against is an answer key readable without a session.
 */
revoke all on public.assessment_sections         from anon;
revoke all on public.question_bank_items         from anon;
revoke all on public.question_bank_options       from anon;
revoke all on public.assessment_integrity_events from anon;
revoke all on public.assessment_grade_revisions  from anon;
