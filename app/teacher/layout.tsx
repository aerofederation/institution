import type { Metadata } from 'next'

import { WorkspaceAccessDenied, WorkspaceShell } from '@/components/workspace/workspace-shell'
import { getSessionContext } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Teaching Workspace', template: '%s · AFI Teaching' },
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Guard for every teaching surface.
 *
 * Role, tenant and status are all re-derived from the `profiles` row here, not
 * read from the JWT. Middleware routes on the JWT claim because it is fast and
 * runs at the edge; this is the layer that decides.
 */
export default async function TeacherLayout({ children }: LayoutProps<'/teacher'>) {
  const session = await getSessionContext()

  const permitted =
    session && session.role === 'TEACHER' && session.institutionId && session.status === 'ACTIVE'

  if (!permitted) {
    return <WorkspaceAccessDenied session={session} audience="teachers" />
  }

  return (
    <WorkspaceShell
      session={session}
      navKey="teacher"
      homeHref="/teacher"
      title={session.institutionName ?? 'Institution'}
      subtitle="Teaching"
    >
      {children}
    </WorkspaceShell>
  )
}
