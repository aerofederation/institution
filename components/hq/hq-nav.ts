import type { LucideIcon } from 'lucide-react'
import {
  LifeBuoy,
  Activity,
  Award,
  BarChart3,
  Bell,
  Brain,
  Building2,
  CalendarDays,
  FileCheck2,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  Network,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react'

import type { PermissionCode } from '@/lib/permissions/definitions'

/**
 * HQ navigation, declared once.
 *
 * Grouped by what an administrator is trying to do rather than by table name:
 * oversight first (what is happening), then the network (who is in it), then
 * governance (what was done and how the platform is configured).
 *
 * `permission` is a display hint only — it decides whether a link is worth
 * showing. Access itself is decided by `resolveHqAccess()` on every page and by
 * RLS underneath it, so hiding a link never stands in for a check.
 *
 * `status: 'pending'` marks a surface whose backing tables arrive in a later
 * phase. Those links stay visible and are labelled, because a command centre
 * that silently omits half its map is harder to trust than one that says
 * "not yet".
 */

export type HqNavItem = {
  href: string
  label: string
  icon: LucideIcon
  permission?: PermissionCode
  /** Marks a surface that is routed and reachable but not yet data-backed. */
  status?: 'pending'
  /** Matches child routes for active state, e.g. /hq/institutions/[id]. */
  matchPrefix?: boolean
}

export type HqNavGroup = {
  label: string
  items: HqNavItem[]
}

export const HQ_NAV: HqNavGroup[] = [
  {
    label: 'Oversight',
    items: [
      { href: '/hq', label: 'Overview', icon: LayoutDashboard },
      {
        href: '/hq/applications',
        label: 'Applications',
        icon: FileCheck2,
        permission: 'application.read_all',
        matchPrefix: true,
      },
      {
        href: '/hq/institutions',
        label: 'Institutions',
        icon: Building2,
        permission: 'institution.read_all',
        matchPrefix: true,
      },
    ],
  },
  {
    label: 'Network',
    items: [
      {
        href: '/hq/teachers',
        label: 'Teachers',
        icon: Users,
        permission: 'teacher.read_all',
        matchPrefix: true,
      },
      {
        href: '/hq/students',
        label: 'Students',
        icon: GraduationCap,
        permission: 'student.read_all',
        matchPrefix: true,
      },
      {
        href: '/hq/academics',
        label: 'Academic network',
        icon: Network,
        permission: 'academic.read_all',
      },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/hq/analytics', label: 'Analytics', icon: BarChart3 },
      { href: '/hq/ai', label: 'AI intelligence', icon: Brain, status: 'pending' },
    ],
  },
  {
    label: 'Records',
    items: [
      {
        href: '/hq/documents',
        label: 'Documents',
        icon: FileText,
        permission: 'document.read_all',
        matchPrefix: true,
      },
      { href: '/hq/certificates', label: 'Certificates', icon: Award, status: 'pending' },
      { href: '/hq/events', label: 'Events', icon: CalendarDays, status: 'pending' },
      { href: '/hq/announcements', label: 'Announcements', icon: Megaphone, status: 'pending' },
    ],
  },
  {
    label: 'Governance',
    items: [
      { href: '/hq/support', label: 'Support', icon: LifeBuoy, matchPrefix: true },
      { href: '/hq/notifications', label: 'Notifications', icon: Bell },
      {
        href: '/hq/audit-logs',
        label: 'Audit centre',
        icon: ScrollText,
        permission: 'audit.read',
      },
      { href: '/hq/settings', label: 'Settings', icon: Settings, matchPrefix: true },
    ],
  },
]

export const HQ_ACTIVITY_ICON = Activity

/** True when `href` is the active route for `pathname`. */
export function isActiveRoute(pathname: string, item: HqNavItem): boolean {
  if (item.href === '/hq') return pathname === '/hq'
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(`${item.href}/`)
  return pathname === item.href
}
