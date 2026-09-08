import 'server-only'

import { redirect } from 'next/navigation'

import { getSessionContext, requireSession, type SessionContext } from '@/lib/auth/session'
import { forbidden } from '@/lib/errors'
import type { PermissionCode } from '@/lib/permissions/definitions'

/**
 * The single gate for every HQ surface.
 *
 * Written once and imported everywhere so that no page can accidentally ship
 * without it, and so that changing what "HQ" means is a one-file edit rather
 * than an audit of fifteen route files.
 *
 * It re-derives identity from the `profiles` row through `getSessionContext()`.
 * The middleware also guards `/hq`, but middleware runs on cached and edge
 * paths and reads a JWT claim — it is a routing convenience, never the
 * authority. Underneath both, RLS independently refuses HQ-scoped data to a
 * caller whose profile is not `HQ_ADMIN`, so a bug here still does not leak
 * rows. Three layers, none of them load-bearing alone.
 */

/**
 * For layouts and pages: sends an anonymous visitor to the HQ sign-in and
 * returns `null` for a signed-in user who is not HQ, so the caller can render
 * a 403 rather than a redirect loop.
 *
 * The distinction matters. Redirecting a signed-in teacher to a login page they
 * are already past is confusing; telling them plainly that this area is not
 * theirs is honest and ends the interaction.
 */
export async function resolveHqAccess(
  returnTo = '/hq',
): Promise<{ status: 'granted'; session: SessionContext } | { status: 'forbidden' }> {
  const session = await getSessionContext()

  if (!session) {
    redirect(`/hq/login?next=${encodeURIComponent(returnTo)}`)
  }

  if (session.role !== 'HQ_ADMIN' || session.status !== 'ACTIVE') {
    return { status: 'forbidden' }
  }

  return { status: 'granted', session }
}

/**
 * For Server Actions and data functions: throws instead of rendering.
 *
 * Pass the permission the operation actually needs — being HQ is not the same
 * as being allowed to approve an institution, and `role_permissions` is what
 * decides.
 */
export async function requireHq(permission?: PermissionCode): Promise<SessionContext> {
  const session = await requireSession()

  if (session.role !== 'HQ_ADMIN') {
    throw forbidden(`${session.role} attempted an HQ operation`)
  }

  if (permission && !session.permissions.has(permission)) {
    throw forbidden(`HQ_ADMIN lacks ${permission}`)
  }

  return session
}
