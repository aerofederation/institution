-- ============================================================================
-- 038 · AI-assisted grading
-- ============================================================================
-- The rule this schema exists to enforce: **the model never awards a mark.**
--
-- A suggestion is a row in its own table. It carries what the model proposed,
-- why, and what it cost. Nothing reads it to compute a score. The only path to
-- `assessment_answers.marks_awarded` is still `teacher_grade_answer()`, which a
-- person calls — so a teacher who ignores every suggestion gets exactly the
-- marking they would have got without this feature.
--
-- That is a deliberate design, not caution for its own sake. An automatic
-- essay mark that nobody read is indistinguishable from a marked paper right
-- up until a student disputes it, and at that point there is no one who can
-- say why the mark was given.
--
-- Three supporting pieces:
--
--   * `rubric` on a question, because grading free text against nothing is
--     guesswork. Without a rubric the service declines rather than improvising
--     a standard the teacher never set.
--   * `accepted_at` / `accepted_marks` on the suggestion, so the record shows
--     whether a person agreed, disagreed, or never looked.
--   * `ai_usage_events`, because an institution paying for tokens is entitled
--     to see what they were spent on.
-- ============================================================================

-- ── A rubric to grade against ───────────────────────────────────────────────

alter table public.assessment_questions
  add column rubric text check (rubric is null or length(rubric) <= 5000);

comment on column public.assessment_questions.rubric is
  'What full marks look like. Read by AI grading, which declines to suggest a mark without one.';

alter table public.question_bank_items
  add column rubric text check (rubric is null or length(rubric) <= 5000);

-- ── Suggestions ─────────────────────────────────────────────────────────────

create table public.ai_grade_suggestions (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  answer_id         uuid not null,

  model             text not null check (length(btrim(model)) between 1 and 100),
  suggested_marks   numeric(6, 2) not null check (suggested_marks >= 0),
  /** Why, in the model's own words, for the teacher to weigh. */
  rationale         text not null check (length(btrim(rationale)) between 1 and 5000),
  /** Which rubric points it judged met, so a teacher can check the reasoning. */
  rubric_points     text[] not null default '{}',
  /*
   * The model's own stated confidence. Advisory, and deliberately not used to
   * gate anything — a confident wrong answer is still wrong, and letting a
   * self-report decide whether a person reviews it would defeat the purpose.
   */
  confidence        text check (confidence is null or confidence in ('LOW', 'MEDIUM', 'HIGH')),

  requested_by      uuid not null,
  input_tokens      integer not null default 0 check (input_tokens >= 0),
  output_tokens     integer not null default 0 check (output_tokens >= 0),

  /** Set only when a teacher acted on it. NULL means nobody has. */
  accepted_at       timestamptz,
  accepted_marks    numeric(6, 2),

  created_at        timestamptz not null default now(),

  constraint ai_suggestions_id_institution_uk unique (id, institution_id),
  constraint ai_suggestions_accepted_coherent check (
    (accepted_at is null) = (accepted_marks is null)
  ),
  constraint ai_suggestions_answer_fk
    foreign key (answer_id, institution_id)
    references public.assessment_answers (id, institution_id) on delete cascade,
  constraint ai_suggestions_requester_fk
    foreign key (requested_by, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade
);

comment on table public.ai_grade_suggestions is
  'What a model proposed for one answer. Never a mark: nothing sums this, and the only path to a score is teacher_grade_answer().';

create index ai_suggestions_answer_idx on public.ai_grade_suggestions (answer_id, created_at desc);
create index ai_suggestions_requester_idx on public.ai_grade_suggestions (requested_by, created_at desc);

-- ── What it cost ────────────────────────────────────────────────────────────

create table public.ai_usage_events (
  id                uuid primary key default gen_random_uuid(),
  institution_id    uuid not null references public.institutions (id) on delete cascade,
  actor_id          uuid references public.profiles (id) on delete set null,

  feature           text not null check (feature ~ '^[a-z][a-z0-9_.]{2,63}$'),
  model             text not null,
  input_tokens      integer not null default 0 check (input_tokens >= 0),
  output_tokens     integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),

  /** Whether the call succeeded, so failures are visible rather than absent. */
  succeeded         boolean not null default true,
  error_code        text check (error_code is null or length(error_code) <= 100),

  created_at        timestamptz not null default now()
);

comment on table public.ai_usage_events is
  'One row per model call. Tokens only — never prompt or response content, which would put student work in a usage log.';

create index ai_usage_tenant_idx on public.ai_usage_events (institution_id, created_at desc);
create index ai_usage_feature_idx on public.ai_usage_events (institution_id, feature, created_at desc);

-- ── Row level security ──────────────────────────────────────────────────────

alter table public.ai_grade_suggestions enable row level security;
alter table public.ai_usage_events      enable row level security;

revoke all on public.ai_grade_suggestions from anon;
revoke all on public.ai_usage_events      from anon;

/*
 * A suggestion is visible to the teacher who owns the paper, and to nobody
 * else. Explicitly not to the student: it is a draft opinion about their work
 * that no person has endorsed, and showing it would make the model's guess feel
 * like a verdict.
 */
create policy ai_suggestions_owner on public.ai_grade_suggestions
  for select to authenticated
  using (
    exists (
      select 1
      from public.assessment_answers a
      join public.assessment_attempts t on t.id = a.attempt_id
      where a.id = answer_id
        and (select private.owns_assessment(t.assessment_id))
    )
  );

create policy ai_suggestions_insert on public.ai_grade_suggestions
  for insert to authenticated
  with check (
    institution_id = (select private.auth_institution_id())
    and requested_by = (select auth.uid())
    and exists (
      select 1
      from public.assessment_answers a
      join public.assessment_attempts t on t.id = a.attempt_id
      where a.id = answer_id
        and (select private.owns_assessment(t.assessment_id))
    )
  );

-- Marking one as accepted is the only update, and only by its owner.
create policy ai_suggestions_update on public.ai_grade_suggestions
  for update to authenticated
  using (
    exists (
      select 1
      from public.assessment_answers a
      join public.assessment_attempts t on t.id = a.attempt_id
      where a.id = answer_id
        and (select private.owns_assessment(t.assessment_id))
    )
  )
  with check (institution_id = (select private.auth_institution_id()));

/*
 * Usage is an institution-level fact, so its administrators can see it — they
 * are the ones paying. A teacher sees their own. Neither can see another
 * institution's, and there is no update or delete policy: a spend record that
 * can be edited is not a spend record.
 */
create policy ai_usage_select on public.ai_usage_events
  for select to authenticated
  using (
    actor_id = (select auth.uid())
    or (
      (select private.is_active())
      and institution_id = (select private.auth_institution_id())
      and (select private.has_permission('settings.read'))
    )
    or (select private.is_hq())
  );

create policy ai_usage_insert on public.ai_usage_events
  for insert to authenticated
  with check (
    institution_id = (select private.auth_institution_id())
    and actor_id = (select auth.uid())
  );
