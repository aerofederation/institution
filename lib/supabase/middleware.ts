import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { publicEnv } from '@/lib/env/public'
import { HOME_BY_ROLE, ROUTE_PREFIX_ROLE, type RoleCode } from '@/lib/permissions/definitions'
import type { Database } from '@/types/database.generated'

/**
 * Sign-in surfaces. An authenticated visitor is sent to their own home rather
 * than shown a login form they are already past.
 *
 * `/hq/login` sits inside the `/hq` prefix but must stay reachable while signed
 * out, so it is listed here AND excluded from the protected-prefix match below.
 * Getting that wrong makes the HQ sign-in page redirect to itself.
 */
export const SIGNED_OUT_ROUTES = ['/login', '/hq/login', '/forgot-password']

/**
 * Routes that COMPLETE an authenticated flow.
 *
 * These are the other half of an emailed link. Redeeming one establishes a
 * session and *then* lands here to finish the job — choosing a first password,
 * or replacing a forgotten one. So a visitor on these pages is expected to be
 * signed in, and bouncing an authenticated user away (as `SIGNED_OUT_ROUTES`
 * does) would make the page unreachable by the only people it is for.
 *
 * They are equally not protected prefixes: arriving without a session is a
 * normal case — an expired or already-used link — and each page says so itself
 * rather than being redirected to a sign-in form that cannot explain it.
 */
export const SESSION_COMPLETION_ROUTES = ['/activate', '/reset-password']
const PROTECTED_PREFIXES = Object.keys(ROUTE_PREFIX_ROLE)

/**
 * Refreshes the Supabase session on every request and applies COARSE route
 * guarding.
 *
 * Coarse is the operative word. Middleware runs early, on cached and edge
 * paths, and its only job here is to keep the session cookie fresh and to send
 * an obviously-misrouted user somewhere sensible. It is never the authority.
 *
 * The role it reads comes from `app_metadata` in the verified JWT, which is
 * service-role-writable only and therefore not forgeable by the account holder
 * — but it is still a routing hint, not an authorization decision. Every
 * protected page and Server Action re-derives identity from the `profiles` row
 * through `getSessionContext()`, and every query is additionally bounded by RLS.
 * If this function were deleted entirely, nothing would become accessible; the
 * app would just redirect less gracefully.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    publicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser() revalidates the token with the Auth server. getSession() only
  // reads the cookie, so it must not be used for a decision like this one.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname, search } = request.nextUrl
  const isSignedOutRoute = SIGNED_OUT_ROUTES.some((route) => pathname.startsWith(route))
  const isCompletionRoute = SESSION_COMPLETION_ROUTES.some((route) => pathname.startsWith(route))
  const protectedPrefix =
    isSignedOutRoute || isCompletionRoute
      ? undefined
      : PROTECTED_PREFIXES.find(
          (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
        )

  if (!user) {
    if (protectedPrefix) {
      const url = request.nextUrl.clone()
      // HQ has its own restricted sign-in; sending an administrator to the
      // general portal form and back again is a worse first impression than
      // landing them where they belong.
      url.pathname = protectedPrefix === '/hq' ? '/hq/login' : '/login'
      url.search = ''
      // Relative path only, so the redirect target cannot be pushed off-site.
      url.searchParams.set('next', `${pathname}${search}`)
      return NextResponse.redirect(url)
    }
    return response
  }

  const role = user.app_metadata?.afi_role as RoleCode | undefined
  const home = role ? HOME_BY_ROLE[role] : '/'

  // Completion routes deliberately fall through: the session is what makes
  // them work, not what disqualifies the visitor from seeing them.
  if (isSignedOutRoute) {
    const url = request.nextUrl.clone()
    url.pathname = home
    url.search = ''
    return NextResponse.redirect(url)
  }

  if (protectedPrefix && role && ROUTE_PREFIX_ROLE[protectedPrefix] !== role) {
    /*
     * HQ is the exception: a signed-in user who is not HQ is allowed through to
     * the layout, which renders an explicit 403 Access Denied.
     *
     * Bouncing them silently to their own workspace hides what happened — they
     * followed a link, something moved, and no reason was given. The 403 page
     * fetches no federation data, so nothing is disclosed by rendering it, and
     * `resolveHqAccess()` in the layout is what actually decides.
     */
    if (protectedPrefix === '/hq') {
      return response
    }

    const url = request.nextUrl.clone()
    url.pathname = home
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
