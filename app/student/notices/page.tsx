import { Megaphone } from 'lucide-react'

import { NoticeList } from '@/components/notices/notice-board'
import { PageHeader, Section } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { listNotices } from '@/services/notices'

export const metadata = { title: 'Notices' }

/**
 * The board, as read by a student.
 *
 * No audience filter in the page and none in the service: `notices_select`
 * returns a student the notices addressed to students or to everyone, published
 * and unexpired. A draft cannot reach here however this is queried.
 */
export default async function StudentNoticesPage() {
  const notices = await listNotices()

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Learning"
        title="Notices"
        description="Announcements from your institution."
        breadcrumbs={[{ label: 'Learning', href: '/student' }, { label: 'Notices' }]}
      />

      <Section title="Notice board" description="Pinned first, then most recent.">
        {notices.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nothing on the board"
            description="When your institution posts a notice for you, it appears here."
          />
        ) : (
          <NoticeList notices={notices} />
        )}
      </Section>
    </div>
  )
}
