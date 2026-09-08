import 'server-only'

import { publicEnv } from '@/lib/env/public'

/**
 * Absolute URLs for links that travel in email.
 *
 * A relative path is meaningless once it leaves the application, and a request
 * origin is not available where these are built — approval runs in a Server
 * Action, and the address the reviewer happens to be using is not the address
 * the applicant should be sent to. `NEXT_PUBLIC_APP_URL` is the platform's own
 * canonical origin, so every emailed link is derived from it.
 */
export function appUrl(path: string): string {
  const base = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Where an applicant follows their application. */
export function trackingUrl(): string {
  return appUrl('/application-status')
}

/**
 * A single-use link that redeems `token_hash` and lands on `next`.
 *
 * The raw `action_link` that Supabase returns is deliberately not used. It
 * points at the Supabase domain and redirects back with the session in a URL
 * fragment, which never reaches the server and so cannot become an httpOnly
 * cookie. Minting our own URL against `/auth/confirm` keeps the exchange
 * server-side and the session in a cookie, and keeps the visible link on the
 * platform's own domain.
 */
export function verificationUrl(tokenHash: string, type: string, next: string): string {
  const params = new URLSearchParams({ token_hash: tokenHash, type, next })
  return appUrl(`/auth/confirm?${params.toString()}`)
}
