import type { Metadata } from 'next'

import { Building2, Compass, GraduationCap, Network, ShieldCheck, Users } from 'lucide-react'

import {
  Container,
  FeatureCard,
  PublicSection,
  SectionCta,
  SectionHeading,
} from '@/components/public/sections'

export const metadata: Metadata = {
  title: 'About',
  description:
    'The Aero Federation of India connects educational institutions, educators and students across the country through shared digital infrastructure, whatever they teach.',
  alternates: { canonical: '/about' },
  openGraph: { url: '/about', title: 'About the Aero Federation of India' },
}

export default function AboutPage() {
  return (
    <>
      <PublicSection label="About AFI" className="pt-16 sm:pt-20">
        <Container>
          <SectionHeading
            eyebrow="About"
            title="Education, connected nationally."
            as="h1"
            description="AFI exists because education in India is distributed across hundreds of independent institutions, each doing serious work in isolation. A federation gives them shared infrastructure, common standards and a peer network — without asking any of them to give up their own identity, departments or curriculum."
            className="max-w-3xl"
          />
        </Container>
      </PublicSection>

      <PublicSection label="What the federation provides" tone="muted">
        <Container>
          <SectionHeading eyebrow="Purpose" title="What the federation provides" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Network}
              title="Institutional connectivity"
              description="A verified national network where member institutions share infrastructure and standards while running independently."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="Verified membership"
              description="Every institution is reviewed by AFI headquarters, with its documents checked, before it joins the network."
            />
            <FeatureCard
              icon={GraduationCap}
              title="Every department"
              description="Support for whatever an institution teaches, from foundational study through to applied practice."
            />
            <FeatureCard
              icon={Compass}
              title="Innovation"
              description="AI-assisted learning and teaching built into the platform rather than added as an afterthought."
            />
            <FeatureCard
              icon={Users}
              title="Collaboration"
              description="A shared context in which institutions, educators and learners can work to the same standards."
            />
            <FeatureCard
              icon={Building2}
              title="Student development"
              description="Structured pathways, practice and analytics that follow a learner's progress rather than a cohort average."
            />
          </div>
        </Container>
      </PublicSection>

      <PublicSection label="How the platform is built">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <SectionHeading
              eyebrow="How it works"
              title="Independent institutions, isolated data."
              description="Membership must not mean handing your institution's records to everyone else in the network."
            />

            <div className="flex flex-col gap-6">
              <p className="leading-relaxed text-muted-foreground">
                Each institution&rsquo;s data is isolated at the database level. One institution can
                never read another&rsquo;s staff, learners, documents or academic records — that
                boundary is enforced by row-level security in the database and by structural
                constraints in the schema, not by application code alone.
              </p>
              <p className="leading-relaxed text-muted-foreground">
                Accounts are issued, never self-registered. An institution administrator provisions
                their educators and learners; those accounts belong to that institution and cannot
                be moved. AFI headquarters oversees the network without operating any institution
                inside it.
              </p>
              <SectionCta href="/institutions">See the network</SectionCta>
            </div>
          </div>
        </Container>
      </PublicSection>
    </>
  )
}
