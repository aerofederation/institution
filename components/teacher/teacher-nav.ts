import {
  LifeBuoy,
  Library,
  Megaphone,
  MessageSquare,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Network,
} from 'lucide-react'

import type { NavGroup } from '@/components/workspace/workspace-nav'

/**
 * Teaching workspace navigation.
 *
 * Ordered the way a teacher's week runs: see what needs attention, then the
 * things they publish, then the people they publish to.
 *
 * Every surface below shows only this teacher's own work. That is enforced by
 * RLS on `teacher_id`, not by these links.
 */
export const TEACHER_NAV: NavGroup[] = [
  {
    label: 'Teaching',
    items: [
      { href: '/teacher', label: 'Overview', icon: LayoutDashboard },
      { href: '/teacher/classes', label: 'My classes', icon: Network, matchPrefix: true },
    ],
  },
  {
    label: 'Content',
    items: [
      {
        href: '/teacher/materials',
        label: 'Study materials',
        icon: FileText,
        permission: 'material.manage',
        matchPrefix: true,
      },
      {
        href: '/teacher/assessments',
        label: 'Assessments',
        icon: ListChecks,
        permission: 'assessment.manage',
        matchPrefix: true,
      },
      {
        href: '/teacher/question-bank',
        label: 'Question bank',
        icon: Library,
        permission: 'assessment.manage',
        matchPrefix: true,
      },
    ],
  },
  {
    label: 'People',
    items: [
      {
        href: '/teacher/students',
        label: 'My students',
        icon: GraduationCap,
        permission: 'student.read_assigned',
        matchPrefix: true,
      },
      {
        href: '/teacher/notices',
        label: 'Notices',
        icon: Megaphone,
        matchPrefix: true,
      },
      {
        href: '/teacher/support',
        label: 'Support',
        icon: LifeBuoy,
        matchPrefix: true,
      },
      {
        href: '/teacher/messages',
        label: 'Messages',
        icon: MessageSquare,
        permission: 'message.participate',
        matchPrefix: true,
      },
    ],
  },
]
