-- ============================================================================
-- 011 · Row Level Security
-- ============================================================================
-- Rules applied uniformly below:
--
--  * RLS is ENABLED on every table. No policy means no access, which is the
--    correct default.
--
--  * FORCE ROW LEVEL SECURITY is deliberately NOT applied. FORCE only changes
--    behaviour for the table OWNER, and no API role is ever the owner: requests
--    arrive as `anon` or `authenticated`. What FORCE would break is the
--    owner-context bypass that the SECURITY DEFINER helpers and triggers rely
--    on to write history and audit rows. Turning it on would mean granting
--    those tables permissive INSERT policies instead — strictly worse, because
--    a permissive INSERT policy is reachable from the API and owner context is
--    not.
--
--  * Every policy names `TO authenticated`. A policy that omits the role
--    applies to PUBLIC, which includes `anon`.
--
--  * Every helper call is wrapped as `(select private.fn())`. PostgreSQL then
--    hoists it into an InitPlan and evaluates it once per statement instead of
--    once per row. On a large table this is the difference between a few
--    milliseconds and several seconds.
--
--  * Separate policies per command. `FOR ALL` conflates "may read" with "may
--    write", which are different questions.
--
--  * Every INSERT and UPDATE policy carries a WITH CHECK that pins
--    institution_id to the caller's own tenant, so a row can never be written
--    into another institution even if the id were somehow supplied.
--
--  * institution_id in a policy is ALWAYS `(select private.auth_institution_id())`,
--    which reads the profiles row bound to auth.uid(). It is never taken from
--    the request. That is the difference between a tenant boundary and a
--    suggestion.
-- ============================================================================

-- ── Baseline grants ─────────────────────────────────────────────────────────
-- Supabase grants table privileges to anon and authenticated by default. The
-- public surface of this platform is served by SECURITY DEFINER projections in
-- later phases, so anon needs no direct table access at all.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on all tables in schema public to authenticated;

-- Reference data and append-only logs: read-only through the API.
revoke insert, update, delete on
  public.roles, public.permissions, public.role_permissions,
  public.audit_logs, public.institution_application_status_history
from authenticated;
grant insert on public.audit_logs to authenticated;   -- inserts still gated by policy

alter table public.roles                                    enable row level security;
alter table public.permissions                              enable row level security;
alter table public.role_permissions                         enable row level security;
alter table public.institutions                             enable row level security;
alter table public.profiles                                 enable row level security;
alter table public.institution_applications                 enable row level security;
alter table public.institution_application_status_history   enable row level security;
alter table public.institution_documents                    enable row level security;
alter table public.departments                              enable row level security;
alter table public.academic_years                           enable row level security;
alter table public.programs                                 enable row level security;
alter table public.classes                                  enable row level security;
alter table public.sections                                 enable row level security;
alter table public.subjects                                 enable row level security;
alter table public.courses                                  enable row level security;
alter table public.institution_admins                       enable row level security;
alter table public.teachers                                 enable row level security;
alter table public.students                                 enable row level security;
alter table public.teacher_class_assignments                enable row level security;
alter table public.teacher_subject_assignments              enable row level security;
alter table public.student_enrollments                      enable row level security;
alter table public.notifications                            enable row level security;
alter table public.audit_logs                               enable row level security;
alter table public.system_settings                          enable row level security;

-- ============================================================================
-- Reference data — every signed-in user may read the authorization vocabulary
-- so the UI can reason about capability. Writes happen only in migrations.
-- ============================================================================
create policy roles_read on public.roles
  for select to authenticated using (true);

create policy permissions_read on public.permissions
  for select to authenticated using (true);

create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- ============================================================================
-- Institutions
-- ============================================================================

-- Own institution stays readable even while suspended, so its administrator can
-- see the suspension notice rather than an empty screen. Everything else in the
-- tenant is already closed by private.is_active().
create policy institutions_select on public.institutions
  for select to authenticated
  using (
    (select private.is_hq())
    or id = (select private.auth_institution_id())
  );

create policy institutions_update_own on public.institutions
  for update to authenticated
  using (
    id = (select private.auth_institution_id())
    and (select private.is_active())
    and (select private.has_permission('institution.update'))
  )
  with check (
    id = (select private.auth_institution_id())
  );

create policy institutions_update_hq on public.institutions
  for update to authenticated
  using ((select private.has_permission('institution.suspend')))
  with check ((select private.has_permission('institution.suspend')));

-- No INSERT or DELETE policy: institutions come into existence only through the
-- HQ approval workflow, which runs server-side under the service role.

-- ============================================================================
-- Profiles
-- ============================================================================

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    -- Always your own record.
    id = (select auth.uid())

    -- HQ oversight.
    or (select private.is_hq())

    -- Inside one tenant, and only for roles that need it.
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (
        (select private.auth_role()) = 'INSTITUTION_ADMIN'
        -- A teacher reaches a student only through an ACTIVE class assignment
        -- matching that student's ACTIVE enrolment. Teachers cannot browse the
        -- institution roster, and students cannot see each other at all.
        or (
          (select private.auth_role()) = 'TEACHER'
          and (select private.teaches_student(id))
        )
      )
    )
  );

-- Self-service edits. The privilege-escalation trigger from migration 006
-- rejects any attempt to move role, institution_id, status, email or id, so
-- this policy safely covers the remaining descriptive fields.
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- An institution administrator may correct descriptive details of their own
-- staff and students. Privileged columns remain blocked by the same trigger.
create policy profiles_update_by_admin on public.profiles
  for update to authenticated
  using (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.auth_role()) = 'INSTITUTION_ADMIN'
    and (
      (select private.has_permission('teacher.update'))
      or (select private.has_permission('student.update'))
    )
  )
  with check (
    institution_id = (select private.auth_institution_id())
  );

-- No INSERT policy: profiles are created by the provisioning trigger on
-- auth.users. No DELETE policy: accounts are deactivated, not erased.

-- ============================================================================
-- Institution applications
-- ============================================================================

create policy applications_select on public.institution_applications
  for select to authenticated
  using (
    (select private.has_permission('application.read_all'))
    -- Once approved, the institution can read the application it came from.
    or (
      institution_id is not null
      and institution_id = (select private.auth_institution_id())
    )
  );

create policy applications_update_hq on public.institution_applications
  for update to authenticated
  using ((select private.has_permission('application.review')))
  with check ((select private.has_permission('application.review')));

-- Anonymous applicants never touch this table directly. The public wizard and
-- the OTP-gated tracking page go through SECURITY DEFINER projections added in
-- Phase 8, so `anon` keeps no table privileges at all.

create policy application_history_select on public.institution_application_status_history
  for select to authenticated
  using (
    (select private.has_permission('application.read_all'))
    or exists (
      select 1
      from public.institution_applications a
      where a.id = application_id
        and a.institution_id is not null
        and a.institution_id = (select private.auth_institution_id())
    )
  );

-- History rows are written only by the transition trigger. No INSERT, UPDATE or
-- DELETE policy exists, which makes the trail append-only from the API.

-- ============================================================================
-- Institution documents
-- ============================================================================

create policy documents_select on public.institution_documents
  for select to authenticated
  using (
    (select private.has_permission('document.read_all'))
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('document.read'))
    )
  );

create policy documents_insert on public.institution_documents
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('document.upload'))
  );

create policy documents_verify_hq on public.institution_documents
  for update to authenticated
  using ((select private.has_permission('document.verify')))
  with check ((select private.has_permission('document.verify')));

-- ============================================================================
-- Academic structure
--
-- Seven tables with identical access rules, so the policies are generated
-- rather than copied. Generation is not a shortcut here: it guarantees the
-- seven are actually identical, which hand-written copies never do.
-- ============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'departments', 'academic_years', 'programs', 'classes',
    'sections', 'subjects', 'courses'
  ]
  loop
    execute format($fmt$
      create policy %1$s_select on public.%1$I
        for select to authenticated
        using (
          (select private.has_permission('academic.read_all'))
          or (
            (select private.is_active())
            and institution_id = (select private.auth_institution_id())
            and (select private.has_permission('academic.read'))
          )
        );

      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        );

      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        )
        with check (
          institution_id = (select private.auth_institution_id())
        );

      create policy %1$s_delete on public.%1$I
        for delete to authenticated
        using (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        );
    $fmt$, t);
  end loop;
end $$;

-- ============================================================================
-- Institution members
-- ============================================================================

create policy institution_admins_select on public.institution_admins
  for select to authenticated
  using (
    (select private.is_hq())
    or profile_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.auth_role()) = 'INSTITUTION_ADMIN'
    )
  );

create policy teachers_select on public.teachers
  for select to authenticated
  using (
    (select private.has_permission('teacher.read_all'))
    or profile_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('teacher.read'))
    )
  );

create policy teachers_insert on public.teachers
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('teacher.create'))
  );

create policy teachers_update on public.teachers
  for update to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('teacher.update'))
    )
  )
  with check (
    institution_id = (select private.auth_institution_id())
  );

create policy students_select on public.students
  for select to authenticated
  using (
    (select private.has_permission('student.read_all'))
    -- A student sees their own record and no other student's.
    or profile_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (
        (select private.has_permission('student.read'))
        or (
          (select private.has_permission('student.read_assigned'))
          and (select private.teaches_student(profile_id))
        )
      )
    )
  );

create policy students_insert on public.students
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('student.create'))
  );

create policy students_update on public.students
  for update to authenticated
  using (
    profile_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('student.update'))
    )
  )
  with check (
    institution_id = (select private.auth_institution_id())
  );

-- ── Assignment and enrolment join tables ────────────────────────────────────
create policy tca_select on public.teacher_class_assignments
  for select to authenticated
  using (
    (select private.has_permission('academic.read_all'))
    or teacher_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('academic.read'))
    )
  );

create policy tsa_select on public.teacher_subject_assignments
  for select to authenticated
  using (
    (select private.has_permission('academic.read_all'))
    or teacher_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('academic.read'))
    )
  );

create policy enrollments_select on public.student_enrollments
  for select to authenticated
  using (
    (select private.has_permission('academic.read_all'))
    or student_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (
        (select private.has_permission('student.read'))
        or (
          (select private.has_permission('student.read_assigned'))
          and (select private.teaches_class(class_id))
        )
      )
    )
  );

do $$
declare
  t text;
begin
  foreach t in array array[
    'teacher_class_assignments', 'teacher_subject_assignments', 'student_enrollments'
  ]
  loop
    execute format($fmt$
      create policy %1$s_insert on public.%1$I
        for insert to authenticated
        with check (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        );

      create policy %1$s_update on public.%1$I
        for update to authenticated
        using (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        )
        with check (
          institution_id = (select private.auth_institution_id())
        );

      create policy %1$s_delete on public.%1$I
        for delete to authenticated
        using (
          (select private.is_active())
          and institution_id = (select private.auth_institution_id())
          and (select private.has_permission('academic.manage'))
        );
    $fmt$, t);
  end loop;
end $$;

-- ============================================================================
-- Notifications — strictly owner-scoped
-- ============================================================================

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy notifications_broadcast on public.notifications
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and (select private.has_permission('notification.broadcast'))
  );

-- ============================================================================
-- Audit log — readable by authority, append-only for everyone
-- ============================================================================

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (select private.has_permission('audit.read'))
    or (
      institution_id is not null
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('audit.read_tenant'))
    )
  );

-- A caller may record their own actions and nothing else. Combined with the
-- absence of any UPDATE or DELETE policy, the trail cannot be rewritten.
create policy audit_logs_insert_self on public.audit_logs
  for insert to authenticated
  with check (actor_id = (select auth.uid()));

-- ============================================================================
-- System settings
-- ============================================================================

create policy system_settings_select on public.system_settings
  for select to authenticated
  using (
    is_public
    or (select private.has_permission('settings.read'))
  );

create policy system_settings_update on public.system_settings
  for update to authenticated
  using ((select private.has_permission('settings.manage')))
  with check ((select private.has_permission('settings.manage')));
