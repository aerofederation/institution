import type { Metadata } from 'next'

import { InstitutionDirectory } from '@/components/public/institution-directory'
import { Container, PublicSection, SectionHeading } from '@/components/public/sections'
import { getInstitutionDirectory, getPlatformStats } from '@/services/public/network'

export const metadata: Metadata = {
  title: 'Institution network',
  description:
    'Educational institutions registered in the Aero Federation of India network, verified by AFI headquarters.',
  alternates: { canonical: '/institutions' },
  openGraph: { url: '/institutions', title: 'AFI institution network' },
}

export default async function InstitutionsPage() {
  const [directory, stats] = await Promise.all([getInstitutionDirectory(120), getPlatformStats()])

  return (
    <PublicSection label="Institution network" className="pt-16 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Network"
          title="Institutions in the federation"
          as="h1"
          description="Every institution listed here has been reviewed and verified by AFI headquarters. Pending and suspended institutions are not published."
          className="max-w-3xl"
        />

        {stats.institutions > 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            <span className="afi-metric font-medium text-foreground">
              {stats.institutions.toLocaleString('en-IN')}
            </span>{' '}
            {stats.institutions === 1 ? 'institution' : 'institutions'} in the network
            {stats.states > 0 ? (
              <>
                {' '}
                across{' '}
                <span className="afi-metric font-medium text-foreground">
                  {stats.states.toLocaleString('en-IN')}
                </span>{' '}
                {stats.states === 1 ? 'state' : 'states'}
              </>
            ) : null}
            .
          </p>
        ) : null}

        <div className="mt-12">
          <InstitutionDirectory entries={directory} />
        </div>
      </Container>
    </PublicSection>
  )
}
