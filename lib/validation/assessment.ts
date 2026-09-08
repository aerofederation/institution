import { z } from 'zod'

import { checkboxField, optionalNumber, optionalText, optionalUuid } from './common'

/**
 * The assessment engine's vocabulary, as the application validates it.
 *
 * Same discipline as everywhere else: no `institution_id`, no `teacher_id`, no
 * `status`, no `score`. The tenant and the author come from the acting
 * teacher's session; status moves through its own state machine; scores are
 * computed in the database. None of them are expressible in a request, so none
 * of them can be forged in one.
 *
 * Every schema here is used on the server. The client shares them so a form can
 * show a field-level error without a round trip, but the server parse is the
 * one that decides — a client that skipped validation entirely would get the
 * same answer, just later.
 */

export const ASSESSMENT_KINDS = ['ASSIGNMENT', 'QUIZ', 'TEST', 'EXAM', 'PRACTICE'] as const
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number]

export const ASSESSMENT_STATUSES = [
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ACTIVE',
  'CLOSED',
  'GRADING',
  'COMPLETED',
  'ARCHIVED',
] as const
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number]

export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'LONG_ANSWER',
  'FILL_BLANK',
  'NUMERICAL',
  'MATCHING',
  'ORDERING',
  'FILE_UPLOAD',
  'CASE_STUDY',
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const RELEASE_POLICIES = ['IMMEDIATE', 'AFTER_GRADING', 'AFTER_CLOSE', 'MANUAL'] as const
export const ATTEMPT_SCORING = ['HIGHEST', 'LATEST', 'AVERAGE', 'FIRST'] as const
export const DIFFICULTIES = ['EASY', 'MODERATE', 'HARD'] as const

/**
 * Which question types the engine marks by itself.
 *
 * Stated once, here, and used by the builder, the publish check and the
 * grading screen — so "can this be auto-marked" has exactly one answer in the
 * codebase. `SHORT_ANSWER` is conditional: it is auto-marked only when the
 * teacher supplied accepted answers, which is why it appears in neither list.
 */
export const AUTO_MARKED_TYPES: readonly QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'NUMERICAL',
  'MATCHING',
  'ORDERING',
]

export const MANUAL_ONLY_TYPES: readonly QuestionType[] = [
  'LONG_ANSWER',
  'CASE_STUDY',
  'FILE_UPLOAD',
]

/** Types whose answer key lives in `assessment_options`. */
export const OPTION_TYPES: readonly QuestionType[] = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'MATCHING',
  'ORDERING',
]

/** Defaults that differ by kind. The engine underneath is identical. */
export const KIND_DEFAULTS: Record<
  AssessmentKind,
  { duration_minutes: number | null; max_attempts: number; release_policy: string; negative_marking: boolean }
> = {
  ASSIGNMENT: { duration_minutes: null, max_attempts: 1, release_policy: 'AFTER_GRADING', negative_marking: false },
  QUIZ: { duration_minutes: 15, max_attempts: 2, release_policy: 'IMMEDIATE', negative_marking: false },
  TEST: { duration_minutes: 45, max_attempts: 1, release_policy: 'AFTER_GRADING', negative_marking: false },
  EXAM: { duration_minutes: 120, max_attempts: 1, release_policy: 'MANUAL', negative_marking: true },
  PRACTICE: { duration_minutes: null, max_attempts: 10, release_policy: 'IMMEDIATE', negative_marking: false },
}

/*
 * An absolute instant, never a bare wall clock.
 *
 * `2026-09-15T09:00` carries no offset, so the database resolves it against
 * its own session timezone (UTC) rather than the teacher's — which silently
 * moved every schedule by the teacher's offset. Refusing the offsetless form
 * means a caller that regresses fails validation loudly instead of storing the
 * wrong time. `DateTimePicker` resolves the offset in the browser, which is
 * the only place that knows it.
 */
const instant = z
  .union([z.iso.datetime({ offset: true }), z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullish()

// ── The assessment ──────────────────────────────────────────────────────────

export const assessmentDetailsSchema = z
  .object({
    kind: z.enum(ASSESSMENT_KINDS),
    title: z.string().trim().min(2, 'Enter a title').max(200),
    instructions: optionalText(10_000),

    class_id: z.uuid('Choose a class'),
    section_id: optionalUuid,
    subject_id: optionalUuid,
    academic_year_id: z.uuid('Choose an academic year'),

    duration_minutes: optionalNumber({ min: 1, max: 600, int: true }),
    max_attempts: z.coerce.number().int().min(1).max(10),
    pass_marks: optionalNumber({ min: 0, max: 10_000 }),

    opens_at: instant,
    closes_at: instant,

    difficulty: z
      .union([z.enum(DIFFICULTIES), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
  })
  .refine((values) => !values.opens_at || !values.closes_at || values.closes_at > values.opens_at, {
    message: 'The closing time must be after the opening time',
    path: ['closes_at'],
  })
export type AssessmentDetailsInput = z.infer<typeof assessmentDetailsSchema>

export const assessmentSettingsSchema = z.object({
  assessment_id: z.uuid(),

  /*
   * Off means nothing is marked automatically — every question waits for the
   * teacher, whatever the answer key says. Default on, because that is what
   * most papers want and the alternative is a lot of hand-marking.
   */
  auto_marking: checkboxField,
  negative_marking: checkboxField,
  shuffle_questions: checkboxField,
  shuffle_options: checkboxField,
  questions_to_serve: optionalNumber({ min: 1, max: 500, int: true }),

  allow_pause: checkboxField,
  allow_late: checkboxField,
  grace_minutes: z.coerce.number().int().min(0).max(180),
  late_penalty_percent: z.coerce.number().min(0).max(100),

  attempt_scoring: z.enum(ATTEMPT_SCORING),
  release_policy: z.enum(RELEASE_POLICIES),
  reveal_answers: checkboxField,
})
export type AssessmentSettingsInput = z.infer<typeof assessmentSettingsSchema>

export const sectionSchema = z.object({
  assessment_id: z.uuid(),
  title: z.string().trim().min(1, 'Name the section').max(150),
  instructions: optionalText(5000),
})

// ── Questions ───────────────────────────────────────────────────────────────

const optionSchema = z.object({
  label: z.string().trim().min(1, 'Enter the option text').max(1000),
  /** MATCHING only: the right-hand item this option pairs with. */
  match_label: optionalText(1000),
  is_correct: z.boolean().default(false),
})

export const assessmentQuestionSchema = z
  .object({
    assessment_id: z.uuid(),
    section_id: optionalUuid,
    question_type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, 'Enter the question').max(5000),
    passage: optionalText(20_000),

    marks: z.coerce.number().min(0.5, 'Marks must be at least 0.5').max(1000),
    negative_marks: z.coerce.number().min(0).max(1000).default(0),
    allow_partial_credit: checkboxField,
    explanation: optionalText(5000),
    /*
     * The standard a written answer is marked against. Optional — a teacher may
     * mark from their own head — but AI grading declines without one rather
     * than inventing a standard nobody set.
     */
    rubric: optionalText(5000),

    difficulty: z
      .union([z.enum(DIFFICULTIES), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    topic: optionalText(150),
    learning_objective: optionalText(300),

    // SHORT_ANSWER and FILL_BLANK. One entry per blank; `|` separates
    // alternatives within an entry.
    accepted_answers: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
    case_sensitive: checkboxField,
    trim_whitespace: z.union([z.boolean(), z.string()]).optional().transform((v) => v !== false && v !== 'false'),

    // NUMERICAL
    numeric_answer: z
      .union([z.coerce.number(), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    numeric_tolerance: optionalNumber({ min: 0, max: 1_000_000 }),
    numeric_unit: optionalText(32),

    // FILE_UPLOAD
    allowed_mime_types: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    max_file_bytes: optionalNumber({ min: 1, max: 104_857_600, int: true }),

    options: z.array(optionSchema).max(20, 'Twenty options is the most a question can have').default([]),
  })
  .superRefine((values, ctx) => {
    const type = values.question_type

    if (type === 'NUMERICAL' && values.numeric_answer === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'A numerical question needs the correct value',
        path: ['numeric_answer'],
      })
    }

    if (type === 'FILL_BLANK' && values.accepted_answers.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give the accepted answer for each blank, in order',
        path: ['accepted_answers'],
      })
    }

    if (!OPTION_TYPES.includes(type)) return

    if (type === 'ORDERING') {
      if (values.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          message: 'Give at least two items to put in order',
          path: ['options'],
        })
      }
      // The correct sequence is the order they were entered in, so there is no
      // separate answer key to validate.
      return
    }

    if (type === 'MATCHING') {
      if (values.options.length < 2) {
        ctx.addIssue({ code: 'custom', message: 'Give at least two pairs', path: ['options'] })
      }
      if (values.options.some((option) => !option.match_label)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Every left-hand item needs something to match it to',
          path: ['options'],
        })
      }
      return
    }

    if (values.options.length < 2) {
      ctx.addIssue({
        code: 'custom',
        message: 'Give at least two options to choose between',
        path: ['options'],
      })
      return
    }

    const correct = values.options.filter((option) => option.is_correct).length

    if (correct === 0) {
      ctx.addIssue({ code: 'custom', message: 'Mark which option is correct', path: ['options'] })
    }

    // A single-answer question with two correct options cannot be scored: the
    // grader wants an exact match, so nobody could ever pass it.
    if (type !== 'MULTI_CHOICE' && correct > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'This question type allows only one correct option',
        path: ['options'],
      })
    }
  })
export type AssessmentQuestionInput = z.infer<typeof assessmentQuestionSchema>

// ── Question bank ───────────────────────────────────────────────────────────

/**
 * The extra fields a bank question carries beyond an assessment question.
 *
 * `assessmentQuestionSchema` ends in a `superRefine`, and a refined schema has
 * no `.omit()` or `.extend()` — so the bank cannot be derived from it. Rather
 * than duplicate three hundred lines of rules, the service parses a bank
 * submission against both: this for what is specific, the question schema for
 * the marking rules they share. One definition of "is this question valid",
 * used twice.
 */
export const bankQuestionSchema = z.object({
  subject_id: optionalUuid,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
})

export const bankFilterSchema = z.object({
  q: optionalText(200),
  subject_id: optionalUuid,
  question_type: z.union([z.enum(QUESTION_TYPES), z.literal('')]).optional(),
  difficulty: z.union([z.enum(DIFFICULTIES), z.literal('')]).optional(),
  topic: optionalText(150),
  page: z.coerce.number().int().min(1).default(1),
})
export type BankFilterInput = z.infer<typeof bankFilterSchema>

// ── Grading ─────────────────────────────────────────────────────────────────

export const gradeAnswerSchema = z.object({
  answer_id: z.uuid(),
  assessment_id: z.uuid(),
  marks: z.coerce.number().min(0, 'Marks cannot be negative'),
  feedback: optionalText(5000),
})
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>

// ── Sitting a paper ─────────────────────────────────────────────────────────

export const attemptAnswerSchema = z.object({
  attempt_id: z.uuid(),
  question_id: z.uuid(),
  option_ids: z.array(z.uuid()).max(20).default([]),
  text_answer: optionalText(20_000),
  /**
   * Structured answers.
   *
   *   MATCHING    { pairs: { "<option_id>": "<match label>" } }
   *   ORDERING    { order: ["<option_id>", …] }
   *   FILL_BLANK  { blanks: ["…", …] }
   *
   * Kept as jsonb rather than encoded into a string, so the marking function
   * reads a structure instead of parsing one.
   */
  payload: z.record(z.string(), z.unknown()).default({}),
})
export type AttemptAnswerInput = z.infer<typeof attemptAnswerSchema>

export const integrityEventSchema = z.object({
  attempt_id: z.uuid(),
  event: z.enum([
    'TAB_HIDDEN',
    'TAB_VISIBLE',
    'WINDOW_BLUR',
    'WINDOW_FOCUS',
    'PASTE',
  ]),
})
