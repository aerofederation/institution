import 'server-only'

import { cookies } from 'next/headers'

import { createServerClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env/public'
import type { Database } from '@/types/database.generated'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * This is the client that everything in the application should use. It carries
 * the signed-in user's session, so every statement it issues runs as
 * `authenticated` and is subject to Row Level Security. If a query returns no
 * rows because a policy excluded them, that is the system working.
 *
 * Use `createAdminClient()` from `./admin` only for the narrow set of
 * operations documented there.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot set cookies. Session refresh happens in
            // middleware instead, so ignoring this is correct rather than a
            // swallowed failure.
          }
        },
      },
    },
  )
}
