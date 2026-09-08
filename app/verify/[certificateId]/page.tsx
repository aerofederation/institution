import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft, ShieldQuestion } from 'lucide-react'

import { AfiLogo } from '@/components/brand/afi-logo'
import { SiteFooter } from '@/components/public/site-footer'
import { Container, PublicSection } from '@/components/public/sections'
import { ComingSoon } from '@/components/shared/states'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Certificate verification',
  description: 'Verify a certificate issued through the Aero Federation of India.',
  robots: { index: false, follow: false },
}

/**
 * Public certificate verification.
 *
 * A verification endpoint has exactly one job: to be trustworthy. The
 * `certificates` table arrives in Phase 20, and until a certificate can be
 * checked against a real record this page will not claim anything about the
 * identifier it was given — neither valid nor invalid.
 */
export default async function VerifyCertificatePage({
  params,
}: PageProps<'/verify/[certificateId]'>) {
  const { certificateId } = await params

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
        <PublicSection label="Certificate verification" className="pt-14 sm:pt-16">
          <Container>
            <div className="mx-auto max-w-2xl">
              <p className="afi-eyebrow mb-3">Certificate verification</p>
              <p className="mb-8 text-sm text-muted-foreground">
                Reference presented:{' '}
                <span className="font-mono break-all text-foreground">{certificateId}</span>
              </p>

              <ComingSoon
                icon={ShieldQuestion}
                title="Verification is not yet available"
                description="Certificates are issued and verified from Phase 20 onwards. This page will not tell you a certificate is valid or invalid until it can check it against a real record — an unreliable verification result is worse than none."
                phase="Phase 20"
              />
            </div>
          </Container>
        </PublicSection>
      </main>

      <SiteFooter />
    </>
  )
}
