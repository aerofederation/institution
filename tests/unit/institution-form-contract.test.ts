import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import type { ZodType } from 'zod'

import {
  classSchema,
  programSchema,
  sectionSchema,
} from '@/lib/validation/academics'
import { academicYearSchema, departmentSchema } from '@/lib/validation/institution'
import { createStudentSchema, createTeacherSchema } from '@/lib/validation/members'

/**
 * What an HTML form actually sends.
 *
 * A browser does not submit `undefined` for a field somebody left alone — it
 * submits an empty string. Every optional `<select>`, date and number in the
 * institution workspace therefore arrives as `""`, and a schema written as
 * `z.uuid().nullish()` rejects that: null and undefined are fine, `""` is not.
 *
 * That bug shipped. Typecheck passed, lint passed, the build passed, and the
 * page rendered perfectly — the form failed only when a real person submitted
 * it with a dropdown untouched, which is the ordinary case.
 *
 * `z.coerce.number()` failed more quietly still: it accepts `""` and turns it
 * into `0`, so a blank "years of experience" would have been stored as zero
 * years rather than as unknown. That one produces no error at all.
 *
 * So each schema is parsed against the literal payload its form produces when
 * only the required fields are filled in.
 */

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

/** Every input the wizard renders, blank, as `Object.fromEntries(formData)` gives it. */
function blankExcept(names: string[], filled: Record<string, string>) {
  return { ...Object.fromEntries(names.map((name) => [name, ''])), ...filled }
}

describe('a form submitted with every optional field left alone is accepted', () => {
  const cases: [name: string, schema: ZodType, payload: Record<string, string>][] = [
    [
      'teacher',
      createTeacherSchema,
      blankExcept(
        [
          'phone',
          'department_id',
          'qualification',
          'specialization',
          'experience_years',
          'joining_date',
          'bio',
        ],
        {
          full_name: 'Anita Verma',
          email: 'anita@example.test',
          employee_id: 'T-101',
        },
      ),
    ],
    [
      'student',
      createStudentSchema,
      blankExcept(
        [
          'phone',
          'admission_number',
          'department_id',
          'program_id',
          'academic_year_id',
          'class_id',
          'section_id',
          'guardian_name',
          'guardian_phone',
          'guardian_email',
          'admission_date',
        ],
        {
          full_name: 'Ishaan Kulkarni',
          email: 'ishaan@example.test',
          student_code: '2026-AE-014',
        },
      ),
    ],
    [
      'department',
      departmentSchema,
      blankExcept(['description'], { code: 'AERO', name: 'Aerospace Engineering' }),
    ],
    [
      'programme',
      programSchema,
      blankExcept(['department_id', 'level', 'duration_months', 'description'], {
        code: 'BTECH-AE',
        name: 'B.Tech Aerospace',
      }),
    ],
    [
      'class',
      classSchema,
      blankExcept(['program_id', 'department_id', 'code', 'level_order', 'capacity'], {
        name: 'First Year',
        academic_year_id: UUID,
      }),
    ],
    [
      'section',
      sectionSchema,
      blankExcept(['capacity'], { name: 'A', class_id: UUID }),
    ],
    [
      'academic year',
      academicYearSchema,
      // An unticked checkbox submits nothing at all, so the key is absent.
      { name: '2026-27', starts_on: '2026-07-01', ends_on: '2027-06-30' },
    ],
  ]

  it.each(cases)('%s', (_name, schema, payload) => {
    const result = schema.safeParse(payload)

    expect(
      result.success,
      result.success
        ? ''
        : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    ).toBe(true)
  })
})

describe('blank optional values become null, never a coerced zero', () => {
  it('does not record blank experience as zero years', () => {
    const parsed = createTeacherSchema.parse({
      full_name: 'Anita Verma',
      email: 'anita@example.test',
      employee_id: 'T-101',
      experience_years: '',
    })

    // 0 would be a lie: it says "no experience" where the truth is "not stated".
    expect(parsed.experience_years).toBeNull()
  })

  it('does not record a blank dropdown as an empty string', () => {
    const parsed = createTeacherSchema.parse({
      full_name: 'Anita Verma',
      email: 'anita@example.test',
      employee_id: 'T-101',
      department_id: '',
    })

    expect(parsed.department_id).toBeNull()
  })

  it('still rejects a malformed value that is not simply blank', () => {
    const result = createTeacherSchema.safeParse({
      full_name: 'Anita Verma',
      email: 'anita@example.test',
      employee_id: 'T-101',
      department_id: 'not-a-uuid',
    })

    expect(result.success).toBe(false)
  })

  it('reads a ticked checkbox from its form value', () => {
    const parsed = academicYearSchema.parse({
      name: '2026-27',
      starts_on: '2026-07-01',
      ends_on: '2027-06-30',
      is_current: 'true',
    })

    expect(parsed.is_current).toBe(true)
  })
})

/**
 * The other half of the contract: a field a schema requires must exist in the
 * form. This is the same check `application-form-contract` makes for the public
 * wizard, applied to the institution dialogs.
 */
describe('every required field has an input in its dialog', () => {
  const FORMS: [component: string, schema: ZodType, required: string[]][] = [
    [
      path.join('components', 'institution', 'teacher-form.tsx'),
      createTeacherSchema,
      ['full_name', 'email', 'employee_id'],
    ],
    [
      path.join('components', 'institution', 'student-form.tsx'),
      createStudentSchema,
      ['full_name', 'email', 'student_code'],
    ],
  ]

  it.each(FORMS)('%s', (component, _schema, required) => {
    const source = readFileSync(component, 'utf8')
    const rendered = new Set([...source.matchAll(/name="([a-z_]+)"/g)].map((match) => match[1]))

    for (const field of required) {
      expect(rendered.has(field), `${component} renders no input named "${field}"`).toBe(true)
    }
  })
})
