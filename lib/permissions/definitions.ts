/**
 * The authorization vocabulary, mirrored from migration 003.
 *
 * The database is the source of truth: `role_permissions` decides what a role
 * can do, and RLS enforces it. These constants exist so that TypeScript can
 * catch a typo in a permission code at compile time instead of silently
 * denying — or worse, silently allowing — at runtime. `tests/unit/permissions`
 * asserts that this file and the migration stay in agreement.
 */

export const ROLE_CODES = ['HQ_ADMIN', 'INSTITUTION_ADMIN', 'TEACHER', 'STUDENT'] as const
export type RoleCode = (typeof ROLE_CODES)[number]

export const PERMISSION_CODES = [
  // Federation-level institution governance
  'institution.read_all',
  'institution.approve',
  'institution.reject',
  'institution.suspend',
  'institution.read',
  'institution.update',
  // GLOBAL: HQ correcting the federation's record of an institution. Distinct
  // from 'institution.update', which is an institution editing its own.
  'institution.update_all',

  // Applications
  'application.read_all',
  'application.review',
  'application.request_documents',

  // Documents
  'document.read_all',
  'document.verify',
  'document.read',
  'document.upload',

  // Staff
  'teacher.read_all',
  'teacher.read',
  'teacher.create',
  'teacher.update',
  'teacher.suspend',

  // Students
  'student.read_all',
  'student.read',
  'student.read_assigned',
  'student.create',
  'student.update',
  'student.suspend',

  // Academic structure
  'academic.read',
  'academic.manage',
  'academic.read_all',

  // Teaching content. `manage` is ownership-scoped, not tenant-scoped: it lets a
  // teacher author their OWN material, never reach a colleague's.
  'material.manage',
  'material.read',
  'assignment.manage',
  'assignment.submit',
  'assessment.manage',
  'assessment.attempt',
  'teaching.read_all',
  'teaching.read_tenant',

  // Own profile
  'profile.read_self',
  'profile.update_self',

  // Notifications
  'notification.read_self',
  'notification.broadcast',

  // Direct messaging. Participant-scoped by RLS, so this does not decide who
  // reads what — it exists so the surface can be withdrawn from a role.
  'message.participate',

  // Answering support tickets addressed to this institution.
  'support.resolve',

  // Governance
  'audit.read',
  'audit.read_tenant',
  'settings.read',
  'settings.manage',
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

/** Where each role lands after signing in. */
export const HOME_BY_ROLE: Record<RoleCode, string> = {
  HQ_ADMIN: '/hq',
  INSTITUTION_ADMIN: '/institution',
  TEACHER: '/teacher',
  STUDENT: '/student',
}

/** Which role owns which route prefix. Used for coarse middleware routing. */
export const ROUTE_PREFIX_ROLE: Record<string, RoleCode> = {
  '/hq': 'HQ_ADMIN',
  '/institution': 'INSTITUTION_ADMIN',
  '/teacher': 'TEACHER',
  '/student': 'STUDENT',
}

export const ROLE_LABEL: Record<RoleCode, string> = {
  HQ_ADMIN: 'AEROFEDERATION HEAD QUARTERS Administrator',
  INSTITUTION_ADMIN: 'Institution Administrator',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
}

export function isRoleCode(value: unknown): value is RoleCode {
  return typeof value === 'string' && (ROLE_CODES as readonly string[]).includes(value)
}

export function isPermissionCode(value: unknown): value is PermissionCode {
  return typeof value === 'string' && (PERMISSION_CODES as readonly string[]).includes(value)
}
