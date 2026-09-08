import { z } from 'zod'

import {
  codeField,
  emailField,
  nameField,
  optionalDate,
  optionalNumber,
  optionalPhoneField,
  optionalText,
  optionalUuid,
} from './common'

/**
 * Teacher and student provisioning schemas.
 *
 * The critical property of every schema in this file is what it does NOT
 * contain: there is no `institution_id`, no `role`, and no `status`.
 *
 * The tenant is taken from the acting administrator's session context, the role
 * is fixed by which service is being called, and status follows the invitation
 * lifecycle. If those fields were accepted here, a well-formed request could
 * ask to create a teacher in somebody else's institution — and the only thing
 * standing between that request and the database would be a reviewer noticing.
 * Leaving them out means the request cannot even express the idea.
 */

export const createTeacherSchema = z.object({
  full_name: nameField,
  email: emailField,
  phone: optionalPhoneField,
  employee_id: codeField,
  department_id: optionalUuid,
  qualification: optionalText(300),
  specialization: optionalText(300),
  experience_years: optionalNumber({ min: 0, max: 70 }),
  joining_date: optionalDate,
  bio: optionalText(2000),
})
export type CreateTeacherInput = z.infer<typeof createTeacherSchema>

/** Email is omitted: changing it is an Auth-verified flow, not a profile edit. */
export const updateTeacherSchema = createTeacherSchema.omit({ email: true }).partial().extend({
  profile_id: z.uuid(),
})
export type UpdateTeacherInput = z.infer<typeof updateTeacherSchema>

export const createStudentSchema = z.object({
  full_name: nameField,
  email: emailField,
  phone: optionalPhoneField,
  student_code: codeField,
  admission_number: optionalText(40),
  department_id: optionalUuid,
  program_id: optionalUuid,
  academic_year_id: optionalUuid,
  class_id: optionalUuid,
  section_id: optionalUuid,
  guardian_name: optionalText(150),
  guardian_phone: optionalPhoneField,
  guardian_email: z
    .union([emailField, z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  admission_date: optionalDate,
})
  // A section only means something inside a class; the database enforces the
  // same rule with a CHECK constraint and a composite foreign key.
  .refine((values) => !values.section_id || Boolean(values.class_id), {
    message: 'Choose a class before choosing a section',
    path: ['section_id'],
  })
export type CreateStudentInput = z.infer<typeof createStudentSchema>

export const updateStudentSchema = z.object({
  profile_id: z.uuid(),
  full_name: nameField.optional(),
  phone: optionalPhoneField,
  student_code: codeField.optional(),
  admission_number: optionalText(40),
  department_id: optionalUuid,
  program_id: optionalUuid,
  academic_year_id: optionalUuid,
  class_id: optionalUuid,
  section_id: optionalUuid,
  guardian_name: optionalText(150),
  guardian_phone: optionalPhoneField,
  guardian_email: z
    .union([emailField, z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  admission_date: optionalDate,
})
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>

/**
 * Suspending or reactivating a member.
 *
 * `status` IS accepted here, unlike everywhere else, because this is the
 * administrative action whose entire purpose is to set it. It runs through
 * `authorize({ permission: 'teacher.suspend' })` and the target is verified to
 * belong to the caller's tenant before anything is written.
 */
export const setMemberStatusSchema = z.object({
  profile_id: z.uuid(),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: optionalText(1000),
})
export type SetMemberStatusInput = z.infer<typeof setMemberStatusSchema>
