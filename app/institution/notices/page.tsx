import { Megaphone } from 'lucide-react'

import { NoticeDialog, NoticeList } from '@/components/notices/notice-board'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { EmptyState } from '@/components/shared/states'
import { listNotices } from '@/services/notices'

export const metadata = { title: 'Notices' }

/**
 * The board, from the office that writes it.
 *
 * `listNotices` returns drafts here and only published ones to a teacher or
 * student — same query, different policy result. Nothing on this page filters
 * by audience.
 */
export default async function InstitutionNoticesPage() {
  const notices = await listNotices()

  const posted = notices.filter((notice) => notice.is_published)
  const forTeachers = posted.filter((n) => n.audience === 'TEACHERS' || n.audience === 'EVERYONE')
  const forStudents = posted.filter((n) => n.audience === 'STUDENTS' || n.audience === 'EVERYONE')

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Institution"
        title="Notices"
        description="Post to your teachers, your students, or both. Drafts stay visible only to your office."
        breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Notices' }]}
        actions={<NoticeDialog />}
      />

      <StatGrid columns={3}>
        <StatCard label="On the board" value={posted.length} hint={`${notices.length - posted.length} draft(s)`} icon={Megaphone} />
        <StatCard label="Teachers can see" value={forTeachers.length} hint="Addressed to them or to everyone" />
        <StatCard label="Students can see" value={forStudents.length} hint="Addressed to them or to everyone" />
      </StatGrid>

      <Section title="All notices" description="Pinned first, then most recently posted.">
        {notices.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title="Nothing on the board"
            description="Post a notice to tell your teachers, your students, or both about something."
            action={<NoticeDialog />}
          />
        ) : (
          <NoticeList notices={notices} manageable />
        )}
      </Section>
    </div>
  )
}
