-- ============================================================================
-- 028 · Vocabulary for the full assessment engine
-- ============================================================================
-- Enum values only. Nothing here uses them.
--
-- That split is forced rather than stylistic: `ALTER TYPE … ADD VALUE` may run
-- inside a transaction, but the value cannot be *used* until that transaction
-- commits, and the Supabase CLI wraps each migration in one. A single migration
-- that both added `'EXAM'` and inserted a row with it would fail with "unsafe
-- use of new value of enum type". So the vocabulary lands here and the schema
-- that speaks it lands in 029.
--
-- Everything is additive. No existing value is renamed or removed, so every row
-- already in the database keeps its meaning and nothing that reads these types
-- changes behaviour.
-- ============================================================================

-- ── What kind of thing is being set ─────────────────────────────────────────
-- QUIZ and TEST already exist. The three below complete the set the platform
-- needs; they share one engine and differ in their defaults, not their
-- mechanics.

alter type public.assessment_kind add value if not exists 'ASSIGNMENT';
alter type public.assessment_kind add value if not exists 'EXAM';
alter type public.assessment_kind add value if not exists 'PRACTICE';

-- ── How a question is asked and marked ──────────────────────────────────────
-- SINGLE_CHOICE, MULTI_CHOICE, TRUE_FALSE and SHORT_ANSWER already exist.
--
-- Each addition below is one this engine can genuinely mark or genuinely route
-- to a human. There is deliberately no CODING type: running submitted code
-- needs a sandbox this platform does not have, and a "coding question" that
-- cannot execute anything is a text box with a misleading label.
--
-- IMAGE is likewise absent as a *type*. An image is a property of a question,
-- not a way of answering one, so it becomes a media column in 029 and any
-- question type can carry one.

alter type public.question_type add value if not exists 'LONG_ANSWER';
alter type public.question_type add value if not exists 'FILL_BLANK';
alter type public.question_type add value if not exists 'NUMERICAL';
alter type public.question_type add value if not exists 'MATCHING';
alter type public.question_type add value if not exists 'ORDERING';
alter type public.question_type add value if not exists 'FILE_UPLOAD';
alter type public.question_type add value if not exists 'CASE_STUDY';

-- ── Where an attempt can get to ─────────────────────────────────────────────
-- IN_PROGRESS, SUBMITTED, GRADED and ABANDONED already exist. EXPIRED
-- distinguishes "ran out of time and was finalised by the server" from "the
-- student pressed submit", which matters both to a teacher reading a list and
-- to the integrity record.

alter type public.attempt_status add value if not exists 'EXPIRED';

-- ── New types ───────────────────────────────────────────────────────────────

/*
 * The assessment lifecycle.
 *
 * Migration 020 modelled publication as a single boolean. That is enough for a
 * quiz and not enough for an exam: an exam is scheduled before it opens, closes
 * on its own, waits for marking, and is eventually archived. The transitions
 * are constrained in 029 — a status column that anything may set to anything is
 * documentation, not a state machine.
 */
create type public.assessment_status as enum (
  'DRAFT',       -- being written; invisible to students
  'SCHEDULED',   -- published, but its window has not opened
  'PUBLISHED',   -- open-ended availability, students may start now
  'ACTIVE',      -- inside its scheduled window
  'CLOSED',      -- window passed; no new attempts
  'GRADING',     -- closed, and manual marking is outstanding
  'COMPLETED',   -- everything marked and results released
  'ARCHIVED'     -- retained for the record, out of the way
);

/*
 * When a student may see their marks.
 *
 * The default is deliberately not "immediately": an assessment with a single
 * essay in it would otherwise show a student a score of zero the moment they
 * submit, before anybody had read a word of it.
 */
create type public.result_release as enum (
  'IMMEDIATE',      -- as soon as auto-marking finishes
  'AFTER_GRADING',  -- once every manual mark is in
  'AFTER_CLOSE',    -- once the assessment's window has closed
  'MANUAL'          -- when the teacher releases them
);

/*
 * Which attempt counts when several are allowed.
 *
 * Chosen by the teacher, stored on the assessment, and applied server-side.
 * A student cannot influence it.
 */
create type public.attempt_scoring as enum (
  'HIGHEST',
  'LATEST',
  'AVERAGE',
  'FIRST'
);

/*
 * Integrity signals.
 *
 * These record what the browser reported, and nothing more. They do not prevent
 * anything and must never be described as if they do — a determined person has
 * a second device. They are useful to a teacher as context beside a result, and
 * that is the whole claim.
 */
create type public.integrity_event as enum (
  'TAB_HIDDEN',
  'TAB_VISIBLE',
  'WINDOW_BLUR',
  'WINDOW_FOCUS',
  'ATTEMPT_RESUMED',
  'SECOND_SESSION',   -- the same attempt opened from another session
  'PASTE',
  'TIME_EXPIRED'
);
