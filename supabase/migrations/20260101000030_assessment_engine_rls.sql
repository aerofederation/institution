-- ============================================================================
-- 030 · Row level security for the engine's new tables
-- ============================================================================
-- Five tables gained RLS in 029; this gives them policies. A table with RLS on
-- and no policy is unreachable, which is safe but useless — and a table with
-- RLS on that nobody remembered is the actual danger, so each one is decided
-- here explicitly.
--
-- The rules follow the ones already established:
--
--   sections            visible with their assessment; written by its owner
--   question bank       the teacher's own, never a colleague's
--   bank options        follow their item — they hold answer keys
--   integrity events    the attempt's owner writes them, its teacher reads them
--   grade revisions     written by the marking path, read by teacher and student
--
-- `assessment_grade_revisions` is the one a student can read about themselves.
-- If a mark changes after release the student is entitled to know it changed,
-- which is the entire point of recording it.
-- ============================================================================

-- ── Sections ────────────────────────────────────────────────────────────────
/*
 * A section is part of the paper, so it is visible to exactly whoever may see
 * the paper. Rather than restate that rule, the policy defers to the row in
 * `assessments`, which RLS already filters — if the caller cannot see the
 * assessment, the EXISTS finds nothing.
 */

create policy sections_select on public.assessment_sections
  for select to authenticated
  using (
    exists (select 1 from public.assessments a where a.id = assessment_id)
  );

create policy sections_write on public.assessment_sections
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

-- ── Question bank ───────────────────────────────────────────────────────────

create policy bank_items_select on public.question_bank_items
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    or (select private.oversees_teaching(institution_id))
  );

create policy bank_items_write on public.question_bank_items
  for all to authenticated
  using (
    teacher_id = (select auth.uid())
    and (select private.is_active())
    and (select private.has_permission('assessment.manage'))
  )
  with check (
    teacher_id = (select auth.uid())
    and institution_id = (select private.auth_institution_id())
  );

/*
 * Bank options hold `is_correct`. They get one policy, for the owning teacher,
 * and no oversight branch — for the same reason `assessment_options` has none:
 * RLS cannot hide a single column, and an administrator has no need of answer
 * keys.
 */
create policy bank_options_owner_all on public.question_bank_options
  for all to authenticated
  using (
    exists (
      select 1 from public.question_bank_items i
      where i.id = bank_item_id and i.teacher_id = (select auth.uid())
    )
  )
  with check (
    institution_id = (select private.auth_institution_id())
    and exists (
      select 1 from public.question_bank_items i
      where i.id = bank_item_id and i.teacher_id = (select auth.uid())
    )
  );

-- ── Integrity events ────────────────────────────────────────────────────────

create policy integrity_select on public.assessment_integrity_events
  for select to authenticated
  using (
    exists (
      select 1 from public.assessment_attempts t
      where t.id = attempt_id
        and (
          -- The student may see what was recorded about them. Anything logged
          -- about a person that they cannot see is a worse thing to log.
          t.student_id = (select auth.uid())
          or (select private.owns_assessment(t.assessment_id))
        )
    )
    or (select private.oversees_teaching(institution_id))
  );

/*
 * Written by the student sitting the attempt — the events originate in their
 * browser. Confined to their own live attempt, so nobody can write events onto
 * somebody else's record.
 */
create policy integrity_insert on public.assessment_integrity_events
  for insert to authenticated
  with check (
    institution_id = (select private.auth_institution_id())
    and exists (
      select 1 from public.assessment_attempts t
      where t.id = attempt_id
        and t.student_id = (select auth.uid())
        and t.status = 'IN_PROGRESS'
    )
  );

-- No UPDATE and no DELETE policy, by design. An integrity record that its
-- subject can erase records nothing.

-- ── Grade revisions ─────────────────────────────────────────────────────────

create policy revisions_select on public.assessment_grade_revisions
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
    or (select private.oversees_teaching(institution_id))
  );

/*
 * Insert-only, and only by the teacher who owns the paper. There is no update
 * or delete policy: a revision history that can be rewritten is not a history.
 */
create policy revisions_insert on public.assessment_grade_revisions
  for insert to authenticated
  with check (
    institution_id = (select private.auth_institution_id())
    and exists (
      select 1 from public.assessment_attempts t
      where t.id = attempt_id
        and (select private.owns_assessment(t.assessment_id))
    )
  );
