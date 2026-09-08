import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { statusLabel } from '@/components/shared/status-badge'
import { humaniseEnum, narrow } from '@/lib/constants/enums'
import { APPLICATION_STATUSES, INSTITUTION_STATUSES } from '@/lib/constants/enums'
import { hasMeaningfulScale } from '@/services/public/network'

describe('network scale presentation', () => {
  const stats = (institutions: number) => ({
    institutions,
    educators: 0,
    learners: 0,
    programs: 0,
    states: 0,
  })

  it('withholds headline figures until the network is large enough to mean something', () => {
    // Publishing "1 institution, 0 students" as a national statistic is
    // accurate and useless; the homepage shows a qualitative treatment instead.
    expect(hasMeaningfulScale(stats(0))).toBe(false)
    expect(hasMeaningfulScale(stats(1))).toBe(false)
    expect(hasMeaningfulScale(stats(2))).toBe(false)
  })

  it('shows real figures once there are enough of them', () => {
    expect(hasMeaningfulScale(stats(3))).toBe(true)
    expect(hasMeaningfulScale(stats(250))).toBe(true)
  })
})

describe('status vocabulary', () => {
  it('renders database enums as readable labels', () => {
    expect(statusLabel('UNDER_REVIEW')).toBe('Under review')
    expect(statusLabel('DOCUMENTS_REQUIRED')).toBe('Documents required')
    expect(statusLabel('ACTIVE')).toBe('Active')
  })

  it('never shows a raw SCREAMING_SNAKE value, even for an unmapped status', () => {
    // New enum values appear before this map is updated; they must still read.
    expect(statusLabel('SOME_FUTURE_STATE')).toBe('Some future state')
    expect(statusLabel(null)).toBe('—')
  })

  it('humanises enum values consistently', () => {
    expect(humaniseEnum('AEROSPACE_INSTITUTION')).toBe('Aerospace institution')
    expect(humaniseEnum('NGO')).toBe('Ngo')
  })
})

describe('filter narrowing', () => {
  it('accepts a real enum value', () => {
    expect(narrow(INSTITUTION_STATUSES, 'ACTIVE')).toBe('ACTIVE')
    expect(narrow(APPLICATION_STATUSES, 'UNDER_REVIEW')).toBe('UNDER_REVIEW')
  })

  it('discards anything else rather than passing it to the database', () => {
    // A mistyped URL must drop the filter, not produce a 500 from a bad enum
    // literal reaching PostgreSQL.
    expect(narrow(INSTITUTION_STATUSES, 'active')).toBeUndefined()
    expect(narrow(INSTITUTION_STATUSES, "'; drop table institutions; --")).toBeUndefined()
    expect(narrow(INSTITUTION_STATUSES, undefined)).toBeUndefined()
    expect(narrow(INSTITUTION_STATUSES, '')).toBeUndefined()
  })
})

describe('public routes exist', () => {
  const ROUTES: [label: string, file: string][] = [
    ['/', 'app/(public)/page.tsx'],
    ['/about', 'app/(public)/about/page.tsx'],
    ['/institutions', 'app/(public)/institutions/page.tsx'],
    ['/institutions/[slug]', 'app/(public)/institutions/[slug]/page.tsx'],
    ['/education', 'app/(public)/education/page.tsx'],
    ['/ai-classroom', 'app/(public)/ai-classroom/page.tsx'],
    ['/events', 'app/(public)/events/page.tsx'],
    ['/events/[slug]', 'app/(public)/events/[slug]/page.tsx'],
    ['/announcements', 'app/(public)/announcements/page.tsx'],
    ['/announcements/[slug]', 'app/(public)/announcements/[slug]/page.tsx'],
    ['/contact', 'app/(public)/contact/page.tsx'],
    ['/apply', 'app/apply/page.tsx'],
    ['/application-status', 'app/application-status/page.tsx'],
    ['/verify/[certificateId]', 'app/verify/[certificateId]/page.tsx'],
    ['/login', 'app/login/page.tsx'],
    ['/hq/login', 'app/hq/login/page.tsx'],
  ]

  it.each(ROUTES)('%s is routed', (_label, file) => {
    expect(existsSync(path.join(...file.split('/')))).toBe(true)
  })
})

describe('public pages declare metadata', () => {
  const PAGES = [
    'app/(public)/page.tsx',
    'app/(public)/about/page.tsx',
    'app/(public)/institutions/page.tsx',
    'app/(public)/education/page.tsx',
    'app/(public)/ai-classroom/page.tsx',
    'app/(public)/events/page.tsx',
    'app/(public)/announcements/page.tsx',
    'app/(public)/contact/page.tsx',
  ]

  it.each(PAGES)('%s exports a title and description', async (file) => {
    const source = await readFile(path.join(...file.split('/')), 'utf8')
    expect(source).toMatch(/export const metadata/)
    expect(source).toMatch(/description:/)
  })
})

describe('the HQ command centre is not indexable', () => {
  it('tells crawlers to stay out', async () => {
    const layout = await readFile(path.join('app', 'hq', '(command)', 'layout.tsx'), 'utf8')
    expect(layout).toMatch(/robots:\s*\{[^}]*index:\s*false/)
  })

  it('keeps the HQ sign-in out of the index too', async () => {
    const login = await readFile(path.join('app', 'hq', 'login', 'page.tsx'), 'utf8')
    expect(login).toMatch(/robots:\s*\{[^}]*index:\s*false/)
  })
})
