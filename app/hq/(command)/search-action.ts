'use server'

import { requireHq } from '@/lib/auth/hq'
import { action, type ActionResult } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

/**
 * Federation-wide search behind the HQ command palette.
 *
 * Runs on the server under the caller's session, so PostgreSQL decides what
 * matches and RLS decides what exists. Each table is capped at five hits: the
 * palette is for navigation, not for exporting the directory.
 */

export type SearchHit = {
  kind: 'institution' | 'application' | 'teacher' | 'student' | 'document'
  id: string
  title: string
  subtitle?: string
  href: string
}

/** Neutralises PostgREST filter grammar and LIKE wildcards in user input. */
function safeTerm(input: string) {
  return input.replace(/[,()%_\\*]/g, ' ').trim().slice(0, 60)
}

export async function searchFederation(rawTerm: string): Promise<ActionResult<SearchHit[]>> {
  return action(async () => {
    const session = await requireHq()
    const term = safeTerm(rawTerm)
    if (term.length < 2) return []

    const supabase = await createClient()
    const has = (permission: Parameters<typeof session.permissions.has>[0]) =>
      session.permissions.has(permission)

    const [institutions, applications, teachers, students] = await Promise.all([
      has('institution.read_all')
        ? supabase
            .from('institutions')
            .select('id, name, slug, institution_type, city, status')
            .or(`name.ilike.%${term}%,slug.ilike.%${term}%`)
            .is('deleted_at', null)
            .limit(5)
        : null,

      has('application.read_all')
        ? supabase
            .from('institution_applications')
            .select('id, application_ref, institution_name, status')
            .or(`institution_name.ilike.%${term}%,application_ref.ilike.%${term}%`)
            .is('deleted_at', null)
            .limit(5)
        : null,

      has('teacher.read_all')
        ? supabase
            .from('teachers')
            .select('profile_id, employee_id, institutions(name)')
            .ilike('employee_id', `%${term}%`)
            .is('deleted_at', null)
            .limit(5)
        : null,

      has('student.read_all')
        ? supabase
            .from('students')
            .select('profile_id, student_code, institutions(name)')
            .or(`student_code.ilike.%${term}%,admission_number.ilike.%${term}%`)
            .is('deleted_at', null)
            .limit(5)
        : null,
    ])

    const hits: SearchHit[] = []

    for (const row of institutions?.data ?? []) {
      hits.push({
        kind: 'institution',
        id: row.id,
        title: row.name,
        subtitle: row.city ?? undefined,
        href: `/hq/institutions/${row.id}`,
      })
    }

    for (const row of applications?.data ?? []) {
      hits.push({
        kind: 'application',
        id: row.id,
        title: row.institution_name,
        subtitle: row.application_ref,
        href: `/hq/applications/${row.id}`,
      })
    }

    for (const row of teachers?.data ?? []) {
      const institution = row.institutions as { name: string } | null
      hits.push({
        kind: 'teacher',
        id: row.profile_id,
        title: row.employee_id,
        subtitle: institution?.name,
        href: `/hq/teachers?q=${encodeURIComponent(row.employee_id)}`,
      })
    }

    for (const row of students?.data ?? []) {
      const institution = row.institutions as { name: string } | null
      hits.push({
        kind: 'student',
        id: row.profile_id,
        title: row.student_code,
        subtitle: institution?.name,
        href: `/hq/students?q=${encodeURIComponent(row.student_code)}`,
      })
    }

    return hits
  })
}
