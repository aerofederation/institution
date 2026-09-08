import 'server-only'

import { requireSession, type SessionContext } from '@/lib/auth/session'
import { forbidden, tenantMismatch } from '@/lib/errors'

import type { PermissionCode } from './definitions'

/**
 * The authorization pipeline every protected server operation runs through.
 *
 * This is the application half of the platform's dual enforcement. The database
 * half — RLS, composite tenant foreign keys, immutability triggers — runs
 * regardless and would still refuse a request that slipped past here. Neither
 * layer is permitted to be the only one: this layer produces meaningful errors
 * and covers rules RLS cannot express, and RLS covers the call site somebody
 * forgets to guard.
 */

export type AuthorizeOptions = {
  /** Permission the caller must hold. */
  permission: PermissionCode
  /**
   * Tenant the target record belongs to.
   *
   * Pass this whenever the operation touches an existing record, and take the
   * value from the record you read — never from the request. Leaving it out is
   * correct only when the operation is scoped to the caller's own tenant by
   * construction.
   */
  institutionId?: string | null
  /**
   * Allow an HQ caller to act across tenants. Defaults to true, because HQ's
   * whole purpose is federation-wide oversight; set it false for an operation
   * that must stay tenant-local even for HQ.
   */
  allowHqCrossTenant?: boolean
}

/**
 * Asserts the caller may perform an operation, and returns their session.
 *
 *     const ctx = await authorize({ permission: 'teacher.create' })
 *     // ctx.institutionId is now the ONLY tenant value the service should use
 */
export async function authorize(options: AuthorizeOptions): Promise<SessionContext> {
  const context = await requireSession()
  const { permission, institutionId, allowHqCrossTenant = true } = options

  if (!context.permissions.has(permission)) {
    throw forbidden(`${context.role} lacks ${permission}`)
  }

  if (institutionId !== undefined && institutionId !== null) {
    const crossTenant = context.institutionId !== institutionId
    const hqIsAllowed = context.isHq && allowHqCrossTenant

    if (crossTenant && !hqIsAllowed) {
      // The message is internal. The client sees the generic TENANT_MISMATCH
      // text, which does not confirm that the record exists.
      throw tenantMismatch(
        `caller tenant ${context.institutionId ?? 'none'} may not reach ${institutionId}`,
      )
    }
  }

  return context
}

/** Non-throwing capability check, for deciding whether to render a control. */
export function can(context: SessionContext | null, permission: PermissionCode): boolean {
  return context?.permissions.has(permission) ?? false
}

/** True when the caller holds every listed permission. */
export function canAll(context: SessionContext | null, permissions: PermissionCode[]): boolean {
  return permissions.every((permission) => can(context, permission))
}

/** True when the caller holds at least one of the listed permissions. */
export function canAny(context: SessionContext | null, permissions: PermissionCode[]): boolean {
  return permissions.some((permission) => can(context, permission))
}

/**
 * Asserts that a record the caller has already read belongs to a tenant they
 * may act on.
 *
 * Use after fetching, when the tenant was not known at authorize() time:
 *
 *     const ctx = await authorize({ permission: 'academic.manage' })
 *     const row = await loadClass(id)
 *     assertSameTenant(ctx, row.institution_id)
 */
export function assertSameTenant(
  context: SessionContext,
  institutionId: string | null,
  options: { allowHqCrossTenant?: boolean } = {},
): void {
  const { allowHqCrossTenant = true } = options
  if (context.isHq && allowHqCrossTenant) return
  if (institutionId !== null && institutionId === context.institutionId) return

  throw tenantMismatch(
    `caller tenant ${context.institutionId ?? 'none'} may not reach ${institutionId ?? 'none'}`,
  )
}
