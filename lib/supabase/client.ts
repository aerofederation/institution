'use client'

import { createBrowserClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env/public'
import type { Database } from '@/types/database.generated'

/**
 * Supabase client for the browser.
 *
 * Holds the anon key and the user's session, and nothing else. Every request it
 * makes is subject to Row Level Security exactly like the server client, so a
 * compromised browser cannot read past its tenant.
 *
 * Reach for this only where the browser genuinely needs Supabase directly:
 * sign-in, sign-out, Realtime subscriptions, and direct-to-storage uploads
 * against a server-minted signed URL. Ordinary reads belong in Server
 * Components and ordinary writes belong in Server Actions.
 */
let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined

export function createClient() {
  browserClient ??= createBrowserClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
  return browserClient
}

/**
 * A client whose Realtime socket is authenticated.
 *
 * Realtime is a separate connection from the one PostgREST uses, and it runs
 * the SELECT policy against whatever token that socket carries. The session is
 * restored asynchronously, so a channel subscribed during the first render can
 * open before the token is attached — and an anonymous socket does not error,
 * it simply receives nothing. That failure is silent and looks exactly like a
 * feature that was never wired up.
 *
 * Awaiting the session and setting the token before subscribing removes the
 * race. `verify:messaging` covers the same ground from Node, where the symptom
 * first appeared: every subscriber got zero events until the token was set.
 */
export async function createLiveClient() {
  const supabase = createClient()

  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) await supabase.realtime.setAuth(token)

  return supabase
}
