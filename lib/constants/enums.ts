import type {
  ApplicationStatus,
  DocumentType,
  InstitutionCategory,
  InstitutionStatus,
  InstitutionType,
  UserStatus,
  VerificationStatus,
} from '@/types/database.generated'

/**
 * Runtime companions to the generated enum types.
 *
 * The generated types describe what PostgreSQL accepts, but a filter arriving
 * in a query string is just a string. These arrays let a URL parameter be
 * *narrowed* rather than cast — an unrecognised value becomes `undefined` and
 * the filter is simply not applied, instead of reaching the database as a bad
 * enum literal and turning a mistyped URL into a 500.
 *
 * `satisfies` ties each array to its generated type, so removing a value from
 * the database enum without updating this file is a compile error.
 */

export const INSTITUTION_STATUSES = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
] as const satisfies readonly InstitutionStatus[]

export const USER_STATUSES = [
  'INVITED',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
] as const satisfies readonly UserStatus[]

export const APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCUMENTS_REQUIRED',
  'RESUBMISSION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const satisfies readonly ApplicationStatus[]

export const VERIFICATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const satisfies readonly VerificationStatus[]

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
] as const satisfies readonly InstitutionType[]

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
] as const satisfies readonly InstitutionCategory[]

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
] as const satisfies readonly DocumentType[]

export const ROLE_CODES_LIST = [
  'HQ_ADMIN',
  'INSTITUTION_ADMIN',
  'TEACHER',
  'STUDENT',
] as const

/** Narrows an untrusted string to a member of `values`, or `undefined`. */
export function narrow<T extends string>(
  values: readonly T[],
  input: string | undefined | null,
): T | undefined {
  if (!input) return undefined
  return (values as readonly string[]).includes(input) ? (input as T) : undefined
}

/** `SCREAMING_SNAKE` → `Title case`, for labels and filter options. */
export function humaniseEnum(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Builds `{ value, label }` options for a `FilterSelect`. */
export function toOptions(values: readonly string[]) {
  return values.map((value) => ({ value, label: humaniseEnum(value) }))
}
