import type { Metadata } from 'next'
import Link from 'next/link'

import { Building2, FileCheck2, LifeBuoy, Mail } from 'lucide-react'

import { Container, PublicSection, SectionHeading } from '@/components/public/sections'

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'How to reach the Aero Federation of India about membership, applications and platform access.',
  alternates: { canonical: '/contact' },
  openGraph: { url: '/contact', title: 'Contact AFI' },
}

/**
 * Contact.
 *
 * Routes people to the right channel rather than collecting messages into a
 * form with nothing behind it. Most arrivals here want one of three things —
 * to apply, to check an application, or to get into an account — and each has
 * a real destination today.
 *
 * No postal address or telephone number is published, because none has been
 * provided and inventing contact details for a national body would be worse
 * than omitting them.
 */
const ROUTES = [
  {
    icon: Building2,
    title: 'Institution membership',
    body: 'Interested in bringing your institution into the network? Start with the application — it collects everything AFI headquarters needs to review.',
    href: '/apply',
    cta: 'Register your institution',
  },
  {
    icon: FileCheck2,
    title: 'An application already submitted',
    body: 'Check progress using your application reference and the email address on the application.',
    href: '/application-status',
    cta: 'Track your application',
  },
  {
    icon: LifeBuoy,
    title: 'Account access',
    body: 'Accounts are issued by your institution. If you cannot sign in, your institution administrator can reissue your invitation.',
    href: '/login',
    cta: 'Portal sign-in',
  },
]

export default function ContactPage() {
  return (
    <PublicSection label="Contact" className="pt-16 sm:pt-20">
      <Container>
        <SectionHeading
          eyebrow="Contact"
          title="Get in touch"
          as="h1"
          description="Most enquiries are answered fastest through the right channel below."
          className="max-w-3xl"
        />

        <ul className="mt-12 grid gap-4 lg:grid-cols-3">
          {ROUTES.map((route) => (
            <li key={route.title} className="flex flex-col gap-4 rounded-lg border bg-card p-6">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                <route.icon className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <h2 className="font-heading text-base font-semibold">{route.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">{route.body}</p>
              </div>
              <Link
                href={route.href}
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {route.cta} →
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex items-start gap-3 rounded-lg border bg-muted/40 p-6">
          <Mail className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-sm font-semibold">Anything else</h2>
            <p className="text-sm text-muted-foreground">
              A general enquiry channel is published alongside the institution application process.
              Until then, applications and their tracking pages carry the correspondence for each
              institution.
            </p>
          </div>
        </div>
      </Container>
    </PublicSection>
  )
}
