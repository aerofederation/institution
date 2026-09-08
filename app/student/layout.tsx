import type { Metadata } from 'next'

import { WorkspaceAccessDenied, WorkspaceShell } from '@/components/workspace/workspace-shell'
import { getSessionContext } from '@/lib/auth/session'
import { countUnreadNotifications } from '@/services/notifications'

export const metadata: Metadata = {
  title: { default: 'Learning Workspace', template: '%s · AFI Learning' },
  robots: { index: false, follow: false, nocache: true },
}

/** Guard for every learning surface. Same three layers as the others. */
export default async function StudentLayout({ children }: LayoutProps<'/student'>) {
  const session = await getSessionContext()

  const permitted =
    session && session.role === 'STUDENT' && session.institutionId && session.status === 'ACTIVE'

  if (!permitted) {
    return <WorkspaceAccessDenied session={session} audience="students" />
  }

  // Only after the guard: the count is a tenant query, and an unauthenticated
  // or suspended session has no business making it.
  const unread = await countUnreadNotifications()

  return (
    <WorkspaceShell
      session={session}
      navKey="student"
      homeHref="/student"
      title={session.institutionName ?? 'Institution'}
      subtitle="Learning"
      notificationsHref="/student/notifications"
      unreadNotifications={unread}
    >
      {children}
    </WorkspaceShell>
  )
}
