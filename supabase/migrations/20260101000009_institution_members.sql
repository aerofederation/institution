-- ============================================================================
-- 009 · Institution members and their academic assignments
-- ============================================================================
-- institution_admins, teachers and students are role extension tables hanging
-- off profiles. Each is bound to its profile by a composite key carrying BOTH
-- the tenant and the role, so:
--
--   * a teacher record cannot attach to a profile in another institution, and
--   * a teacher record cannot attach to a profile that is not a TEACHER.
--
-- Neither of those is a policy or an application check — they are foreign keys.
-- ============================================================================

-- Target for the role-and-tenant-qualified composite keys below.
alter table public.profiles
  add constraint profiles_id_role_institution_uk unique (id, role, institution_id);

comment on constraint profiles_id_role_institution_uk on public.profiles is
  'Anchor for role extension tables: lets teachers/students/admins bind to a profile of the correct role AND tenant.';

-- A student''s section must genuinely belong to the student''s class.
alter table public.sections
  add constraint sections_id_class_uk unique (id, class_id);

-- ── Institution administrators ──────────────────────────────────────────────
create table public.institution_admins (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  institution_id  uuid not null references public.institutions (id) on delete cascade,

  -- Pinned literal: this row can only ever describe an INSTITUTION_ADMIN.
  role_guard      text not null default 'INSTITUTION_ADMIN'
                  check (role_guard = 'INSTITUTION_ADMIN'),

  designation     text check (designation is null or length(btrim(designation)) between 2 and 120),
  -- The account the approval workflow provisioned. One per institution.
  is_primary      boolean not null default false,
  status          public.user_status not null default 'INVITED',

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint institution_admins_profile_fk
    foreign key (profile_id, role_guard, institution_id)
    references public.profiles (id, role, institution_id) on delete cascade
);

create unique index institution_admins_one_primary_idx
  on public.institution_admins (institution_id)
  where is_primary;

create index institution_admins_tenant_idx on public.institution_admins (institution_id, status);

-- ── Teachers ────────────────────────────────────────────────────────────────
create table public.teachers (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  role_guard        text not null default 'TEACHER' check (role_guard = 'TEACHER'),

  -- Institution-issued staff number. Unique within the institution, not
  -- globally: two institutions may legitimately both use "T-001".
  employee_id       text not null check (employee_id ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$'),

  department_id     uuid,
  qualification     text check (qualification is null or length(qualification) <= 300),
  specialization    text check (specialization is null or length(specialization) <= 300),
  experience_years  numeric(4, 1) check (experience_years is null or experience_years between 0 and 70),
  joining_date      date,
  bio               text check (bio is null or length(bio) <= 2000),
  status            public.user_status not null default 'INVITED',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint teachers_employee_id_uk unique (institution_id, employee_id),
  -- A teacher belongs to exactly one institution in V1, and the pair below is
  -- what child tables reference.
  constraint teachers_id_institution_uk unique (profile_id, institution_id),
  constraint teachers_profile_fk
    foreign key (profile_id, role_guard, institution_id)
    references public.profiles (id, role, institution_id) on delete cascade,
  constraint teachers_department_fk
    foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null
);

comment on table public.teachers is
  'Teacher extension of profiles. Bound by role and tenant, so cross-institution or wrong-role attachment is structurally impossible.';

create index teachers_tenant_idx on public.teachers (institution_id, status) where deleted_at is null;
create index teachers_department_idx on public.teachers (department_id) where department_id is not null;

-- ── Students ────────────────────────────────────────────────────────────────
create table public.students (
  profile_id        uuid primary key references public.profiles (id) on delete cascade,
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  role_guard        text not null default 'STUDENT' check (role_guard = 'STUDENT'),

  -- Named student_code rather than student_id: `student_id` is used throughout
  -- the schema as the foreign key to this table, and reusing it for the
  -- institution's human-readable roll number would make every join ambiguous.
  student_code      text not null check (student_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$'),
  admission_number  text check (admission_number is null or length(btrim(admission_number)) between 1 and 40),

  department_id     uuid,
  program_id        uuid,
  academic_year_id  uuid,
  class_id          uuid,
  section_id        uuid,

  guardian_name     text check (guardian_name is null or length(btrim(guardian_name)) between 2 and 150),
  guardian_phone    text check (guardian_phone is null or guardian_phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  guardian_email    public.email_address,

  admission_date    date,
  status            public.user_status not null default 'INVITED',

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint students_code_uk unique (institution_id, student_code),
  constraint students_admission_number_uk unique (institution_id, admission_number),
  constraint students_id_institution_uk unique (profile_id, institution_id),
  constraint students_profile_fk
    foreign key (profile_id, role_guard, institution_id)
    references public.profiles (id, role, institution_id) on delete cascade,
  constraint students_department_fk
    foreign key (department_id, institution_id)
    references public.departments (id, institution_id) on delete set null,
  constraint students_program_fk
    foreign key (program_id, institution_id)
    references public.programs (id, institution_id) on delete set null,
  constraint students_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete set null,
  constraint students_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete set null,
  -- The section must belong to the class the student is in.
  constraint students_section_in_class_fk
    foreign key (section_id, class_id)
    references public.sections (id, class_id) on delete set null,
  constraint students_section_requires_class check (section_id is null or class_id is not null)
);

comment on column public.students.student_code is
  'Institution-issued roll/enrolment number. Unique within the institution. Distinct from the profile_id foreign key.';

create index students_tenant_idx on public.students (institution_id, status) where deleted_at is null;
create index students_class_idx on public.students (class_id, section_id) where class_id is not null;
create index students_program_idx on public.students (program_id) where program_id is not null;
create index students_year_idx on public.students (academic_year_id) where academic_year_id is not null;

-- ── Teacher → class assignments ─────────────────────────────────────────────
create table public.teacher_class_assignments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  teacher_id        uuid not null,
  class_id          uuid not null,
  section_id        uuid,
  academic_year_id  uuid not null,
  is_class_teacher  boolean not null default false,
  status            public.record_status not null default 'ACTIVE',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tca_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint tca_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint tca_section_fk
    foreign key (section_id, class_id)
    references public.sections (id, class_id) on delete cascade,
  constraint tca_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade,
  constraint tca_section_requires_class check (section_id is null or class_id is not null)
);

-- One assignment per teacher/class/section/year. COALESCE gives NULL sections a
-- stable key so "whole class" and "section A" do not collide.
create unique index tca_unique_idx on public.teacher_class_assignments (
  teacher_id, class_id, coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year_id
);

create unique index tca_one_class_teacher_idx
  on public.teacher_class_assignments (class_id, coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_class_teacher and status = 'ACTIVE';

create index tca_tenant_idx on public.teacher_class_assignments (institution_id, academic_year_id, status);
create index tca_teacher_idx on public.teacher_class_assignments (teacher_id, status);
create index tca_class_idx on public.teacher_class_assignments (class_id, status);

-- ── Teacher → subject assignments ───────────────────────────────────────────
create table public.teacher_subject_assignments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  teacher_id        uuid not null,
  subject_id        uuid not null,
  class_id          uuid,
  section_id        uuid,
  academic_year_id  uuid not null,
  status            public.record_status not null default 'ACTIVE',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tsa_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint tsa_subject_fk
    foreign key (subject_id, institution_id)
    references public.subjects (id, institution_id) on delete cascade,
  constraint tsa_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint tsa_section_fk
    foreign key (section_id, class_id)
    references public.sections (id, class_id) on delete cascade,
  constraint tsa_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade,
  constraint tsa_section_requires_class check (section_id is null or class_id is not null)
);

create unique index tsa_unique_idx on public.teacher_subject_assignments (
  teacher_id,
  subject_id,
  coalesce(class_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid),
  academic_year_id
);

create index tsa_tenant_idx on public.teacher_subject_assignments (institution_id, academic_year_id, status);
create index tsa_teacher_idx on public.teacher_subject_assignments (teacher_id, status);
create index tsa_subject_idx on public.teacher_subject_assignments (subject_id, status);

-- ── Student enrolments ──────────────────────────────────────────────────────
create table public.student_enrollments (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  student_id        uuid not null,
  class_id          uuid not null,
  section_id        uuid,
  academic_year_id  uuid not null,
  program_id        uuid,
  status            public.enrollment_status not null default 'ACTIVE',
  enrolled_on       date not null default current_date,
  completed_on      date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint enrollments_student_fk
    foreign key (student_id, institution_id)
    references public.students (profile_id, institution_id) on delete cascade,
  constraint enrollments_class_fk
    foreign key (class_id, institution_id)
    references public.classes (id, institution_id) on delete cascade,
  constraint enrollments_section_fk
    foreign key (section_id, class_id)
    references public.sections (id, class_id) on delete set null,
  constraint enrollments_academic_year_fk
    foreign key (academic_year_id, institution_id)
    references public.academic_years (id, institution_id) on delete cascade,
  constraint enrollments_program_fk
    foreign key (program_id, institution_id)
    references public.programs (id, institution_id) on delete set null,
  constraint enrollments_unique_uk unique (student_id, class_id, academic_year_id),
  constraint enrollments_completion_ordered check (completed_on is null or completed_on >= enrolled_on)
);

create index enrollments_tenant_idx on public.student_enrollments (institution_id, academic_year_id, status);
create index enrollments_student_idx on public.student_enrollments (student_id, status);
create index enrollments_class_idx on public.student_enrollments (class_id, section_id, status);

-- ── Triggers ────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'institution_admins', 'teachers', 'students',
    'teacher_class_assignments', 'teacher_subject_assignments', 'student_enrollments'
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

-- ============================================================================
-- Relationship predicates for RLS
--
-- Defined here rather than in migration 006 because they depend on the tables
-- above. Same discipline: SECURITY DEFINER, empty search_path, no identity
-- arguments — the caller is always auth.uid().
-- ============================================================================

create or replace function private.teaches_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_class_assignments tca
    where tca.teacher_id = auth.uid()
      and tca.class_id = target_class_id
      and tca.status = 'ACTIVE'
  );
$$;

create or replace function private.teaches_section(target_section_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.teacher_class_assignments tca
    where tca.teacher_id = auth.uid()
      and tca.section_id = target_section_id
      and tca.status = 'ACTIVE'
  );
$$;

create or replace function private.teaches_student(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments se
    join public.teacher_class_assignments tca
      on tca.class_id = se.class_id
     and tca.academic_year_id = se.academic_year_id
     and (tca.section_id is null or tca.section_id = se.section_id)
    where se.student_id = target_student_id
      and se.status = 'ACTIVE'
      and tca.teacher_id = auth.uid()
      and tca.status = 'ACTIVE'
  );
$$;

comment on function private.teaches_student(uuid) is
  'A teacher reaches a student only through an ACTIVE class assignment that matches the student''s ACTIVE enrolment.';

create or replace function private.enrolled_in_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments se
    where se.student_id = auth.uid()
      and se.class_id = target_class_id
      and se.status = 'ACTIVE'
  );
$$;

revoke execute on function
  private.teaches_class(uuid),
  private.teaches_section(uuid),
  private.teaches_student(uuid),
  private.enrolled_in_class(uuid)
from public;

grant execute on function
  private.teaches_class(uuid),
  private.teaches_section(uuid),
  private.teaches_student(uuid),
  private.enrolled_in_class(uuid)
to authenticated, service_role;
