import { z } from 'zod'

import { checkboxField, optionalNumber, optionalText, optionalUuid } from './common'

/**
 * Teaching content schemas.
 *
 * Same discipline as everywhere else: no `institution_id`, and — new here — no
 * `teacher_id`. Authorship comes from the acting teacher's session, so a
 * request cannot ask to publish under a colleague's name. RLS re-checks it
 * (`teacher_id = auth.uid()` in every WITH CHECK), so neither layer is the only
 * one standing there.
 *
 * `is_published` is accepted, because publishing is the deliberate act these
 * forms exist to perform. `published_at` is not: the server stamps it, since a
 * client-supplied timestamp on a "published at" column is a claim, not a fact.
 */

export const MATERIAL_TYPES = ['DOCUMENT', 'LINK', 'NOTE'] as const
export const ASSESSMENT_KINDS = ['QUIZ', 'TEST'] as const
export const QUESTION_TYPES = [
  'SINGLE_CHOICE',
  'MULTI_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
] as const

/** Fields every piece of content shares: who it is for. */
const delivery = {
  class_id: z.uuid('Choose a class'),
  section_id: optionalUuid,
  subject_id: optionalUuid,
  academic_year_id: z.uuid('Choose an academic year'),
}

// ── Materials ───────────────────────────────────────────────────────────────

export const materialSchema = z
  .object({
    ...delivery,
    title: z.string().trim().min(2, 'Enter a title').max(200),
    description: optionalText(5000),
    material_type: z.enum(MATERIAL_TYPES),
    external_url: z
      .union([z.url('Enter a valid link'), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    is_published: checkboxField,
  })
  // The database enforces the same rule with `materials_payload_coherent`. It
  // is repeated here so the applicant sees which field is at fault rather than
  // a constraint name.
  .refine((values) => values.material_type !== 'LINK' || Boolean(values.external_url), {
    message: 'A link material needs a URL',
    path: ['external_url'],
  })
  .refine((values) => values.material_type !== 'NOTE' || Boolean(values.description), {
    message: 'A note needs some content',
    path: ['description'],
  })
export type MaterialInput = z.infer<typeof materialSchema>

/** Metadata for a file being attached to a material or assignment. */
export const contentFileSchema = z.object({
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(1).max(200),
  file_size: z.coerce.number().int().min(1).max(209_715_200, 'Files must be 200 MB or smaller'),
})
export type ContentFileInput = z.infer<typeof contentFileSchema>

// ── Assignments ─────────────────────────────────────────────────────────────

export const assignmentSchema = z.object({
  ...delivery,
  title: z.string().trim().min(2, 'Enter a title').max(200),
  instructions: optionalText(20_000),
  max_marks: z.coerce.number().min(1, 'Marks must be at least 1').max(1000),
  due_at: z.iso.datetime({ local: true, message: 'Choose a due date and time' }),
  allow_late: checkboxField,
  is_published: checkboxField,
})
export type AssignmentInput = z.infer<typeof assignmentSchema>

export const submissionSchema = z.object({
  assignment_id: z.uuid(),
  response_text: optionalText(20_000),
})
export type SubmissionInput = z.infer<typeof submissionSchema>

export const gradeSubmissionSchema = z.object({
  submission_id: z.uuid(),
  marks: z.coerce.number().min(0, 'Marks cannot be negative'),
  feedback: optionalText(5000),
})
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>

// ── Assessments ─────────────────────────────────────────────────────────────

export const assessmentSchema = z
  .object({
    ...delivery,
    kind: z.enum(ASSESSMENT_KINDS),
    title: z.string().trim().min(2, 'Enter a title').max(200),
    instructions: optionalText(10_000),
    duration_minutes: optionalNumber({ min: 1, max: 600, int: true }),
    pass_marks: optionalNumber({ min: 0, max: 1000 }),
    max_attempts: z.coerce.number().int().min(1).max(10),
    opens_at: z
      .union([z.iso.datetime({ local: true }), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    closes_at: z
      .union([z.iso.datetime({ local: true }), z.literal('')])
      .transform((value) => (value === '' ? null : value))
      .nullish(),
    shuffle_questions: checkboxField,
    reveal_answers: checkboxField,
    is_published: checkboxField,
  })
  .refine(
    (values) => !values.opens_at || !values.closes_at || values.closes_at > values.opens_at,
    { message: 'The closing time must be after the opening time', path: ['closes_at'] },
  )
export type AssessmentInput = z.infer<typeof assessmentSchema>

/**
 * A question and its options, saved together.
 *
 * They are one form and one transaction because a choice question without
 * options is not a question — saving them separately would allow a paper to
 * exist in a state no student could answer.
 */
export const questionSchema = z
  .object({
    assessment_id: z.uuid(),
    question_type: z.enum(QUESTION_TYPES),
    prompt: z.string().trim().min(1, 'Enter the question').max(5000),
    marks: z.coerce.number().min(0.5, 'Marks must be at least 0.5').max(1000),
    explanation: optionalText(5000),
    options: z
      .array(
        z.object({
          label: z.string().trim().min(1, 'Enter the option text').max(1000),
          is_correct: z.boolean(),
        }),
      )
      .max(10, 'Ten options is the most a question can have')
      .default([]),
  })
  .superRefine((values, ctx) => {
    const needsOptions = values.question_type !== 'SHORT_ANSWER'
    if (!needsOptions) return

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
      ctx.addIssue({
        code: 'custom',
        message: 'Mark which option is correct',
        path: ['options'],
      })
    }

    // A single-choice question with two correct answers cannot be scored: the
    // grader requires an exact match, so nobody could ever pass it.
    if (values.question_type !== 'MULTI_CHOICE' && correct > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'This question type allows only one correct option',
        path: ['options'],
      })
    }
  })
export type QuestionInput = z.infer<typeof questionSchema>

export const answerSchema = z.object({
  attempt_id: z.uuid(),
  question_id: z.uuid(),
  option_ids: z.array(z.uuid()).max(10).default([]),
  text_answer: optionalText(10_000),
  /** Structured answers: matching pairs, ordering, fill-in-the-blank. */
  payload: z.record(z.string(), z.unknown()).default({}),
})
export type AnswerInput = z.infer<typeof answerSchema>
