import type { Metadata } from 'next'

import { CalendarDays } from 'lucide-react'

import { Container, PublicSection, SectionHeading } from '@/components/public/sections'
import { ComingSoon } from '@/components/shared/states'

export const metadata: Metadata = {
  title: 'Events',
  description:
    'Conferences, workshops, competitions, exhibitions and student programmes across the Aero Federation of India network.',
  alternates: { canonical: '/events' },
  openGraph: { url: '/events', title: 'AFI events' },
}

/**
 * Public events listing.
 *
 * The `events` table is introduced in Phase 21. Rather than seeding the page
 * with example conferences — which a visitor would reasonably read as real and
 * might try to attend — the route exists and states when the programme opens.
 */
export default function EventsPage() {
  return (
    <PublicSection label="Events" className="pt-16 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Events"
          title="AFI events"
          as="h1"
          description="Conferences, workshops, competitions, exhibitions, training and student programmes run across the federation."
          className="max-w-3xl"
        />

        <div className="mt-12">
          <ComingSoon
            icon={CalendarDays}
            title="The events programme opens as the network grows"
            description="Published events will appear here with their dates, locations and registration details. Nothing is listed until there is a real event to list."
          />
        </div>
      </Container>
    </PublicSection>
  )
}
