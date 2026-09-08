import { describe, expect, it } from 'vitest'

import { loginSchema, setPasswordSchema, updateOwnProfileSchema } from '@/lib/validation/auth'
import { emailField, toFieldErrors } from '@/lib/validation/common'
import { applicationDecisionSchema, applicationLookupSchema } from '@/lib/validation/institution'
import { createStudentSchema, createTeacherSchema } from '@/lib/validation/members'

describe('email normalisation', () => {
  it('lowercases and trims, matching the email_address domain', () => {
    expect(emailField.parse('  Principal@Example.TEST  ')).toBe('principal@example.test')
  })

  it('rejects malformed addresses', () => {
    for (const bad of ['not-an-email', 'a@b', '@example.test', 'a b@example.test']) {
      expect(emailField.safeParse(bad).success, bad).toBe(false)
    }
  })
})

describe('login redirect handling', () => {
  it('accepts a same-site path', () => {
    const parsed = loginSchema.parse({
      email: 'a@example.test',
      password: 'whatever',
      next: '/institution/teachers?page=2',
    })
    expect(parsed.next).toBe('/institution/teachers?page=2')
  })

  it('rejects redirects that would leave the site', () => {
    for (const hostile of [
      'https://evil.test/steal',
      '//evil.test',
      'http://localhost:3000/ok',
      'javascript:alert(1)',
      '\\\\evil.test',
    ]) {
      const result = loginSchema.safeParse({
        email: 'a@example.test',
        password: 'whatever',
        next: hostile,
      })
      expect(result.success, `${hostile} should be rejected`).toBe(false)
    }
  })
})

describe('password policy', () => {
  it('requires length and a mix of character classes', () => {
    for (const weak of ['short', 'alllowercase12', 'ALLUPPERCASE12', 'NoDigitsHereAtAll']) {
      expect(
        setPasswordSchema.safeParse({ password: weak, confirmPassword: weak }).success,
        weak,
      ).toBe(false)
    }
  })

  it('rejects a single repeated character even at length', () => {
    const silly = 'aaaaaaaaaaaaaaaa'
    expect(setPasswordSchema.safeParse({ password: silly, confirmPassword: silly }).success).toBe(
      false,
    )
  })

  it('accepts a reasonable password', () => {
    const good = 'Ascent-Vector-77'
    expect(setPasswordSchema.safeParse({ password: good, confirmPassword: good }).success).toBe(true)
  })

  it('reports a mismatch against the confirmation field', () => {
    const result = setPasswordSchema.safeParse({
      password: 'Ascent-Vector-77',
      confirmPassword: 'Ascent-Vector-78',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(toFieldErrors(result.error)).toHaveProperty('confirmPassword')
    }
  })
})

/**
 * The most important assertions in this file. A schema that quietly accepts
 * `institution_id` or `role` is the difference between a tenant boundary and a
 * suggestion, because zod strips unknown keys silently — the request would look
 * clean while carrying a tenant the caller does not own.
 */
describe('provisioning schemas cannot express a tenant or a role', () => {
  const forbidden = ['institution_id', 'role', 'status', 'role_guard'] as const

  it('drops them from teacher creation', () => {
    const parsed = createTeacherSchema.parse({
      full_name: 'Aditi Ramesh',
      email: 'aditi@example.test',
      employee_id: 'T-001',
      institution_id: '00000000-0000-4000-8000-0000000000ff',
      role: 'HQ_ADMIN',
      status: 'ACTIVE',
    } as never)

    for (const key of forbidden) {
      expect(parsed, `teacher schema leaked ${key}`).not.toHaveProperty(key)
    }
  })

  it('drops them from student creation', () => {
    const parsed = createStudentSchema.parse({
      full_name: 'Meera Das',
      email: 'meera@example.test',
      student_code: 'S-001',
      institution_id: '00000000-0000-4000-8000-0000000000ff',
      role: 'TEACHER',
    } as never)

    for (const key of forbidden) {
      expect(parsed, `student schema leaked ${key}`).not.toHaveProperty(key)
    }
  })

  it('drops them from a self-service profile edit', () => {
    const parsed = updateOwnProfileSchema.parse({
      full_name: 'Renamed Person',
      phone: '',
      role: 'HQ_ADMIN',
      institution_id: '00000000-0000-4000-8000-0000000000ff',
      email: 'new@example.test',
    } as never)

    for (const key of [...forbidden, 'email'] as const) {
      expect(parsed, `profile schema leaked ${key}`).not.toHaveProperty(key)
    }
    expect(parsed.phone).toBeNull()
  })
})

describe('student class and section coherence', () => {
  it('rejects a section without a class', () => {
    const result = createStudentSchema.safeParse({
      full_name: 'Rohan Bhatt',
      email: 'rohan@example.test',
      student_code: 'S-003',
      section_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(result.success).toBe(false)
  })

  it('accepts a class with no section', () => {
    const result = createStudentSchema.safeParse({
      full_name: 'Rohan Bhatt',
      email: 'rohan@example.test',
      student_code: 'S-003',
      class_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(result.success).toBe(true)
  })
})

describe('application reference lookup', () => {
  it('normalises and accepts a well-formed reference', () => {
    const parsed = applicationLookupSchema.parse({
      application_ref: 'afi-2026-7k3qp9zx',
      email: 'REP@Example.test',
    })
    expect(parsed.application_ref).toBe('AFI-2026-7K3QP9ZX')
    expect(parsed.email).toBe('rep@example.test')
  })

  it('rejects references using characters outside the Crockford alphabet', () => {
    // I, L, O and U are excluded to avoid transcription errors.
    expect(
      applicationLookupSchema.safeParse({
        application_ref: 'AFI-2026-IL0OU123',
        email: 'rep@example.test',
      }).success,
    ).toBe(false)
  })
})

describe('HQ application decisions must be justified', () => {
  const base = { application_id: '11111111-1111-4111-8111-111111111111' }

  it('requires a reason for a rejection', () => {
    expect(
      applicationDecisionSchema.safeParse({ ...base, decision: 'REJECTED' }).success,
    ).toBe(false)
    expect(
      applicationDecisionSchema.safeParse({
        ...base,
        decision: 'REJECTED',
        comments: 'Registration certificate could not be verified.',
      }).success,
    ).toBe(true)
  })

  it('requires required_actions when asking the applicant for more', () => {
    expect(
      applicationDecisionSchema.safeParse({ ...base, decision: 'DOCUMENTS_REQUIRED' }).success,
    ).toBe(false)
    expect(
      applicationDecisionSchema.safeParse({
        ...base,
        decision: 'DOCUMENTS_REQUIRED',
        required_actions: ['Upload the AICTE approval letter'],
      }).success,
    ).toBe(true)
  })

  it('does not offer a transition the database would refuse', () => {
    expect(applicationDecisionSchema.safeParse({ ...base, decision: 'DRAFT' }).success).toBe(false)
    expect(applicationDecisionSchema.safeParse({ ...base, decision: 'SUSPENDED' }).success).toBe(
      false,
    )
  })
})
