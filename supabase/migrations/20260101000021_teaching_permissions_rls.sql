-- ============================================================================
-- 021 · Teaching content: permissions and row level security
-- ============================================================================
-- The access model for everything migration 020 introduced.
--
-- The rule that matters most, stated once: **a teacher reaches only their own
-- content**. Not their institution's content — their own. Every policy on
-- `materials`, `assignments`, `assessments` and everything hanging off them
-- gates on `teacher_id = auth.uid()`, so two teachers in the same institution,
-- teaching the same class, cannot read or alter each other's work.
--
-- A student's reach is narrower still and runs the other way: they see content
-- that is PUBLISHED and addressed to a class they are ACTIVELY enrolled in,
-- with the section either unset (whole class) or matching theirs.
--
-- `assessment_options` is the one table students cannot read at all. It holds
-- the answer key, RLS is row-level rather than column-level, and a policy that
-- let a student read the row would hand them `is_correct`. Their view of a
-- paper is assembled by `student_get_paper()` in migration 022, which never
-- projects that column.
--
-- Institution administrators get oversight reads but no authoring rights: they
-- run the institution, they do not teach for it.
-- ============================================================================

-- ── New permissions ─────────────────────────────────────────────────────────

insert into public.permissions (code, resource, action, scope, description) values
  ('material.manage',    'material',   'manage',   'TENANT', 'Create and publish study material for own classes'),
  ('material.read',      'material',   'read',     'TENANT', 'Read study material addressed to you'),
  ('assignment.manage',  'assignment', 'manage',   'TENANT', 'Set and mark assignments for own classes'),
  ('assignment.submit',  'assignment', 'submit',   'TENANT', 'Submit work for an assignment'),
  ('assessment.manage',  'assessment', 'manage',   'TENANT', 'Author quizzes and tests for own classes'),
  ('assessment.attempt', 'assessment', 'attempt',  'TENANT', 'Attempt a quiz or test addressed to you'),
  ('teaching.read_all',  'teaching',   'read_all', 'TENANT', 'Oversight of all teaching content in the tenant')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select 'TEACHER', code from public.permissions
where code in (
  'material.manage', 'material.read',
  'assignment.manage',
  'assessment.manage'
)
on conflict do nothing;

insert into public.role_permissions (role_code, permission_code)
select 'STUDENT', code from public.permissions
where code in (
  'material.read',
  'assignment.submit',
  'assessment.attempt'
)
on conflict do nothing;

-- Oversight only. Deliberately excludes the `manage` permissions: an
-- administrator can see what is being taught without being able to author or
-- grade in a teacher's name.
insert into public.role_permissions (role_code, permission_code)
select 'INSTITUTION_ADMIN', code from public.permissions
where code in ('teaching.read_all')
on conflict do nothing;

insert into public.role_permissions (role_code, permission_code)
select 'HQ_ADMIN', code from public.permissions
where code in ('teaching.read_all')
on conflict do nothing;

-- ── Delivery predicate ──────────────────────────────────────────────────────

/*
 * Does the calling student receive content addressed to this class/section?
 *
 * SECURITY DEFINER because it reads `student_enrollments`, which the student's
 * own policies scope to themselves — the function needs to answer the question
 * without the caller having to be able to read the table generally.
 *
 * `target_section_id is null` means the content is addressed to the whole
 * class, so any section within it qualifies.
 */
create or replace function private.receives_content(
  target_class_id   uuid,
  target_section_id uuid
)
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
      and (target_section_id is null or se.section_id = target_section_id)
  );
$$;

comment on function private.receives_content(uuid, uuid) is
  'A student receives content addressed to a class they are ACTIVELY enrolled in; a section narrows it.';

/*
 * Does the calling teacher own this assessment? Used by the child tables, whose
 * ownership is inherited rather than stored again — duplicating `teacher_id`
 * onto questions and options would create a second thing to keep in agreement.
 */
create or replace function private.owns_assessment(target_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessments a
    where a.id = target_assessment_id
      and a.teacher_id = auth.uid()
      and a.deleted_at is null
  );
$$;

create or replace function private.owns_assignment(target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.id = target_assignment_id
      and a.teacher_id = auth.uid()
      and a.deleted_at is null
  );
$$;

revoke execute on function
  private.receives_content(uuid, uuid),
  private.owns_assessment(uuid),
  private.owns_assignment(uuid)
from public;

grant execute on function
  private.receives_content(uuid, uuid),
  private.owns_assessment(uuid),
  private.owns_assignment(uuid)
to authenticated, service_role;

-- ── Materials ───────────────────────────────────────────────────────────────

create policy materials_select on public.materials
  for select to authenticated
  using (
    -- The owning teacher, in every state including drafts.
    teacher_id = (select auth.uid())
    -- Oversight: HQ, and the institution's own administrators.
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
    -- A student the material was published to.
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('material.read'))
      and (select private.receives_content(class_id, section_id))
    )
  );

create policy materials_insert on public.materials
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('material.manage'))
    -- Authorship cannot be assigned to somebody else.
    and teacher_id = (select auth.uid())
    -- And only where this teacher actually teaches.
    and (select private.teaches_class(class_id))
  );

create policy materials_update on public.materials
  for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('material.manage'))
  )
  with check (
    teacher_id = (select auth.uid())
    and institution_id = (select private.auth_institution_id())
  );

create policy materials_delete on public.materials
  for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('material.manage'))
  );

-- ── Assignments ─────────────────────────────────────────────────────────────

create policy assignments_select on public.assignments
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('assignment.submit'))
      and (select private.receives_content(class_id, section_id))
    )
  );

create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('assignment.manage'))
    and teacher_id = (select auth.uid())
    and (select private.teaches_class(class_id))
  );

create policy assignments_update on public.assignments
  for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('assignment.manage'))
  )
  with check (
    teacher_id = (select auth.uid())
    and institution_id = (select private.auth_institution_id())
  );

create policy assignments_delete on public.assignments
  for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('assignment.manage'))
  );

-- ── Submissions ─────────────────────────────────────────────────────────────

create policy submissions_select on public.assignment_submissions
  for select to authenticated
  using (
    -- The student's own work.
    student_id = (select auth.uid())
    -- The teacher who set the assignment, and only them.
    or (select private.owns_assignment(assignment_id))
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
  );

create policy submissions_insert on public.assignment_submissions
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and student_id = (select auth.uid())
    and (select private.has_permission('assignment.submit'))
    -- Only for an assignment actually addressed to them. Without this a student
    -- could submit against any assignment id they learned of.
    and exists (
      select 1 from public.assignments a
      where a.id = assignment_id
        and a.is_published
        and a.deleted_at is null
        and (select private.receives_content(a.class_id, a.section_id))
    )
  );

/*
 * Two parties update a submission for different reasons: the student edits
 * their response, the teacher records a mark. Both are expressed here; the
 * columns each may touch are constrained by the service layer and by the
 * CHECK constraints on the table.
 */
create policy submissions_update on public.assignment_submissions
  for update to authenticated
  using (
    (student_id = (select auth.uid()) and (select private.is_active()))
    or ((select private.owns_assignment(assignment_id)) and (select private.is_active()))
  )
  with check (
    institution_id = (select private.auth_institution_id())
  );

-- ── Assessments ─────────────────────────────────────────────────────────────

create policy assessments_select on public.assessments
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('assessment.attempt'))
      and (select private.receives_content(class_id, section_id))
    )
  );

create policy assessments_insert on public.assessments
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('assessment.manage'))
    and teacher_id = (select auth.uid())
    and (select private.teaches_class(class_id))
  );

create policy assessments_update on public.assessments
  for update to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('assessment.manage'))
  )
  with check (
    teacher_id = (select auth.uid())
    and institution_id = (select private.auth_institution_id())
  );

create policy assessments_delete on public.assessments
  for delete to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('assessment.manage'))
  );

-- ── Questions ───────────────────────────────────────────────────────────────
/*
 * Readable by the owning teacher and by oversight. NOT readable by students:
 * a paper reaches them through `student_get_paper()`, which controls both what
 * is projected and when. A student who could select this table directly could
 * read a test before it opens.
 */

create policy questions_select on public.assessment_questions
  for select to authenticated
  using (
    (select private.owns_assessment(assessment_id))
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
  );

create policy questions_write on public.assessment_questions
  for all to authenticated
  using (
    (select private.owns_assessment(assessment_id))
    and (select private.is_active())
    and (select private.has_permission('assessment.manage'))
  )
  with check (
    (select private.owns_assessment(assessment_id))
    and institution_id = (select private.auth_institution_id())
  );

-- ── Options: the answer key ─────────────────────────────────────────────────
/*
 * One policy, for the owning teacher only. There is deliberately no student
 * policy and no oversight policy: `is_correct` is the answer key, RLS cannot
 * hide a single column, and an institution administrator has no reason to read
 * answer keys either.
 */

create policy options_owner_all on public.assessment_options
  for all to authenticated
  using (
    exists (
      select 1 from public.assessment_questions q
      where q.id = question_id
        and (select private.owns_assessment(q.assessment_id))
    )
  )
  with check (
    institution_id = (select private.auth_institution_id())
    and exists (
      select 1 from public.assessment_questions q
      where q.id = question_id
        and (select private.owns_assessment(q.assessment_id))
    )
  );

-- ── Attempts ────────────────────────────────────────────────────────────────

create policy attempts_select on public.assessment_attempts
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.owns_assessment(assessment_id))
    or (
      (select private.has_permission('teaching.read_all'))
      and (
        (select private.is_hq())
        or institution_id = (select private.auth_institution_id())
      )
    )
  );

/*
 * Attempts are created and scored by SECURITY DEFINER functions in migration
 * 022, not by direct writes. There is no INSERT policy for `authenticated` by
 * design: a student who could insert their own attempt row could also write
 * their own `score`.
 */
create policy attempts_teacher_update on public.assessment_attempts
  for update to authenticated
  using (
    (select private.owns_assessment(assessment_id))
    and (select private.is_active())
  )
  with check (institution_id = (select private.auth_institution_id()));

-- ── Answers ─────────────────────────────────────────────────────────────────

create policy answers_select on public.assessment_answers
  for select to authenticated
  using (
    exists (
      select 1 from public.assessment_attempts t
      where t.id = attempt_id
        and (
          t.student_id = (select auth.uid())
          or (select private.owns_assessment(t.assessment_id))
        )
    )
  );

-- Answers are written through `student_answer_question()`; marking a free-text
-- answer is done through `teacher_grade_answer()`. Same reasoning as attempts.
create policy answers_teacher_update on public.assessment_answers
  for update to authenticated
  using (
    exists (
      select 1 from public.assessment_attempts t
      where t.id = attempt_id
        and (select private.owns_assessment(t.assessment_id))
    )
    and (select private.is_active())
  )
  with check (institution_id = (select private.auth_institution_id()));
