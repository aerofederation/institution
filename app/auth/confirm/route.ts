import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'

import { createClient } from '@/lib/supabase/server'

/**
 * Redeems a single-use token from an email the platform sent itself.
 *
 * `/auth/callback` handles the PKCE `?code=` exchange used by flows the browser
 * starts. This route handles the other direction: links minted server-side by
 * `generateLink`, where there is no code verifier because no browser was
 * involved when the link was created.
 *
 * `verifyOtp` performs the exchange on the server, so the session is written as
 * an httpOnly cookie rather than arriving in a URL fragment.
 */

const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_?&=.%-]*$/

/*
 * `email_change` is deliberately absent. It is the one type whose redemption
 * changes the address an account is reachable at, and nothing on this platform
 * mints such a link yet — accepting it here would leave an unused door open.
 */
const REDEEMABLE = new Set<EmailOtpType>(['invite', 'recovery', 'magiclink', 'signup', 'email'])

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const requestedNext = searchParams.get('next')

  // Same constraint as /auth/callback: an unchecked redirect target attached to
  // an authentication flow is an open redirect in the worst possible place.
  const next = requestedNext && SAFE_PATH.test(requestedNext) ? requestedNext : '/'

  if (!tokenHash || !type || !REDEEMABLE.has(type)) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })

  if (error) {
    // Expired, already used and malformed all produce one message. Which of the
    // three it was stays in the logs.
    console.warn('[afi:auth] token verification failed', error.message)
    return NextResponse.redirect(`${origin}/login?error=link_invalid`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
