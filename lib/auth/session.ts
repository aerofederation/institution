import 'server-only'

import { cache } from 'react'

import { accountInactive, unauthenticated } from '@/lib/errors'
import { isRoleCode, type PermissionCode, type RoleCode } from '@/lib/permissions/definitions'
import { createClient } from '@/lib/supabase/server'

/**
 * Everything the server knows about the caller, derived from the database
 * rather than from the request.
 *
 * `institutionId` here is the ONLY trusted tenant value in the application. No
 * service accepts an institution id from a form, a query string or a JSON body;
 * they read it from this object. HQ users have `institutionId === null`,
 * which the database enforces with a CHECK constraint.
 */
export type SessionContext = {
  userId: string
  email: string
  fullName: string
  role: RoleCode
  institutionId: string | null
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
  institutionStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED' | null
  institutionName: string | null
  permissions: ReadonlySet<PermissionCode>
  isHq: boolean
}

/**
 * Resolves the caller's identity, role, tenant and permission set.
 *
 * Memoised with React `cache()`, so a page that guards in the layout, reads in
 * the page and guards again inside a Server Action pays for one round trip per
 * request rather than one per call.
 *
 * Returns `null` when there is no valid session — callers that require one
 * should use `requireSession()`.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient()

  // getUser() revalidates against the Auth server. getSession() reads the
  // cookie and would trust a value the browser holds.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) return null

  // One query for identity, tenant and capability. The joins run under RLS, and
  // the profiles policy always admits the caller's own row.
  const { data, error } = await supabase
    .from('profiles')
    .select(
      `
      id, email, full_name, role, institution_id, status,
      institutions!profiles_institution_id_fkey ( name, status ),
      roles ( role_permissions ( permission_code ) )
      `,
    )
    .eq('id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  if (!isRoleCode(data.role)) return null

  const institution = data.institutions as { name: string; status: string } | null
  const rolePermissions =
    (data.roles as { role_permissions: { permission_code: string }[] } | null)?.role_permissions ??
    []

  return {
    userId: data.id,
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    institutionId: data.institution_id,
    status: data.status,
    institutionStatus: (institution?.status as SessionContext['institutionStatus']) ?? null,
    institutionName: institution?.name ?? null,
    permissions: new Set(rolePermissions.map((p) => p.permission_code as PermissionCode)),
    isHq: data.role === 'HQ_ADMIN',
  }
})

/**
 * The session, or a thrown error. Use this at the top of any protected Server
 * Action or Server Component.
 *
 * An account is usable only when the user is ACTIVE and — for tenant users —
 * their institution is ACTIVE too. This mirrors `private.is_active()` in the
 * database, so the application and RLS agree on what "active" means instead of
 * disagreeing in the gap between them.
 */
export async function requireSession(): Promise<SessionContext> {
  const context = await getSessionContext()
  if (!context) throw unauthenticated()

  if (context.status !== 'ACTIVE') {
    throw accountInactive(`account status is ${context.status}`)
  }

  if (context.institutionId && context.institutionStatus !== 'ACTIVE') {
    throw accountInactive(`institution status is ${context.institutionStatus}`)
  }

  return context
}

/**
 * The caller's tenant, or a thrown error for a user who has none.
 *
 * Services that operate on tenant data call this instead of reading
 * `institutionId` and checking it for null at each site.
 */
export async function requireTenant(): Promise<SessionContext & { institutionId: string }> {
  const context = await requireSession()
  if (!context.institutionId) {
    throw unauthenticated('this operation requires an institution-scoped account')
  }
  return context as SessionContext & { institutionId: string }
}
