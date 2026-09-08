import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import type { ZodObject, ZodRawShape, ZodType } from 'zod'

import {
  applicationAddressSchema,
  applicationDetailSchema,
  applicationOrganizationSchema,
  applicationRepresentativeSchema,
} from '@/lib/validation/institution'

/**
 * The form and the schema that validates it must agree.
 *
 * This exists because of a bug that made the application impossible to start:
 * `startApplication` validated step 1 against the organisation schema *extended
 * with a required `applicant_email`* — a field the wizard never renders. Every
 * submission failed with "application step 1 rejected", and nothing caught it.
 *
 * It typechecks (the schema is valid), it lints, it builds, and the end-to-end
 * script passed because that calls the database functions directly and never
 * goes through the service layer. The only symptom was a rejected form.
 *
 * So the contract is asserted directly: every field a step schema *requires*
 * must have a matching input in the wizard.
 */

const WIZARD = readFileSync(
  path.join('app', 'apply', 'application-wizard.tsx'),
  'utf8',
)

/** Field names the wizard actually renders, from `name="…"` attributes. */
const RENDERED = new Set([...WIZARD.matchAll(/name="([a-z_]+)"/g)].map((match) => match[1]))

/**
 * Keys a schema will reject as missing.
 *
 * A key is required when parsing `undefined` for it fails — which covers plain
 * required fields while correctly treating optionals, nullables and defaults as
 * satisfied.
 */
function requiredKeys(schema: ZodObject<ZodRawShape>): string[] {
  return Object.entries(schema.shape)
    .filter(([, field]) => !(field as ZodType).safeParse(undefined).success)
    .map(([key]) => key)
}

const STEPS: [name: string, schema: ZodObject<ZodRawShape>][] = [
  ['organization', applicationOrganizationSchema as ZodObject<ZodRawShape>],
  ['address', applicationAddressSchema as ZodObject<ZodRawShape>],
  ['representative', applicationRepresentativeSchema as ZodObject<ZodRawShape>],
  ['detail', applicationDetailSchema as ZodObject<ZodRawShape>],
]

describe('the wizard collects everything its schemas require', () => {
  it('finds rendered fields (the scanner is not silently broken)', () => {
    expect(RENDERED.size).toBeGreaterThan(10)
    expect(RENDERED.has('institution_name')).toBe(true)
  })

  it.each(STEPS)('step "%s" renders an input for every required field', (name, schema) => {
    const missing = requiredKeys(schema).filter((key) => !RENDERED.has(key))

    expect(
      missing,
      `step "${name}" requires ${missing.join(', ')} but the wizard renders no input for it — ` +
        'the form cannot be submitted.',
    ).toEqual([])
  })
})

describe('step 1 accepts exactly what the form posts', () => {
  // The literal payload the wizard sends, including the empty strings that
  // untouched optional inputs produce.
  const STEP_ONE = {
    institution_name: 'North India University',
    institution_type: 'UNIVERSITY',
    category: 'PRIVATE',
    official_email: 'office@niu.test',
    official_phone: '',
    website: '',
    year_established: '',
    registration_number: '',
    field_of_work: 'Aerospace engineering education',
    description: 'A university.',
  }

  it('is accepted', () => {
    const result = applicationOrganizationSchema.safeParse(STEP_ONE)
    expect(
      result.success,
      result.success
        ? ''
        : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    ).toBe(true)
  })

  it('does not require an applicant_email the form never collects', () => {
    // The tracking address is derived server-side from the official email and
    // later re-pointed at the representative. It must never be a required
    // input on step 1.
    expect(requiredKeys(applicationOrganizationSchema as ZodObject<ZodRawShape>)).not.toContain(
      'applicant_email',
    )
  })

  it('treats untouched optional inputs as absent rather than invalid', () => {
    const parsed = applicationOrganizationSchema.parse(STEP_ONE)
    expect(parsed.website).toBeNull()
    expect(parsed.official_phone).toBeNull()
  })
})

describe('the other steps accept what the form posts', () => {
  it('accepts the address step', () => {
    const result = applicationAddressSchema.safeParse({
      address_line: '1 Runway Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
      postal_code: '560001',
    })
    expect(result.success).toBe(true)
  })

  it('accepts the representative step', () => {
    const result = applicationRepresentativeSchema.safeParse({
      representative_name: 'Asha Rao',
      representative_designation: 'Director',
      representative_email: 'asha@niu.test',
      representative_phone: '+919900000000',
    })
    expect(result.success).toBe(true)
  })

  it('accepts the detail step with comma-separated lists already split', () => {
    const result = applicationDetailSchema.safeParse({
      estimated_student_count: '400',
      estimated_teacher_count: '',
      departments: ['Aerospace Engineering', 'Mechanical Engineering'],
      programs: ['B.Tech Aerospace'],
      specializations: [],
      aerospace_relevance: 'Undergraduate aerospace programmes.',
    })
    expect(
      result.success,
      result.success ? '' : JSON.stringify(result.error.issues),
    ).toBe(true)
  })

  it('accepts an entirely empty detail step', () => {
    // Every field on step 4 is optional; an applicant may skip it outright.
    expect(applicationDetailSchema.safeParse({}).success).toBe(true)
  })
})
