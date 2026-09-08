import { SplitText } from '@/components/motion/split-text'
import type { Metadata } from 'next'
import Link from 'next/link'

import {
  ArrowRight,
  Award,
  BookOpen,
  Brain,
  Building2,
  CalendarDays,
  ClipboardCheck,
  Compass,
  FileCheck2,
  GraduationCap,
  LineChart,
  Megaphone,
  MessagesSquare,
  Network,
  PlayCircle,
  Rocket,
  Sparkles,
  Target,
  Users,
} from 'lucide-react'

import { HeroVisual } from '@/components/public/hero-visual'
import { InstitutionDirectory } from '@/components/public/institution-directory'
import { NetworkStrip } from '@/components/public/network-strip'
import {
  Container,
  FeatureCard,
  PublicSection,
  SectionCta,
  SectionHeading,
} from '@/components/public/sections'
import { Button } from '@/components/ui/button'
import { getInstitutionDirectory, getPlatformStats } from '@/services/public/network'

export const metadata: Metadata = {
  title: {
    absolute: 'INSTITUTION | AEROFEDERATION',
  },
  description:
    'AFI connects educational institutions, educators and students across India through a single digital ecosystem for every department, powered by AI-assisted learning.',
  alternates: { canonical: '/' },
  openGraph: {
    url: '/',
    title: 'INSTITUTION | AEROFEDERATION',
    description:
      'A national network connecting institutions, educators and students across every discipline, with AI-assisted learning.',
  },
}

const ECOSYSTEM = [
  {
    icon: Compass,
    title: 'AEROFEDERATION HEAD QUARTERS',
    body: 'Reviews and approves institutions, oversees the national network, and maintains the standards every member works to.',
  },
  {
    icon: Building2,
    title: 'Institutions',
    body: 'Run their own academic structure — departments, programmes, classes and courses — and provision their staff and learners.',
  },
  {
    icon: Users,
    title: 'Educators',
    body: 'Teach assigned classes, publish materials, set assignments and examinations, and follow how each learner is progressing.',
  },
  {
    icon: GraduationCap,
    title: 'Students',
    body: 'Learn through structured courses, practice, video and AI-assisted support built around their own pace and gaps.',
  },
]

/*
 * Examples, not a taxonomy. The platform does not model disciplines at all —
 * an institution defines its own departments and subjects — so this list is
 * marketing copy showing breadth, and adding to it changes nothing but the
 * page. Aerospace sits among them rather than framing them: AFI is open to
 * every department an institution teaches.
 */
const DISCIPLINES = [
  'Engineering',
  'Aerospace & Aviation',
  'Computer Science',
  'Sciences',
  'Mathematics',
  'Management & Commerce',
  'Design',
  'Humanities',
  'Health Sciences',
  'Research & Innovation',
]

export default async function HomePage() {
  // Both are cached projections, so the homepage costs two short queries.
  const [stats, directory] = await Promise.all([getPlatformStats(), getInstitutionDirectory(8)])

  return (
    <>
      {/* ══ Hero ══════════════════════════════════════════════════════════ */}
      <section
        aria-label="Introduction"
        className="relative -mt-16 overflow-hidden bg-navy-950 pt-16 text-white"
      >
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-aero-700/25 via-transparent to-transparent"
          aria-hidden="true"
        />

        <Container className="relative">
          <div className="grid items-center gap-14 py-20 sm:py-24 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-28">
            <div className="flex flex-col items-start gap-7">
              <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-white/70 uppercase">
                <Rocket className="size-3" aria-hidden="true" />
                A national education network, open to every department
              </span>

              {/*
                Masked line reveal, the same treatment aerofederation.org gives
                its display headings. `onLoad` because this is above the fold —
                a scroll trigger would never fire for it.
              */}
              <SplitText
                as="h1"
                mode="line"
                onLoad
                className="font-heading text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl lg:text-6xl [&_[data-unit]]:text-aero-400 [&>span:first-child_[data-unit]]:text-white"
              >
                {'Connecting institutions.\nAdvancing every discipline.'}
              </SplitText>

              <p className="max-w-xl text-lg leading-relaxed text-white/65">
                The Aero Federation of India brings educational institutions, educators and students
                into one digital ecosystem — academic structure, teaching, assessment and
                AI-assisted learning, built for the people who will build what comes next.
              </p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="bg-white text-navy-900 hover:bg-white/90">
                  <Link href="/apply">
                    Register your institution
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
                >
                  <Link href="/about">EXPLORE AEROFEDERATION</Link>
                </Button>
              </div>

              <p className="text-sm text-white/45">
                Already applied?{' '}
                <Link
                  href="/application-status"
                  className="text-white/75 underline underline-offset-4 hover:text-white"
                >
                  Track your application
                </Link>
              </p>
            </div>

            <div className="flex justify-center lg:justify-end">
              <HeroVisual />
            </div>
          </div>
        </Container>

        <NetworkStrip stats={stats} />
      </section>

      {/* ══ About ═════════════════════════════════════════════════════════ */}
      <PublicSection label="About the federation">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <SectionHeading
              eyebrow="About AFI"
              title="A federation, not a single campus."
              description="Education in India happens across hundreds of schools, colleges, universities, training institutes and industry academies, in every department they teach. AFI connects them — so an institution keeps its own identity and curriculum while gaining shared infrastructure, standards and a national peer network."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={Network}
                title="Connected institutions"
                description="A verified network where each member runs its own academic structure on shared, secure infrastructure."
              />
              <FeatureCard
                icon={Target}
                title="Consistent standards"
                description="Every institution is reviewed and verified by AFI headquarters before it joins the network."
              />
              <FeatureCard
                icon={Sparkles}
                title="Technology that helps"
                description="AI-assisted learning and teaching tools built into the platform, not bolted on afterwards."
              />
              <FeatureCard
                icon={GraduationCap}
                title="Student development"
                description="Structured pathways from foundational concepts through to applied practice, whatever the subject."
              />
            </div>
          </div>
        </Container>
      </PublicSection>

      {/* ══ Ecosystem ═════════════════════════════════════════════════════ */}
      <PublicSection label="The AFI ecosystem" tone="muted">
        <Container>
          <SectionHeading
            eyebrow="The ecosystem"
            title="Four layers, one platform."
            description="Every layer has its own workspace, its own permissions and its own view of the network — connected top to bottom, and isolated side to side."
          />

          <ol className="mt-12 grid gap-4 lg:grid-cols-4">
            {ECOSYSTEM.map((layer, index) => (
              <li key={layer.title} className="relative">
                {/* Connector between layers on wide viewports */}
                {index < ECOSYSTEM.length - 1 ? (
                  <span
                    className="absolute top-14 -right-2 hidden h-px w-4 bg-border lg:block"
                    aria-hidden="true"
                  />
                ) : null}
                <div className="flex h-full flex-col gap-3 rounded-lg border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <layer.icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground/40">0{index + 1}</span>
                  </div>
                  <h3 className="font-heading text-base font-semibold">{layer.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{layer.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
            Institution data is isolated at the database level. One institution can never read
            another&rsquo;s staff, learners, documents or records — enforced by row-level security,
            not by application code alone.
          </p>
        </Container>
      </PublicSection>

      {/* ══ Institution network ═══════════════════════════════════════════ */}
      <PublicSection label="Institution network">
        <Container>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeading
              eyebrow="Network"
              title="Institutions in the federation"
              description="Every member is reviewed and verified by AFI headquarters before it appears here."
            />
            <SectionCta href="/institutions">View institutions</SectionCta>
          </div>

          <div className="mt-12">
            <InstitutionDirectory entries={directory} compact />
          </div>
        </Container>
      </PublicSection>

      {/* ══ AI Classroom ══════════════════════════════════════════════════ */}
      <PublicSection label="AFI AI Classroom" tone="dark">
        <Container className="relative">
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center">
            <div className="flex flex-col items-start gap-6">
              <SectionHeading
                eyebrow="AFI AI Classroom"
                title="Learning that adapts to the learner."
                description="More than a chatbot. The AI Classroom understands a student's own courses, materials and performance, and works within them — explaining, questioning, practising and revising against what that student actually needs."
                tone="inverted"
              />
              <SectionCta href="/ai-classroom" variant="default">
                Explore the AI Classroom
              </SectionCta>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: MessagesSquare,
                  title: 'AI tutor',
                  body: 'Step-by-step explanations, worked examples and Socratic questioning that guides rather than answers.',
                },
                {
                  icon: ClipboardCheck,
                  title: 'Practice & revision',
                  body: 'Adaptive questions targeted at weak topics, with mistake analysis that explains what went wrong.',
                },
                {
                  icon: Brain,
                  title: 'Teacher copilot',
                  body: 'Lesson plans, assignment and examination drafts, and rubrics — always reviewed by a teacher before publishing.',
                },
                {
                  icon: LineChart,
                  title: 'Intelligent analytics',
                  body: 'Topic mastery and early indicators, each shown with the evidence behind it.',
                },
              ].map((item) => (
                <FeatureCard key={item.title} tone="inverted" {...item} description={item.body} />
              ))}
            </div>
          </div>

          <p className="relative mt-10 max-w-3xl text-sm text-white/45">
            AI assists; it does not decide. Generated assessments are reviewed by a teacher before
            publication, suggested grades are recorded separately from the mark a teacher awards,
            and no automated system takes disciplinary action.
          </p>
        </Container>
      </PublicSection>

      {/* ══ Teacher + student ═════════════════════════════════════════════ */}
      <PublicSection label="For educators and students">
        <Container>
          <SectionHeading
            eyebrow="Two sides of the classroom"
            title="Built for the people using it every day."
            align="center"
          />

          <div className="mt-12 grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6 rounded-xl border bg-card p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="afi-eyebrow">For educators</span>
                  <h3 className="font-heading text-lg font-semibold">The teaching workspace</h3>
                </div>
              </div>
              <ul className="flex flex-col gap-3">
                {[
                  'Manage assigned classes and sections',
                  'Publish learning materials and video',
                  'Create assignments and timed examinations',
                  'AI-assisted grading with rubric breakdowns',
                  'Attendance and class analytics',
                  'AI teacher copilot for planning and drafting',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-6 rounded-xl border bg-card p-8">
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-lg bg-amber-accent/15 text-amber-accent-strong">
                  <GraduationCap className="size-5" aria-hidden="true" />
                </span>
                <div className="flex flex-col">
                  <span className="afi-eyebrow">For students</span>
                  <h3 className="font-heading text-lg font-semibold">The learning environment</h3>
                </div>
              </div>
              <ul className="flex flex-col gap-3">
                {[
                  'AI Classroom tuned to your own courses',
                  'Learning materials and video library',
                  'Practice centre with adaptive difficulty',
                  'Assignments and timed examinations',
                  'Personalised recommendations and revision',
                  'Progress, mastery and achievements',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-accent"
                      aria-hidden="true"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Container>
      </PublicSection>

      {/* ══ Disciplines ═══════════════════════════════════════════════════ */}
      <PublicSection label="Disciplines" tone="muted">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            <SectionHeading
              eyebrow="Disciplines"
              title="From first principles to applied practice."
              description="AFI supports whatever a member institution teaches. These are examples of departments already on the platform — not a fixed list and not a limit. Every institution builds its own academic structure, subjects and courses."
            />

            <div>
              <ul className="flex flex-wrap gap-2.5">
                {DISCIPLINES.map((domain) => (
                  <li
                    key={domain}
                    className="rounded-full border bg-card px-4 py-2 text-sm font-medium"
                  >
                    {domain}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  A school, a university, a polytechnic and a corporate training academy all work
                  differently. The platform adapts to each — departments, programmes, academic
                  years, classes, sections, subjects and courses are all optional layers.
                </p>
                <SectionCta href="/education">Explore what institutions teach</SectionCta>
              </div>
            </div>
          </div>
        </Container>
      </PublicSection>

      {/* ══ Events & announcements ════════════════════════════════════════ */}
      <PublicSection label="Events and announcements">
        <Container>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5 rounded-xl border p-8">
              <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CalendarDays className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="font-heading text-lg font-semibold">Events</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Conferences, workshops, competitions, exhibitions and student programmes across
                  the federation. The events programme opens as the network grows.
                </p>
              </div>
              <SectionCta href="/events">View events</SectionCta>
            </div>

            <div className="flex flex-col gap-5 rounded-xl border p-8">
              <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Megaphone className="size-5" aria-hidden="true" />
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="font-heading text-lg font-semibold">Announcements</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Federation notices, platform updates and guidance for member institutions,
                  published as they are issued.
                </p>
              </div>
              <SectionCta href="/announcements">Read announcements</SectionCta>
            </div>
          </div>
        </Container>
      </PublicSection>

      {/* ══ Registration ══════════════════════════════════════════════════ */}
      <PublicSection label="Join the network" tone="muted">
        <Container>
          <SectionHeading
            eyebrow="Join the federation"
            title="Bring your institution into the AFI network."
            description="Registration is a reviewed process. Every applicant is verified by AFI headquarters before joining, which is what makes membership mean something."
            align="center"
          />

          <ol className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { icon: FileCheck2, title: 'Apply', body: 'Complete the institution application.' },
              {
                icon: BookOpen,
                title: 'Submit documents',
                body: 'Upload verification documents securely.',
              },
              {
                icon: Compass,
                title: 'HQ review',
                body: 'AFI headquarters verifies your institution.',
              },
              {
                icon: Award,
                title: 'Approval',
                body: 'Your institution is admitted to the network.',
              },
              { icon: Building2, title: 'Portal access', body: 'Onboard your staff and learners.' },
            ].map((step, index) => (
              <li key={step.title} className="flex flex-col gap-3 rounded-lg border bg-card p-6">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <step.icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground/40">0{index + 1}</span>
                </div>
                <h3 className="font-heading text-sm font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg">
              <Link href="/apply">
                Register institution
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/application-status">Track application</Link>
            </Button>
          </div>

          <p className="mx-auto mt-6 max-w-xl text-center text-sm text-muted-foreground">
            After submitting, you receive an application reference. Track progress at any time using
            that reference together with the email address on the application.
          </p>
        </Container>
      </PublicSection>

      {/* ══ Final CTA ═════════════════════════════════════════════════════ */}
      <PublicSection label="Get started" tone="dark" className="py-24 sm:py-28">
        <Container className="relative">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-7 text-center">
            <PlayCircle className="size-9 text-aero-300" aria-hidden="true" />
            <h2 className="font-heading text-3xl leading-[1.1] font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Build the future of learning with AFI.
            </h2>
            <p className="max-w-xl text-lg text-white/60">
              Join a national network built for institutions that take teaching seriously —
              whatever they teach.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="bg-white text-navy-900 hover:bg-white/90">
                <Link href="/apply">
                  Register institution
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/25 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/login">Access portal</Link>
              </Button>
            </div>
          </div>
        </Container>
      </PublicSection>
    </>
  )
}
