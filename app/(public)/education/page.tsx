import type { Metadata } from 'next'

import { BookOpen, Building2, GraduationCap, Layers, Rocket, Wrench } from 'lucide-react'

import {
  Container,
  FeatureCard,
  PublicSection,
  SectionCta,
  SectionHeading,
} from '@/components/public/sections'

export const metadata: Metadata = {
  title: 'What institutions teach',
  description:
    'The breadth of teaching supported across the Aero Federation of India network — every department a member institution runs, from engineering and sciences to management, design and the humanities.',
  alternates: { canonical: '/education' },
  openGraph: { url: '/education', title: 'What institutions teach at AFI' },
}

/*
 * Examples of departments already on the platform, not a taxonomy and not a
 * limit. AFI models no disciplines at all — an institution defines its own
 * departments, subjects and courses — so this list exists to show breadth.
 * Aerospace appears among them rather than framing them.
 */
const DOMAINS = [
  {
    name: 'Engineering',
    body: 'Mechanical, civil, electrical, electronics and the applied branches.',
  },
  {
    name: 'Aerospace & Aviation',
    body: 'Aerodynamics, propulsion, avionics, airworthiness and space systems.',
  },
  {
    name: 'Computer Science',
    body: 'Software, systems, data, networks and artificial intelligence.',
  },
  {
    name: 'Sciences',
    body: 'Physics, chemistry, biology and the laboratory disciplines.',
  },
  { name: 'Mathematics', body: 'Pure and applied mathematics, statistics and modelling.' },
  {
    name: 'Management & Commerce',
    body: 'Business, accounting, economics and organisational practice.',
  },
  { name: 'Design', body: 'Industrial, product, visual and interaction design.' },
  {
    name: 'Humanities & Social Sciences',
    body: 'Languages, history, law, psychology and the social disciplines.',
  },
  { name: 'Health Sciences', body: 'Clinical, allied health and life science programmes.' },
  {
    name: 'Research & Innovation',
    body: 'Project work, experimentation and applied investigation.',
  },
]

export default function EducationPage() {
  return (
    <>
      <PublicSection label="Disciplines" className="pt-16 sm:pt-20">
        <Container>
          <SectionHeading
            eyebrow="Education"
            title="From first principles to applied practice."
            as="h1"
            description="These are examples of what member institutions teach — not a syllabus AFI imposes. Every institution designs its own academic structure, subjects and courses; the platform adapts to whatever shape that takes."
            className="max-w-3xl"
          />
        </Container>
      </PublicSection>

      <PublicSection label="Learning domains" tone="muted">
        <Container>
          <SectionHeading eyebrow="Domains" title="Areas of study across the network" />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DOMAINS.map((domain) => (
              <li key={domain.name} className="flex flex-col gap-2 rounded-lg border bg-card p-6">
                <h3 className="font-heading text-base font-semibold">{domain.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{domain.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
            Institutions are not limited to these areas. Mathematics, physics, design and
            manufacturing all sit alongside them, and an institution may teach anything its
            curriculum requires.
          </p>
        </Container>
      </PublicSection>

      <PublicSection label="Academic structure">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <SectionHeading
              eyebrow="Structure"
              title="One platform, many shapes of institution."
              description="A school, a university, a polytechnic and a corporate training academy organise themselves very differently. Every layer of the academic hierarchy is optional, so each institution uses only what it needs."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={Building2}
                title="Departments & programmes"
                description="Used by universities and colleges; a school may skip both entirely."
              />
              <FeatureCard
                icon={Layers}
                title="Classes & sections"
                description="Natural for schools and cohort-based programmes, optional for others."
              />
              <FeatureCard
                icon={BookOpen}
                title="Subjects & courses"
                description="A subject as delivered — to a class, within a programme, in an academic year."
              />
              <FeatureCard
                icon={GraduationCap}
                title="Academic years"
                description="Structure the calendar without forcing a single national timetable."
              />
            </div>
          </div>
        </Container>
      </PublicSection>

      <PublicSection label="Applied learning" tone="muted">
        <Container>
          <div className="grid gap-6 lg:grid-cols-3">
            <FeatureCard
              icon={Rocket}
              title="Concept to application"
              description="Structured progression from foundational study through to applied practice, in any discipline."
            />
            <FeatureCard
              icon={Wrench}
              title="Practice and assessment"
              description="Assignments, timed examinations and an adaptive practice centre built into the platform."
            />
            <FeatureCard
              icon={GraduationCap}
              title="Progress that is visible"
              description="Topic mastery and performance tracked per learner, not averaged across a cohort."
            />
          </div>
          <div className="mt-10">
            <SectionCta href="/ai-classroom">See how AI supports learning</SectionCta>
          </div>
        </Container>
      </PublicSection>
    </>
  )
}
