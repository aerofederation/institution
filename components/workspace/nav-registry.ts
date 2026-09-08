import { INSTITUTION_NAV } from '@/components/institution/institution-nav'
import { STUDENT_NAV } from '@/components/student/student-nav'
import { TEACHER_NAV } from '@/components/teacher/teacher-nav'
import type { NavGroup } from '@/components/workspace/workspace-nav'

/**
 * The three workspace navigations, addressable by name.
 *
 * The indirection is not decoration. A nav item holds a Lucide `icon`, which is
 * a React component — a function. Passing the array from a layout (a Server
 * Component) to the sidebar (a Client Component) means serialising it across
 * the boundary, and React refuses:
 *
 *     Functions cannot be passed directly to Client Components
 *     {$$typeof: ..., render: function LayoutDashboard}
 *
 * Every institution page returned a 500 the moment the shell was generalised
 * this way, and neither typecheck, lint nor `next build` said a word: the types
 * are correct, and the failure only exists at render.
 *
 * So a *string* crosses the boundary and the client resolves it here, inside
 * the client bundle, where the icons already live.
 */

export const WORKSPACE_NAVS = {
  institution: INSTITUTION_NAV,
  teacher: TEACHER_NAV,
  student: STUDENT_NAV,
} as const satisfies Record<string, NavGroup[]>

export type WorkspaceKey = keyof typeof WORKSPACE_NAVS
