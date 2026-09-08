import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft, ShieldCheck } from 'lucide-react'

import { AfiLogo } from '@/components/brand/afi-logo'
import { SiteFooter } from '@/components/public/site-footer'
import { Container, PublicSection, SectionHeading } from '@/components/public/sections'
import { ComingSoon } from '@/components/shared/states'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Verify a certificate',
  description:
    'Check a certificate issued through the Aero Federation of India against its record.',
  alternates: { canonical: '/verify' },
}

export default function VerifyIndexPage() {
  return (
    <>
      <header className="border-b">
        <Container className="flex h-16 items-center justify-between">
          <AfiLogo showDescriptor={false} />
          <Button asChild variant="ghost" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to afi.in
            </Link>
          </Button>
        </Container>
      </header>

      <main id="main" className="flex flex-1 flex-col">
        <PublicSection label="Verify a certificate" className="pt-14 sm:pt-16">
          <Container>
            <div className="mx-auto max-w-2xl">
              <SectionHeading
                eyebrow="Verification"
                title="Verify an AFI certificate"
                as="h1"
                description="Certificates issued through the federation carry a reference that can be checked against the issuing record."
              />
              <div className="mt-10">
                <ComingSoon
                  icon={ShieldCheck}
                  title="Certificate issuance begins in Phase 20"
                  description="Once certificates are issued, this page will confirm the holder, the title, the issue date and whether the certificate is still valid — and nothing beyond that."
                  phase="Phase 20"
                />
              </div>
            </div>
          </Container>
        </PublicSection>
      </main>

      <SiteFooter />
    </>
  )
}
