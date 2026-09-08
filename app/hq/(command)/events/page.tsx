import { CalendarDays } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { ComingSoon } from '@/components/shared/states'

export const metadata = { title: 'Events' }

/**
 * Event management.
 *
 * The `events` and `event_registrations` tables are introduced in Phase 21.
 * Building create/publish controls against tables that do not exist would
 * produce buttons that fail on click, so the route exists and says what it is
 * waiting for.
 */
export default function HqEventsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Events"
        description="Conferences, workshops, competitions and training across the federation."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Events' }]}
      />

      <ComingSoon
        title="Event management arrives with its database tables"
        description="Creating, publishing and tracking registrations needs the events and event_registrations tables, which are added in Phase 21. Rather than shipping controls that would fail on click, this surface is routed and waiting."
        phase="Phase 21"
        icon={CalendarDays}
      />
    </>
  )
}
