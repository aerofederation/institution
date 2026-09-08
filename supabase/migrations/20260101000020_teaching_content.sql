-- ============================================================================
-- 020 · Teaching content: materials, assignments and assessments
-- ============================================================================
-- What a teacher actually does day to day: publish study material, set work and
-- mark it, and run quizzes and tests.
--
-- Two properties are structural rather than enforced by application code.
--
-- 1. **Ownership.** Every piece of content carries `teacher_id`, and the RLS in
--    migration 021 gates on it. One teacher cannot read, edit or grade
--    another's work, inside the same institution or outside it.
--
-- 2. **Reach.** Content is addressed to a class, and optionally a section. A
--    student sees it only when their ACTIVE enrolment matches. `section_id is
--    null` means "the whole class"; a section narrows it further. This is the
--    same shape `teacher_class_assignments` already uses, so a teacher can only
--    publish where they actually teach.
--
-- Every foreign key that crosses a tenant boundary is composite and carries
-- `institution_id`, so a class, subject or student from another institution
-- cannot be referenced even by a caller holding the service role — the
-- reference has nowhere to land.
-- ============================================================================

-- ── Enums ───────────────────────────────────────────────────────────────────

create type public.material_type as enum (
  'DOCUMENT',      -- uploaded file: PDF, slides, worksheet
  'LINK',          -- external resource
  'NOTE'           -- written directly in the app, no attachment
);

create type public.assessment_kind as enum (
  'QUIZ',          -- short, low stakes, usually auto-marked
  'TEST'           -- longer, graded, may carry a pass mark
);

create type public.question_type as enum (
  'SINGLE_CHOICE', -- exactly one correct option
  'MULTI_CHOICE',  -- one or more correct options, all required for the mark
  'TRUE_FALSE',
  'SHORT_ANSWER'   -- free text, marked by the teacher
);

create type public.attempt_status as enum (
  'IN_PROGRESS',
  'SUBMITTED',
  'GRADED',
  'ABANDONED'
);

create type public.submission_status as enum (
  'DRAFT',
  'SUBMITTED',
  'LATE',
  'GRADED',
  'RETURNED'      -- sent back for another attempt
);

-- ── Study materials ─────────────────────────────────────────────────────────

create table public.materials (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,

  -- The owning teacher. Not "created_by": ownership is the access rule, not an
  -- audit detail, so it is never nullable and never reassigned casually.
  teacher_id        uuid not null,

  class_id          uuid not null,
  -- NULL means the whole class; a value narrows delivery to one section.
  section_id        uuid,
  subject_id        uuid,
  academic_year_id  uuid not null,

  title             text not null check (length(btrim(title)) between 2 and 200),
  description       text check (description is null or length(description) <= 5000),
  material_type     public.material_type not null default 'DOCUMENT',

  -- Populated for DOCUMENT. The object lives under {institution_id}/... in the
  -- `learning-materials` bucket, which is what the storage policies key on.
  storage_path      text,
  file_name         text check (file_name is null or length(btrim(file_name)) between 1 and 255),
  file_size         bigint check (file_size is null or file_size between 1 and 209715200),
  mime_type         text,

  -- Populated for LINK.
  external_url      text check (external_url is null or external_url ~ '^https?://'),

  -- Unpublished content is a draft: the teacher sees it, students do not.
  is_published      boolean not null default false,
  published_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint materials_id_institution_uk unique (id, institution_id),

  -- The shape has to match the type, or the row describes nothing usable.
  constraint materials_payload_coherent check (
    (material_type = 'DOCUMENT' and storage_path is not null and file_name is not null)
    or (material_type = 'LINK' and external_url is not null)
    or (material_type = 'NOTE' and description is not null)
  ),
  constraint materials_published_coherent check (
    is_published = false or published_at is not null
  ),
  -- A section only means something inside its class.
  constraint materials_section_requires_class check (
    section_id is null or class_id is not null
  ),

  constraint materials_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint materials_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint materials_section_fk
    foreign key (section_id, institution_id)
    references public.sections (id, institution_id) on delete set null,
  constraint materials_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete set null,
  constraint materials_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade
);

comment on table public.materials is
  'Study material published by one teacher to one class, optionally narrowed to a section.';

create index materials_owner_idx on public.materials (teacher_id, created_at desc)
  where deleted_at is null;
create index materials_delivery_idx on public.materials (institution_id, class_id, section_id)
  where deleted_at is null and is_published;

-- ── Assignments ─────────────────────────────────────────────────────────────

create table public.assignments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  teacher_id        uuid not null,

  class_id          uuid not null,
  section_id        uuid,
  subject_id        uuid,
  academic_year_id  uuid not null,

  title             text not null check (length(btrim(title)) between 2 and 200),
  instructions      text check (instructions is null or length(instructions) <= 20000),

  max_marks         numeric(6, 2) not null default 100
                    check (max_marks > 0 and max_marks <= 1000),
  due_at            timestamptz not null,
  -- Whether a submission after `due_at` is accepted (and flagged LATE).
  allow_late        boolean not null default true,

  -- Optional brief or worksheet attached to the assignment itself.
  storage_path      text,
  file_name         text,
  file_size         bigint check (file_size is null or file_size between 1 and 104857600),
  mime_type         text,

  is_published      boolean not null default false,
  published_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint assignments_id_institution_uk unique (id, institution_id),
  constraint assignments_published_coherent check (
    is_published = false or published_at is not null
  ),
  constraint assignments_section_requires_class check (
    section_id is null or class_id is not null
  ),

  constraint assignments_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint assignments_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint assignments_section_fk
    foreign key (section_id, institution_id)
    references public.sections (id, institution_id) on delete set null,
  constraint assignments_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete set null,
  constraint assignments_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade
);

comment on table public.assignments is
  'Work set by one teacher to one class or section, submitted and marked in app.';

create index assignments_owner_idx on public.assignments (teacher_id, due_at desc)
  where deleted_at is null;
create index assignments_delivery_idx on public.assignments (institution_id, class_id, section_id)
  where deleted_at is null and is_published;

create table public.assignment_submissions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  assignment_id     uuid not null,
  student_id        uuid not null,

  response_text     text check (response_text is null or length(response_text) <= 20000),
  storage_path      text,
  file_name         text,
  file_size         bigint check (file_size is null or file_size between 1 and 104857600),
  mime_type         text,

  status            public.submission_status not null default 'DRAFT',
  submitted_at      timestamptz,

  marks             numeric(6, 2) check (marks is null or marks >= 0),
  feedback          text check (feedback is null or length(feedback) <= 5000),
  graded_by         uuid,
  graded_at         timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- One submission row per student per assignment; resubmission updates it.
  constraint submissions_unique_uk unique (assignment_id, student_id),
  constraint submissions_id_institution_uk unique (id, institution_id),
  constraint submissions_submitted_coherent check (
    status = 'DRAFT' or submitted_at is not null
  ),
  constraint submissions_graded_coherent check (
    status <> 'GRADED' or (marks is not null and graded_by is not null and graded_at is not null)
  ),

  constraint submissions_assignment_fk
    foreign key (assignment_id, institution_id)
    references public.assignments (id, institution_id) on delete cascade,
  constraint submissions_student_fk
    foreign key (student_id, institution_id)
    references public.students (profile_id, institution_id) on delete cascade,
  constraint submissions_grader_fk
    foreign key (graded_by, institution_id)
    references public.teachers (profile_id, institution_id) on delete set null
);

comment on table public.assignment_submissions is
  'A student''s response to an assignment, and the mark the owning teacher gave it.';

create index submissions_assignment_idx on public.assignment_submissions (assignment_id, status);
create index submissions_student_idx on public.assignment_submissions (student_id, created_at desc);

-- ── Assessments: quizzes and tests ──────────────────────────────────────────

create table public.assessments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  teacher_id        uuid not null,

  class_id          uuid not null,
  section_id        uuid,
  subject_id        uuid,
  academic_year_id  uuid not null,

  kind              public.assessment_kind not null default 'QUIZ',
  title             text not null check (length(btrim(title)) between 2 and 200),
  instructions      text check (instructions is null or length(instructions) <= 10000),

  duration_minutes  integer check (duration_minutes is null or duration_minutes between 1 and 600),
  pass_marks        numeric(6, 2) check (pass_marks is null or pass_marks >= 0),
  max_attempts      smallint not null default 1 check (max_attempts between 1 and 10),

  -- The window the paper is open. NULL opens_at means "as soon as published".
  opens_at          timestamptz,
  closes_at         timestamptz,

  shuffle_questions boolean not null default false,
  -- Whether a student sees which answers were right after submitting.
  reveal_answers    boolean not null default true,

  is_published      boolean not null default false,
  published_at      timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint assessments_id_institution_uk unique (id, institution_id),
  constraint assessments_window_ordered check (
    opens_at is null or closes_at is null or closes_at > opens_at
  ),
  constraint assessments_published_coherent check (
    is_published = false or published_at is not null
  ),
  constraint assessments_section_requires_class check (
    section_id is null or class_id is not null
  ),

  constraint assessments_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint assessments_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint assessments_section_fk
    foreign key (section_id, institution_id)
    references public.sections (id, institution_id) on delete set null,
  constraint assessments_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete set null,
  constraint assessments_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade
);

comment on table public.assessments is
  'A quiz or test authored by one teacher for one class or section.';

create index assessments_owner_idx on public.assessments (teacher_id, created_at desc)
  where deleted_at is null;
create index assessments_delivery_idx on public.assessments (institution_id, class_id, section_id)
  where deleted_at is null and is_published;

create table public.assessment_questions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  assessment_id     uuid not null,

  position          integer not null check (position >= 0),
  question_type     public.question_type not null default 'SINGLE_CHOICE',
  prompt            text not null check (length(btrim(prompt)) between 1 and 5000),
  marks             numeric(6, 2) not null default 1 check (marks > 0 and marks <= 1000),
  -- Shown after submission when the assessment reveals answers.
  explanation       text check (explanation is null or length(explanation) <= 5000),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint questions_position_uk unique (assessment_id, position),
  constraint questions_id_institution_uk unique (id, institution_id),
  constraint questions_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.assessments (id, institution_id) on delete cascade
);

create index questions_assessment_idx on public.assessment_questions (assessment_id, position);

create table public.assessment_options (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  question_id       uuid not null,

  position          integer not null check (position >= 0),
  label             text not null check (length(btrim(label)) between 1 and 1000),

  -- The answer key. RLS keeps this table unreadable to students entirely;
  -- their view of a paper is assembled by a SECURITY DEFINER function that
  -- never projects this column. See migration 022.
  is_correct        boolean not null default false,

  created_at        timestamptz not null default now(),

  constraint options_position_uk unique (question_id, position),
  constraint options_id_institution_uk unique (id, institution_id),
  constraint options_question_fk
    foreign key (question_id, institution_id)
    references public.assessment_questions (id, institution_id) on delete cascade
);

create index options_question_idx on public.assessment_options (question_id, position);

comment on column public.assessment_options.is_correct is
  'The answer key. Students never select this table; their paper comes from student_get_paper().';

create table public.assessment_attempts (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  assessment_id     uuid not null,
  student_id        uuid not null,

  attempt_no        smallint not null default 1 check (attempt_no between 1 and 10),
  status            public.attempt_status not null default 'IN_PROGRESS',

  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  -- Deadline for this attempt, from the assessment's duration. Enforced server
  -- side at submission; a client clock is not evidence of anything.
  expires_at        timestamptz,

  score             numeric(8, 2),
  max_score         numeric(8, 2),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint attempts_unique_uk unique (assessment_id, student_id, attempt_no),
  constraint attempts_id_institution_uk unique (id, institution_id),
  constraint attempts_submitted_coherent check (
    status = 'IN_PROGRESS' or status = 'ABANDONED' or submitted_at is not null
  ),

  constraint attempts_assessment_fk
    foreign key (assessment_id, institution_id)
    references public.assessments (id, institution_id) on delete cascade,
  constraint attempts_student_fk
    foreign key (student_id, institution_id)
    references public.students (profile_id, institution_id) on delete cascade
);

create index attempts_assessment_idx on public.assessment_attempts (assessment_id, status);
create index attempts_student_idx on public.assessment_attempts (student_id, created_at desc);

create table public.assessment_answers (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  attempt_id        uuid not null,
  question_id       uuid not null,

  -- Selected option ids for choice questions; free text for SHORT_ANSWER.
  selected_option_ids uuid[] not null default '{}',
  text_answer       text check (text_answer is null or length(text_answer) <= 10000),

  is_correct        boolean,
  marks_awarded     numeric(6, 2) not null default 0 check (marks_awarded >= 0),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint answers_unique_uk unique (attempt_id, question_id),
  constraint answers_id_institution_uk unique (id, institution_id),
  constraint answers_attempt_fk
    foreign key (attempt_id, institution_id)
    references public.assessment_attempts (id, institution_id) on delete cascade,
  constraint answers_question_fk
    foreign key (question_id, institution_id)
    references public.assessment_questions (id, institution_id) on delete cascade
);

create index answers_attempt_idx on public.assessment_answers (attempt_id);

-- ── Triggers ────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'materials', 'assignments', 'assignment_submissions',
    'assessments', 'assessment_questions', 'assessment_attempts', 'assessment_answers'
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

-- `assessment_options` has no updated_at, but its tenant must still be frozen.
create trigger assessment_options_freeze_institution
  before update on public.assessment_options
  for each row execute function private.freeze_institution_id();

-- ── Row level security is enabled here, defined in 021 ──────────────────────

alter table public.materials              enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.assessments            enable row level security;
alter table public.assessment_questions   enable row level security;
alter table public.assessment_options     enable row level security;
alter table public.assessment_attempts    enable row level security;
alter table public.assessment_answers     enable row level security;
