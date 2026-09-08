import 'server-only'

import { unstable_cache } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

/**
 * Data for the public site.
 *
 * Everything here goes through the `public_*` SECURITY DEFINER projections from
 * migration 015, never through a table. `anon` holds no privilege on any table
 * in `public`, so these functions are the entire public data surface — a fixed
 * set of columns describing already-approved institutions and aggregate counts.
 *
 * Results are cached briefly. The public site is read-only and identical for
 * every visitor, so re-querying per request buys nothing; the tag lets an
 * approval invalidate the directory immediately.
 */

export type PlatformStats = {
  institutions: number
  educators: number
  learners: number
  programs: number
  states: number
}

export type DirectoryEntry = {
  slug: string
  name: string
  institution_type: string
  category: string
  city: string | null
  state: string | null
  country: string
  field_of_work: string | null
  approved_at: string | null
}

const EMPTY_STATS: PlatformStats = {
  institutions: 0,
  educators: 0,
  learners: 0,
  programs: 0,
  states: 0,
}

/**
 * Network figures.
 *
 * Returns zeroes rather than throwing if the projection is unavailable: the
 * homepage must render even when the database is unreachable, and the section
 * that consumes this already has a qualitative presentation for a small or
 * absent network.
 */
export const getPlatformStats = unstable_cache(
  async (): Promise<PlatformStats> => {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.rpc('public_platform_stats')
      if (error || !data?.length) return EMPTY_STATS

      const row = data[0]
      return {
        institutions: Number(row.institutions ?? 0),
        educators: Number(row.educators ?? 0),
        learners: Number(row.learners ?? 0),
        programs: Number(row.programs ?? 0),
        states: Number(row.states ?? 0),
      }
    } catch {
      return EMPTY_STATS
    }
  },
  ['public-platform-stats'],
  { revalidate: 300, tags: ['public-network'] },
)

export const getInstitutionDirectory = unstable_cache(
  async (limit = 60): Promise<DirectoryEntry[]> => {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.rpc('public_institution_directory', {
        max_rows: limit,
      })
      if (error || !data) return []
      return data as DirectoryEntry[]
    } catch {
      return []
    }
  },
  ['public-institution-directory'],
  { revalidate: 300, tags: ['public-network'] },
)

export type PublicInstitution = DirectoryEntry & {
  description: string | null
  website: string | null
  year_established: number | null
}

/** One institution by slug, or `null` if it is not publicly listed. */
export async function getPublicInstitution(slug: string): Promise<PublicInstitution | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_institution_by_slug', {
      target_slug: slug,
    })
    if (error || !data?.length) return null
    return data[0] as PublicInstitution
  } catch {
    return null
  }
}

/**
 * Whether the network is large enough for figures to mean anything.
 *
 * Below this, the homepage shows a qualitative "growing network" treatment
 * instead of numbers. Publishing "2 institutions" as a headline statistic is
 * accurate and actively unhelpful; inventing a larger number would be worse.
 */
export function hasMeaningfulScale(stats: PlatformStats): boolean {
  return stats.institutions >= 3
}
