import {
  LifeBuoy,
  Megaphone,
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Network,
  Settings,
  Users,
} from 'lucide-react'

import type { NavGroup } from '@/components/workspace/workspace-nav'

/**
 * Institution navigation, declared once.
 *
 * Ordered the way an administrator actually works: see the institution, set up
 * its academic structure, then bring people into it. Academics comes before
 * people deliberately — a teacher with no department and a student with no
 * class are records rather than a working institution, so the structure is
 * built first.
 *
 * `permission` decides whether a link is worth showing. It is never what
 * decides access: the layout re-derives the session on every request and RLS
 * refuses the rows underneath, so hiding a link is a courtesy, not a control.
 */

export const INSTITUTION_NAV: NavGroup[] = [
  {
    label: 'Institution',
    items: [{ href: '/institution', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    label: 'Academic structure',
    items: [
      {
        href: '/institution/academics',
        label: 'Departments & classes',
        icon: Network,
        permission: 'academic.read',
        matchPrefix: true,
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/institution/teachers',
        label: 'Teachers',
        icon: Users,
        permission: 'teacher.read',
        matchPrefix: true,
      },
      {
        href: '/institution/students',
        label: 'Students',
        icon: GraduationCap,
        permission: 'student.read',
        matchPrefix: true,
      },
    ],
  },
  {
    label: 'Administration',
    items: [
      {
        href: '/institution/documents',
        label: 'Documents',
        icon: BookOpen,
        permission: 'document.read',
        matchPrefix: true,
      },
      {
        href: '/institution/notices',
        label: 'Notices',
        icon: Megaphone,
        matchPrefix: true,
      },
      {
        href: '/institution/support',
        label: 'Support',
        icon: LifeBuoy,
        matchPrefix: true,
      },
      {
        href: '/institution/settings',
        label: 'Settings',
        icon: Settings,
        permission: 'institution.read',
      },
    ],
  },
]
