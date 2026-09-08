import { describe, expect, it } from 'vitest'

import { toAbsolute } from '@/components/shared/date-time-picker'
import { assessmentDetailsSchema } from '@/lib/validation/assessment'

/**
 * A teacher picks a wall clock — "the 15th at 09:00" — and means it in their
 * own timezone. The value has to leave the browser as an instant, because
 * nothing downstream knows their offset: Postgres resolves an offsetless
 * literal into `timestamptz` using the session timezone, which is UTC.
 *
 * The bug this guards against stored 09:00 chosen in India as 09:00Z and
 * handed it back as 14:30. Every paper opened and closed 5h30m late, and the
 * teacher saw a time they had never typed.
 */
describe('scheduling carries the teacher’s timezone', () => {
  it('resolves a chosen wall clock against the local offset', () => {
    // The same moment, expressed the way the browser knows it.
    const expected = new Date(2026, 8, 15, 9, 0, 0, 0).toISOString()

    expect(toAbsolute('2026-09-15T09:00')).toBe(expected)
  })

  it('does not hand on the bare wall clock', () => {
    // The old behaviour: the string went to the database untouched.
    expect(toAbsolute('2026-09-15T09:00')).not.toBe('2026-09-15T09:00')
  })

  it('survives the round trip back to the same wall clock', () => {
    const local = '2026-09-15T09:00'
    const back = new Date(toAbsolute(local))
    const pad = (n: number) => String(n).padStart(2, '0')

    expect(
      `${back.getFullYear()}-${pad(back.getMonth() + 1)}-${pad(back.getDate())}T${pad(back.getHours())}:${pad(back.getMinutes())}`,
    ).toBe(local)
  })

  it('treats an empty or unparseable value as nothing set', () => {
    expect(toAbsolute('')).toBe('')
    expect(toAbsolute('not a date')).toBe('')
  })

  /**
   * The schema is the second line of defence. An offsetless string is
   * ambiguous, so a caller that regresses should fail loudly here rather than
   * quietly store the wrong instant.
   */
  it('refuses an offsetless datetime', () => {
    const base = {
      kind: 'QUIZ',
      title: 'Propulsion',
      class_id: '3fa78565-e3b2-4dd2-89a8-3f0f56d50a01',
      academic_year_id: '2a6a74f1-c099-4e20-9f75-1de1b8ca5677',
      max_attempts: 1,
    }

    expect(assessmentDetailsSchema.safeParse({ ...base, opens_at: '2026-09-15T09:00' }).success).toBe(
      false,
    )
    expect(
      assessmentDetailsSchema.safeParse({ ...base, opens_at: '2026-09-15T03:30:00.000Z' }).success,
    ).toBe(true)
  })
})
