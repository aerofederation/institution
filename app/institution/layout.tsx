import type { Metadata } from 'next'

import { WorkspaceAccessDenied, WorkspaceShell } from '@/components/workspace/workspace-shell'
import { getSessionContext } from '@/lib/auth/session'

export const metadata: Metadata = {
  title: { default: 'Institution Operations Centre', template: '%s · AFI Institution' },
  // A tenant workspace must never appear in a search index.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Guard for every institution surface.
 *
 * Placing the check in the layout means a page added under this route is
 * protected the moment the file exists — there is no per-page opt-in to forget.
 *
 * This is the second of three independent layers. Middleware redirects on a JWT
 * claim (fast, convenient, not authoritative); this re-derives the role from
 * the `profiles` row; and RLS refuses every tenant-scoped row to a caller whose
 * profile does not belong to this institution. Deleting this layout would make
 * the workspace ugly, not open.
 *
 * An INVITED account is refused as well as a wrong role. Such an account exists
 * but has never set a password, and `private.is_active()` — which every tenant
 * RLS predicate consults — would refuse it every row anyway.
 */
export default async function InstitutionLayout({ children }: LayoutProps<'/institution'>) {
  const session = await getSessionContext()

  const permitted =
    session &&
    session.role === 'INSTITUTION_ADMIN' &&
    session.institutionId &&
    session.status === 'ACTIVE'

  if (!permitted) {
    return <WorkspaceAccessDenied session={session} audience="institution administrators" />
  }

  return (
    <WorkspaceShell
      session={session}
      navKey="institution"
      homeHref="/institution"
      title={session.institutionName ?? 'Institution'}
      subtitle="Operations"
    >
      {children}
    </WorkspaceShell>
  )
}
