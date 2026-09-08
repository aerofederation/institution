import { NextResponse, type NextRequest } from 'next/server'

import { createClient } from '@/lib/supabase/server'

/**
 * Exchanges a single-use link for a session.
 *
 * Every emailed link on the platform — activation, password reset, email
 * verification — lands here. Supabase issues a one-time code; this route trades
 * it for a session cookie and then sends the user to the page that finishes the
 * job.
 *
 * The `next` parameter is constrained to a same-site path. Without that check
 * this endpoint would be an open redirect attached to an authentication flow,
 * which is close to the worst place to have one.
 */
const SAFE_PATH = /^\/(?!\/)[A-Za-z0-9/_?&=.%-]*$/

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl

  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next')
  const next = requestedNext && SAFE_PATH.test(requestedNext) ? requestedNext : '/'

  // Supabase reports link failures here rather than throwing.
  const authError = searchParams.get('error_description') ?? searchParams.get('error')
  if (authError) {
    console.warn('[afi:auth] callback rejected', authError)
    return NextResponse.redirect(`${origin}/login?error=link_invalid`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // The specific reason stays in the logs; the user gets a single message
    // covering expired, already-used and malformed links alike.
    console.warn('[afi:auth] code exchange failed', error.message)
    return NextResponse.redirect(`${origin}/login?error=link_invalid`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
