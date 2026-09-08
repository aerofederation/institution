import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowLeft, KeyRound, Mail, Search } from 'lucide-react'

import { TrackingForm } from '@/app/application-status/tracking-form'
import { AfiLogo } from '@/components/brand/afi-logo'
import { Container, PublicSection } from '@/components/public/sections'
import { SiteFooter } from '@/components/public/site-footer'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Application status',
  description:
    'Track the progress of an institution application to the Aero Federation of India using your application reference.',
  alternates: { canonical: '/application-status' },
  // A lookup surface, not content. Nothing here should be indexed.
  robots: { index: false, follow: true },
}

/**
 * Application tracking.
 *
 * The two-step exchange — reference plus email, then a one-time code sent to
 * that address — exists because an application carries an institution's contact
 * details, its documents and its review correspondence. A reference number
 * alone must not open that, and the endpoint must not be walkable to discover
 * which institutions have applied at all.
 */
export default function ApplicationStatusPage() {
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
        <PublicSection label="Application status" className="pt-12 pb-20 sm:pt-16">
          <Container>
            <div className="mx-auto grid w-full max-w-5xl gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
              <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-4">
                  <span className="afi-eyebrow">Track an application</span>
                  <h1 className="font-heading text-3xl leading-[1.12] font-semibold tracking-tight sm:text-4xl">
                    Follow your application through review.
                  </h1>
                  <p className="text-muted-foreground leading-relaxed">
                    Enter your application reference and the email address it was submitted under.
                  </p>
                </div>

                <TrackingForm />
              </div>

              <aside className="bg-muted/30 flex h-fit flex-col gap-5 rounded-lg border p-6">
                <h2 className="font-heading text-sm font-semibold">How this works</h2>
                <ol className="flex flex-col gap-4">
                  {[
                    {
                      icon: Search,
                      title: 'Reference and email',
                      body: 'Both must match the application on file.',
                    },
                    {
                      icon: Mail,
                      title: 'One-time code',
                      body: 'A six-digit code is sent to that address. It expires in 15 minutes and works once.',
                    },
                    {
                      icon: KeyRound,
                      title: 'Status',
                      body: 'The code opens the current status, review history and document verification.',
                    },
                  ].map((entry, index) => (
                    <li key={entry.title} className="flex gap-3">
                      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
                        <entry.icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium">
                          {index + 1}. {entry.title}
                        </span>
                        <span className="text-muted-foreground text-xs leading-relaxed">
                          {entry.body}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="text-muted-foreground border-t pt-4 text-xs">
                  Responses are identical whether or not a reference exists, so this page cannot be
                  used to discover which institutions have applied.
                </p>
              </aside>
            </div>
          </Container>
        </PublicSection>
      </main>

      <SiteFooter />
    </>
  )
}
