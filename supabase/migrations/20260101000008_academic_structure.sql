-- ============================================================================
-- 008 · Academic structure
-- ============================================================================
--   Institution
--     └─ Academic Year
--          └─ Department ─ Program ─ Class ─ Section
--                                      └─ Subject ─ Course
--
-- Every intermediate level is OPTIONAL. A school uses academic years, classes,
-- sections and subjects and leaves departments and programs empty; a university
-- uses departments and programs; a corporate training organization uses
-- programs and courses with no classes at all. None of these needs a schema
-- change, because the links between levels are nullable rather than mandatory.
--
-- Two mechanisms keep tenants apart on every table below:
--
--   1. `institution_id` is NOT NULL and frozen after insert by trigger.
--   2. Every reference to a parent is a COMPOSITE foreign key carrying
--      institution_id, so a row cannot reference a parent in another tenant.
--      This is structural: it holds even if RLS is misconfigured, even against
--      the service role, and even if application code has a bug.
-- ============================================================================

-- ── Departments ─────────────────────────────────────────────────────────────
create table public.departments (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  code            text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  name            text not null check (length(btrim(name)) between 2 and 150),
  description     text,
  status          public.record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint departments_code_uk unique (institution_id, code),
  constraint departments_id_institution_uk unique (id, institution_id)
);

-- ── Academic years ──────────────────────────────────────────────────────────
create table public.academic_years (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  name            text not null check (length(btrim(name)) between 2 and 50),
  starts_on       date not null,
  ends_on         date not null,
  is_current      boolean not null default false,
  status          public.academic_year_status not null default 'UPCOMING',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint academic_years_name_uk unique (institution_id, name),
  constraint academic_years_id_institution_uk unique (id, institution_id),
  constraint academic_years_ordered check (ends_on > starts_on)
);

-- Exactly one current year per institution, enforced by the database rather
-- than by whichever code path happens to set the flag.
create unique index academic_years_one_current_idx
  on public.academic_years (institution_id)
  where is_current and deleted_at is null;

-- ── Programs ────────────────────────────────────────────────────────────────
create table public.programs (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  department_id   uuid,
  code            text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  name            text not null check (length(btrim(name)) between 2 and 150),
  -- Free text so a school ("Primary"), a university ("Postgraduate") and a
  -- corporate academy ("Certification") all fit without an enum migration.
  level           text,
  duration_months smallint check (duration_months is null or duration_months between 1 and 120),
  description     text,
  status          public.record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint programs_code_uk unique (institution_id, code),
  constraint programs_id_institution_uk unique (id, institution_id),
  constraint programs_department_fk
    foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null
);

-- ── Classes ─────────────────────────────────────────────────────────────────
create table public.classes (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  academic_year_id  uuid not null,
  program_id        uuid,
  department_id     uuid,
  name              text not null check (length(btrim(name)) between 1 and 100),
  code              text check (code is null or code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  -- Sort order for "Grade 1 … Grade 12" or "Semester 1 … Semester 8".
  level_order       smallint,
  capacity          integer check (capacity is null or capacity between 1 and 10000),
  status            public.record_status not null default 'ACTIVE',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint classes_name_uk unique (institution_id, academic_year_id, name),
  constraint classes_id_institution_uk unique (id, institution_id),
  constraint classes_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade,
  constraint classes_program_fk
    foreign key (program_id, institution_id)
    references public.programs (id, institution_id) on delete set null,
  constraint classes_department_fk
    foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null
);

-- ── Sections ────────────────────────────────────────────────────────────────
create table public.sections (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  class_id        uuid not null,
  name            text not null check (length(btrim(name)) between 1 and 50),
  capacity        integer check (capacity is null or capacity between 1 and 1000),
  status          public.record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint sections_name_uk unique (class_id, name),
  constraint sections_id_institution_uk unique (id, institution_id),
  constraint sections_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade
);

-- ── Subjects ────────────────────────────────────────────────────────────────
create table public.subjects (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  department_id   uuid,
  code            text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$'),
  name            text not null check (length(btrim(name)) between 2 and 150),
  description     text,
  credits         numeric(4, 1) check (credits is null or credits between 0 and 100),
  is_elective     boolean not null default false,
  status          public.record_status not null default 'ACTIVE',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint subjects_code_uk unique (institution_id, code),
  constraint subjects_id_institution_uk unique (id, institution_id),
  constraint subjects_department_fk
    foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null
);

-- ── Courses ─────────────────────────────────────────────────────────────────
-- A course is a subject as actually delivered: to a class, within a program,
-- during an academic year. Keeping it separate from `subjects` is what lets the
-- same subject run differently in two programs without duplicating it.
create table public.courses (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  subject_id        uuid not null,
  academic_year_id  uuid not null,
  class_id          uuid,
  program_id        uuid,
  code              text not null check (code ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$'),
  title             text not null check (length(btrim(title)) between 2 and 200),
  description       text,
  credits           numeric(4, 1) check (credits is null or credits between 0 and 100),
  status            public.record_status not null default 'ACTIVE',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint courses_code_uk unique (institution_id, academic_year_id, code),
  constraint courses_id_institution_uk unique (id, institution_id),
  constraint courses_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete cascade,
  constraint courses_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade,
  constraint courses_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete set null,
  constraint courses_program_fk
    foreign key (program_id, institution_id)
    references public.programs (id, institution_id) on delete set null
);

-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Every list view is tenant-filtered, so tenant leads each composite index and
-- the index is selective from the first byte.
create index departments_tenant_idx     on public.departments (institution_id, status) where deleted_at is null;
create index academic_years_tenant_idx  on public.academic_years (institution_id, status);
create index programs_tenant_idx        on public.programs (institution_id, status) where deleted_at is null;
create index programs_department_idx    on public.programs (department_id) where department_id is not null;
create index classes_tenant_idx         on public.classes (institution_id, academic_year_id, status) where deleted_at is null;
create index classes_program_idx        on public.classes (program_id) where program_id is not null;
create index sections_class_idx         on public.sections (class_id) where deleted_at is null;
create index sections_tenant_idx        on public.sections (institution_id);
create index subjects_tenant_idx        on public.subjects (institution_id, status) where deleted_at is null;
create index courses_tenant_idx         on public.courses (institution_id, academic_year_id, status) where deleted_at is null;
create index courses_subject_idx        on public.courses (subject_id);
create index courses_class_idx          on public.courses (class_id) where class_id is not null;

-- ── Triggers ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'academic_years', 'programs', 'classes',
    'sections', 'subjects', 'courses'
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
