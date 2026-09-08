import { z } from 'zod'

import { checkboxField, codeField, optionalNumber, optionalText, optionalUuid } from './common'

/**
 * Academic structure schemas.
 *
 * As in `lib/validation/members`, there is no `institution_id` anywhere in this
 * file. The tenant comes from the acting administrator's session, and the
 * composite foreign keys in the schema carry it into every reference — so a
 * class cannot be attached to another institution's academic year even by a
 * caller holding the service role.
 *
 * `departmentSchema` and `academicYearSchema` are re-exported from
 * `lib/validation/institution`, where they were defined in Phase 2, so that
 * every academic schema is reachable from one import without duplicating a
 * definition.
 */

export { academicYearSchema, departmentSchema } from './institution'

export const programSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2, 'Enter a programme name').max(150),
  department_id: optionalUuid,
  level: optionalText(50),
  duration_months: optionalNumber({ min: 1, max: 120, int: true }),
  description: optionalText(2000),
})
export type ProgramInput = z.infer<typeof programSchema>

export const classSchema = z.object({
  name: z.string().trim().min(1, 'Enter a class name').max(100),
  academic_year_id: z.uuid('Choose an academic year'),
  program_id: optionalUuid,
  department_id: optionalUuid,
  code: z
    .union([codeField, z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  /** Orders classes for display — year 1 before year 2, not alphabetically. */
  level_order: optionalNumber({ min: 0, max: 100, int: true }),
  capacity: optionalNumber({ min: 1, max: 10_000, int: true }),
})
export type ClassInput = z.infer<typeof classSchema>

export const sectionSchema = z.object({
  name: z.string().trim().min(1, 'Enter a section name').max(50),
  class_id: z.uuid('Choose a class'),
  capacity: optionalNumber({ min: 1, max: 1000, int: true }),
})
export type SectionInput = z.infer<typeof sectionSchema>

/**
 * A subject the institution teaches.
 *
 * `department_id` is optional because a small institution may not use
 * departments at all, and the column is `on delete set null` — a subject
 * outlives the department it was filed under.
 */
export const subjectSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2, 'Enter a subject name').max(150),
  department_id: optionalUuid,
  credits: optionalNumber({ min: 0, max: 100 }),
  is_elective: checkboxField,
  description: optionalText(2000),
})
export type SubjectInput = z.infer<typeof subjectSchema>

/**
 * Assigning a teacher to a class.
 *
 * This is what makes `private.teaches_class()` true, and therefore what lets a
 * teacher publish anything at all. `institution_id` is absent for the usual
 * reason — it comes from the acting administrator's session — and so is
 * `status`, which is not an administrator's to set from a form.
 */
export const teachingAssignmentSchema = z.object({
  teacher_id: z.uuid('Choose a teacher'),
  class_id: z.uuid('Choose a class'),
  section_id: optionalUuid,
  academic_year_id: z.uuid('Choose an academic year'),
  is_class_teacher: checkboxField,
})
export type TeachingAssignmentInput = z.infer<typeof teachingAssignmentSchema>
