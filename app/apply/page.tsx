import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft, ShieldCheck } from 'lucide-react'

import { ApplicationWizard } from '@/app/apply/application-wizard'
import { AfiLogo } from '@/components/brand/afi-logo'
import { Container, PublicSection } from '@/components/public/sections'
import { SiteFooter } from '@/components/public/site-footer'
import { Button } from '@/components/ui/button'
import { getCurrentDraft, listApplicationDocuments } from '@/services/public/application'

export const metadata: Metadata = {
  title: 'Register your institution',
  description:
    'Apply to bring your institution into the Aero Federation of India network. Applications are reviewed and verified by AFI headquarters.',
  alternates: { canonical: '/apply' },
  openGraph: { url: '/apply', title: 'Register your institution with AFI' },
}

/**
 * Institution registration.
 *
 * The draft is resolved on the server from an httpOnly cookie holding the draft
 * secret, so an applicant returning days later picks up exactly where they left
 * off without an account and without anything sensitive living in the browser.
 *
 * Dynamic by necessity: it reads a cookie, so it cannot be statically rendered.
 */
export const dynamic = 'force-dynamic'

export default async function ApplyPage() {
  const [draft, documents] = await Promise.all([getCurrentDraft(), listApplicationDocuments()])

  const currentDraft = draft.ok ? draft.data : null
  const currentDocuments = documents.ok ? documents.data : []
  const resuming = Boolean(currentDraft)

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
        <PublicSection label="Register your institution" className="pt-12 pb-20 sm:pt-16">
          <Container>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
              <div className="flex flex-col gap-4">
                <span className="afi-eyebrow">Institution registration</span>
                <h1 className="font-heading text-3xl leading-[1.12] font-semibold tracking-tight sm:text-4xl">
                  Bring your institution into the AFI network.
                </h1>
                <p className="text-muted-foreground text-base leading-relaxed">
                  Registration is a reviewed process. AFI headquarters verifies every applicant
                  before admission, which is what makes membership of the federation meaningful.
                </p>

                <div className="text-muted-foreground flex items-start gap-2.5 rounded-lg border border-dashed p-4 text-sm">
                  <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    {resuming ? (
                      <>
                        Your application is saved. You can close this page and return to it at any
                        time from this browser — nothing is submitted until you choose to submit.
                      </>
                    ) : (
                      <>
                        Each step is saved as you go, so you can finish the application across more
                        than one sitting. Nothing is submitted until you review and confirm.
                      </>
                    )}
                  </p>
                </div>
              </div>

              <ApplicationWizard
                initialDraft={currentDraft}
                initialDocuments={currentDocuments}
              />

              <p className="text-muted-foreground border-t pt-6 text-sm">
                Already applied?{' '}
                <Link href="/application-status" className="underline underline-offset-4">
                  Track an existing application
                </Link>
              </p>
            </div>
          </Container>
        </PublicSection>
      </main>

      <SiteFooter />
    </>
  )
}
