import { Megaphone } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { ComingSoon } from '@/components/shared/states'

export const metadata = { title: 'Announcements' }

/**
 * Federation announcements.
 *
 * The `announcements` table arrives in Phase 21. The route exists so the
 * command centre's map is complete and the navigation does not lie about what
 * is reachable.
 */
export default function HqAnnouncementsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Announcements"
        description="Federation-wide notices published to institutions, educators and students."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Announcements' }]}
      />

      <ComingSoon
        title="Announcement publishing arrives with its database tables"
        description="Drafting, publishing, scheduling and archiving need the announcements table and its audience scoping, which are added in Phase 21."
        phase="Phase 21"
        icon={Megaphone}
      />
    </>
  )
}
