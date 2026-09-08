import type { Metadata } from 'next'

import { HqAccessDenied, HqShell } from '@/components/hq/hq-shell'
import { getSessionContext } from '@/lib/auth/session'
import { resolveHqAccess } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: { default: 'HQ Command Centre', template: '%s · AEROFEDERATION HEAD QUARTERS' },
  // The command centre must never appear in a search index.
  robots: { index: false, follow: false, nocache: true },
}

/**
 * Guard for every HQ surface.
 *
 * Placing the check in the layout means a new page added under this group is
 * protected the moment the file exists — there is no per-page opt-in to forget.
 * `/hq/login` deliberately sits outside this route group so that signing in is
 * still possible while signed out.
 *
 * This is the second of three independent layers. The middleware redirects on
 * a JWT claim (fast, convenient, not authoritative); this re-derives the role
 * from the `profiles` row; and RLS refuses federation-scoped rows to any
 * caller whose profile is not `HQ_ADMIN`. Removing this layout would make HQ
 * ugly, not open.
 */
export default async function HqCommandLayout({ children }: LayoutProps<'/hq'>) {
  const access = await resolveHqAccess()

  if (access.status === 'forbidden') {
    const session = await getSessionContext()
    return <HqAccessDenied session={session} />
  }

  const supabase = await createClient()
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)

  return (
    <HqShell session={access.session} unreadNotifications={count ?? 0}>
      {children}
    </HqShell>
  )
}
