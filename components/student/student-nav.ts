import {
  Bell,
  ChartColumn,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessageSquare,
} from 'lucide-react'

import type { NavGroup } from '@/components/workspace/workspace-nav'

/**
 * Learning workspace navigation.
 *
 * A student sees only what was published to a class they are actively enrolled
 * in, with the section matching where one is set. That is decided by
 * `private.receives_content()` inside every relevant RLS policy.
 */
export const STUDENT_NAV: NavGroup[] = [
  {
    label: 'Learning',
    items: [
      { href: '/student', label: 'Overview', icon: LayoutDashboard },
      {
        href: '/student/materials',
        label: 'Study materials',
        icon: FileText,
        permission: 'material.read',
        matchPrefix: true,
      },
      {
        href: '/student/assessments',
        label: 'Assignments & tests',
        icon: ListChecks,
        permission: 'assessment.attempt',
        matchPrefix: true,
      },
      /*
       * No permission gate: `notifications` is owner-scoped by RLS, so this
       * shows a student their own notices and there is no permission that
       * could widen or narrow that.
       */
      {
        href: '/student/marks',
        label: 'Marks',
        icon: ChartColumn,
        permission: 'assessment.attempt',
        matchPrefix: true,
      },
      {
        href: '/student/messages',
        label: 'Messages',
        icon: MessageSquare,
        permission: 'message.participate',
        matchPrefix: true,
      },
      {
        href: '/student/notices',
        label: 'Notices',
        icon: Megaphone,
        matchPrefix: true,
      },
      {
        href: '/student/support',
        label: 'Support',
        icon: LifeBuoy,
        matchPrefix: true,
      },
      {
        href: '/student/notifications',
        label: 'Notifications',
        icon: Bell,
        matchPrefix: true,
      },
    ],
  },
]
