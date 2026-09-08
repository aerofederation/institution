import type { Metadata } from 'next'

import { Megaphone } from 'lucide-react'

import { Container, PublicSection, SectionHeading } from '@/components/public/sections'
import { ComingSoon } from '@/components/shared/states'

export const metadata: Metadata = {
  title: 'Announcements',
  description:
    'Federation notices, platform updates and guidance published by the Aero Federation of India.',
  alternates: { canonical: '/announcements' },
  openGraph: { url: '/announcements', title: 'AFI announcements' },
}

/**
 * Public announcements.
 *
 * Backed by the `announcements` table from Phase 21. Placeholder notices are
 * deliberately not shown: an announcements page that carries invented notices
 * from a national body is actively misleading.
 */
export default function AnnouncementsPage() {
  return (
    <PublicSection label="Announcements" className="pt-16 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Announcements"
          title="Federation announcements"
          as="h1"
          description="Notices, platform updates and guidance issued by AFI headquarters to the network."
          className="max-w-3xl"
        />

        <div className="mt-12">
          <ComingSoon
            icon={Megaphone}
            title="No announcements have been published yet"
            description="Federation notices appear here as they are issued. Nothing is shown until AFI headquarters publishes it."
          />
        </div>
      </Container>
    </PublicSection>
  )
}
