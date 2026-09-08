import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env/public'
import { serverEnv } from '@/lib/env/server'
import type { Database } from '@/types/database.generated'

/**
 * Service-role Supabase client. Bypasses Row Level Security completely.
 *
 * The `server-only` import above makes importing this from a Client Component
 * a build error, which is the mechanism that keeps the key out of the browser
 * bundle. That is necessary but not sufficient — the real discipline is where
 * this client may be called from.
 *
 * ALLOWLIST. These are the only operations permitted to use it, because none of
 * them can run under a user's RLS context:
 *
 *   1. `auth.admin.createUser` / `generateLink` / `deleteUser` when provisioning
 *      an institution administrator, teacher or student.
 *   2. Draining `email_outbox`, which runs on a schedule with no user session.
 *   3. Scheduled analytics rollups and reapers.
 *   4. Development seeding.
 *
 * Everything else — every read, every ordinary write — goes through
 * `lib/supabase/server.ts` so that RLS stays in the path.
 *
 * A call site using this client must already have run `authorize()`. Bypassing
 * RLS is not a licence to skip authorization; it moves the entire burden of
 * that check onto the calling service, which is why the list above is short and
 * closed.
 *
 * Note that the tenant guarantees do NOT all vanish here. Composite foreign
 * keys carrying `institution_id`, the privilege-escalation trigger and every
 * CHECK constraint still apply to the service role, because they are schema,
 * not policy.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  )
}

/**
 * The app_metadata keys the provisioning trigger reads when creating a profile.
 *
 * These must go in `app_metadata`, never `user_metadata`: app_metadata is
 * writable only with the service role, while user_metadata is writable by the
 * account holder through `auth.updateUser({ data })`. Putting a role there
 * would hand every user a role-assignment primitive.
 *
 * `afi_role` is deliberately typed to exclude HQ_ADMIN — the database refuses
 * it on this path regardless, and the type stops anyone trying.
 */
export type ProvisioningMetadata = {
  afi_role: 'INSTITUTION_ADMIN' | 'TEACHER' | 'STUDENT'
  afi_institution_id: string
  afi_full_name: string
}
