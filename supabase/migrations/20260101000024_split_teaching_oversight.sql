-- ============================================================================
-- 024 · Split teaching oversight by scope
-- ============================================================================
-- Migration 021 gave both HQ and institution administrators one TENANT-scoped
-- `teaching.read_all`. That broke an invariant the platform holds deliberately
-- and tests for: **every tenant-scoped permission HQ holds must be self-scoped**
-- — its own profile, its own notifications. HQ oversees the federation; it does
-- not hold permissions that reach into a particular institution's operations.
--
-- The codebase already has the right shape for this, in `audit.read` (GLOBAL)
-- alongside `audit.read_tenant` (TENANT). Teaching oversight follows it:
--
--   teaching.read_all     GLOBAL   federation-wide, HQ
--   teaching.read_tenant  TENANT   own institution, institution administrators
--
-- Both are reads. Neither role gets `material.manage`, `assignment.manage` or
-- `assessment.manage`: an administrator can see what is being taught without
-- being able to author or grade in a teacher's name.
-- ============================================================================

insert into public.permissions (code, resource, action, scope, description) values
  ('teaching.read_tenant', 'teaching', 'read_tenant', 'TENANT',
   'View teaching content across own institution')
on conflict (code) do nothing;

-- `teaching.read_all` becomes federation-wide, matching what HQ is for.
update public.permissions
   set scope = 'GLOBAL',
       description = 'View teaching content across the federation'
 where code = 'teaching.read_all';

-- The institution administrator moves to the tenant-scoped one.
delete from public.role_permissions
 where role_code = 'INSTITUTION_ADMIN'
   and permission_code = 'teaching.read_all';

insert into public.role_permissions (role_code, permission_code)
values ('INSTITUTION_ADMIN', 'teaching.read_tenant')
on conflict do nothing;

-- ── Policies now consult whichever permission matches the caller ────────────
/*
 * The oversight branch of each policy was written against `teaching.read_all`
 * alone. It becomes: HQ with the global permission, or a member of this tenant
 * with the tenant one. Written out rather than abbreviated because a policy
 * that is hard to read is a policy nobody audits.
 */

create or replace function private.oversees_teaching(target_institution_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (private.is_hq() and private.has_permission('teaching.read_all'))
    or (
      private.is_active()
      and target_institution_id = private.auth_institution_id()
      and private.has_permission('teaching.read_tenant')
    );
$$;

comment on function private.oversees_teaching(uuid) is
  'Read-only oversight of teaching content: HQ federation-wide, an institution administrator within their own tenant.';

revoke execute on function private.oversees_teaching(uuid) from public;
grant execute on function private.oversees_teaching(uuid) to authenticated, service_role;

-- Materials
drop policy if exists materials_select on public.materials;
create policy materials_select on public.materials
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (select private.oversees_teaching(institution_id))
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('material.read'))
      and (select private.receives_content(class_id, section_id))
    )
  );

-- Assignments
drop policy if exists assignments_select on public.assignments;
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (select private.oversees_teaching(institution_id))
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('assignment.submit'))
      and (select private.receives_content(class_id, section_id))
    )
  );

-- Submissions
drop policy if exists submissions_select on public.assignment_submissions;
create policy submissions_select on public.assignment_submissions
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.owns_assignment(assignment_id))
    or (select private.oversees_teaching(institution_id))
  );

-- Assessments
drop policy if exists assessments_select on public.assessments;
create policy assessments_select on public.assessments
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (select private.oversees_teaching(institution_id))
    or (
      is_published
      and deleted_at is null
      and (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('assessment.attempt'))
      and (select private.receives_content(class_id, section_id))
    )
  );

-- Questions
drop policy if exists questions_select on public.assessment_questions;
create policy questions_select on public.assessment_questions
  for select to authenticated
  using (
    (select private.owns_assessment(assessment_id))
    or (select private.oversees_teaching(institution_id))
  );

-- Attempts
drop policy if exists attempts_select on public.assessment_attempts;
create policy attempts_select on public.assessment_attempts
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or (select private.owns_assessment(assessment_id))
    or (select private.oversees_teaching(institution_id))
  );

/*
 * `assessment_options` is deliberately NOT given an oversight branch. It holds
 * the answer key; an institution administrator has no reason to read one, and
 * RLS cannot hide the single column that matters.
 */
