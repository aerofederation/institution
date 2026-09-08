import { z } from 'zod'

import {
  applicationRefField,
  checkboxField,
  codeField,
  emailField,
  nameField,
  optionalNumber,
  optionalPhoneField,
  optionalText,
  optionalWebsiteField,
  phoneField,
  postalCodeField,
} from './common'

/**
 * Institution application schemas.
 *
 * One schema per wizard step, plus a composed schema for submission. Steps are
 * validated independently so a partially complete draft can be saved without
 * pretending the whole form is valid, while `institutionApplicationSchema`
 * enforces everything that must be present before an application is submitted.
 */

export const INSTITUTION_TYPES = [
  'SCHOOL',
  'COLLEGE',
  'UNIVERSITY',
  'POLYTECHNIC',
  'ENGINEERING_INSTITUTION',
  'TRAINING_INSTITUTE',
  'RESEARCH_INSTITUTION',
  'AEROSPACE_INSTITUTION',
  'AVIATION_INSTITUTION',
  'CORPORATE_ORGANIZATION',
  'CORPORATE_TRAINING_ORGANIZATION',
  'GOVERNMENT_ORGANIZATION',
  'NGO',
  'EDUCATIONAL_ORGANIZATION',
  'OTHER',
] as const

export const INSTITUTION_CATEGORIES = [
  'GOVERNMENT',
  'PRIVATE',
  'AIDED',
  'UNAIDED',
  'AUTONOMOUS',
  'DEEMED',
  'PUBLIC_SECTOR',
  'NON_PROFIT',
  'OTHER',
] as const

export const DOCUMENT_TYPES = [
  'REGISTRATION_CERTIFICATE',
  'ACCREDITATION_CERTIFICATE',
  'AFFILIATION_LETTER',
  'RECOGNITION_ORDER',
  'TAX_DOCUMENT',
  'AUTHORIZATION_LETTER',
  'IDENTITY_PROOF',
  'ADDRESS_PROOF',
  'INFRASTRUCTURE_PROOF',
  'OTHER',
] as const

const currentYear = new Date().getFullYear()

/** Step 1 — organization */
export const applicationOrganizationSchema = z.object({
  institution_name: z.string().trim().min(2, 'Enter the institution name').max(200),
  institution_type: z.enum(INSTITUTION_TYPES),
  category: z.enum(INSTITUTION_CATEGORIES),
  official_email: emailField,
  official_phone: optionalPhoneField,
  website: optionalWebsiteField,
  year_established: z
    .union([z.coerce.number().int().min(1800).max(currentYear), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
  registration_number: optionalText(100),
  description: optionalText(5000),
  field_of_work: optionalText(300),
})

/** Step 2 — address */
export const applicationAddressSchema = z.object({
  address_line: optionalText(300),
  city: optionalText(120),
  state: optionalText(120),
  country: z.string().trim().min(2).max(100).default('India'),
  postal_code: z
    .union([postalCodeField, z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
})

/** Step 3 — authorized representative */
export const applicationRepresentativeSchema = z.object({
  representative_name: nameField,
  representative_designation: z.string().trim().min(2, 'Enter a designation').max(120),
  representative_email: emailField,
  representative_phone: phoneField,
})

/** Step 4 — institution detail */
export const applicationDetailSchema = z.object({
  estimated_student_count: z.coerce.number().int().min(0).max(1_000_000).nullish(),
  estimated_teacher_count: z.coerce.number().int().min(0).max(100_000).nullish(),
  departments: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  programs: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  specializations: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  aerospace_relevance: optionalText(3000),
})

/** Step 5 — documents */
export const applicationDocumentSchema = z.object({
  document_type: z.enum(DOCUMENT_TYPES),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.enum([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]),
  // 25 MiB, matching both the storage bucket limit and the CHECK constraint on
  // institution_documents.file_size.
  file_size: z.coerce.number().int().min(1).max(26_214_400, 'Files must be 25 MB or smaller'),
})
export type ApplicationDocumentInput = z.infer<typeof applicationDocumentSchema>

/** Steps 1–4 combined, as required at submission. */
export const institutionApplicationSchema = applicationOrganizationSchema
  .extend(applicationAddressSchema.shape)
  .extend(applicationRepresentativeSchema.shape)
  .extend(applicationDetailSchema.shape)
  .extend({
    applicant_email: emailField,
  })
export type InstitutionApplicationInput = z.infer<typeof institutionApplicationSchema>

/**
 * Application tracking lookup.
 *
 * Requires the reference AND the registered email. Knowing a reference is never
 * sufficient — the pair is exchanged for a one-time code delivered to the
 * address on file, so the endpoint cannot be used to discover which
 * institutions have applied.
 */
export const applicationLookupSchema = z.object({
  application_ref: applicationRefField,
  email: emailField,
})
export type ApplicationLookupInput = z.infer<typeof applicationLookupSchema>

export const applicationOtpSchema = z.object({
  application_ref: applicationRefField,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
})

/** HQ review decisions. */
export const applicationDecisionSchema = z
  .object({
    application_id: z.uuid(),
    decision: z.enum([
      'UNDER_REVIEW',
      'DOCUMENTS_REQUIRED',
      'RESUBMISSION_REQUIRED',
      'APPROVED',
      'REJECTED',
    ]),
    comments: optionalText(4000),
    required_actions: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  })
  .refine(
    (values) => values.decision !== 'REJECTED' || (values.comments?.length ?? 0) > 0,
    { message: 'A rejection must state a reason', path: ['comments'] },
  )
  .refine(
    (values) =>
      !['DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED'].includes(values.decision) ||
      values.required_actions.length > 0,
    { message: 'List what the applicant needs to provide', path: ['required_actions'] },
  )
export type ApplicationDecisionInput = z.infer<typeof applicationDecisionSchema>

/** Editing an approved institution's own profile. */
export const institutionProfileSchema = z.object({
  name: z.string().trim().min(2).max(200),
  official_email: emailField,
  official_phone: optionalPhoneField,
  website: optionalWebsiteField,
  description: optionalText(5000),
  field_of_work: optionalText(300),
  /*
   * Facts about the institution rather than its standing in the federation, so
   * they belong to whoever runs it. They were missing from this schema, which
   * meant a registration number entered at application could never afterwards
   * be corrected by anybody.
   */
  registration_number: optionalText(100),
  year_established: optionalNumber({ min: 1800, max: new Date().getFullYear(), int: true }),
  address_line: optionalText(300),
  city: optionalText(120),
  state: optionalText(120),
  country: z.string().trim().min(2).max(100),
  postal_code: z
    .union([postalCodeField, z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish(),
})
export type InstitutionProfileInput = z.infer<typeof institutionProfileSchema>

/*
 * `slug`, `status`, `approved_at` and `approved_by` are absent by design.
 * The slug is derived server-side from the institution name at approval, and
 * the rest belong to the HQ workflow. An institution cannot edit its own
 * standing in the federation.
 */

/**
 * HQ correcting the federation's record of an institution.
 *
 * Everything the institution may edit about itself, plus the two fields it may
 * not: `institution_type` and `category` were verified by HQ at approval, so
 * HQ is who fixes them when they are wrong.
 *
 * `status` is still absent. Suspending or reactivating an institution is a
 * separate action with its own reason, its own audit entry and its own
 * confirmation — folding it into a details form would make it something an
 * administrator could do by accident while fixing a postcode.
 */
export const hqInstitutionSchema = institutionProfileSchema.extend({
  institution_type: z.enum(INSTITUTION_TYPES),
  category: z.enum(INSTITUTION_CATEGORIES),
})
export type HqInstitutionInput = z.infer<typeof hqInstitutionSchema>

/** The same fields, plus which institution is being corrected. */
export const hqInstitutionUpdateSchema = hqInstitutionSchema.extend({
  institution_id: z.uuid(),
})
export type HqInstitutionUpdateInput = z.infer<typeof hqInstitutionUpdateSchema>

export const departmentSchema = z.object({
  code: codeField,
  name: z.string().trim().min(2).max(150),
  description: optionalText(2000),
})

export const academicYearSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    starts_on: z.iso.date(),
    ends_on: z.iso.date(),
    is_current: checkboxField,
  })
  .refine((values) => values.ends_on > values.starts_on, {
    message: 'The end date must fall after the start date',
    path: ['ends_on'],
  })
