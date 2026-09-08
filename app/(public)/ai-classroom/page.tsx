import type { Metadata } from 'next'

import {
  Brain,
  ClipboardCheck,
  Compass,
  Layers,
  LineChart,
  MessagesSquare,
  RefreshCw,
  ShieldCheck,
  Target,
} from 'lucide-react'

import {
  Container,
  FeatureCard,
  PublicSection,
  SectionCta,
  SectionHeading,
} from '@/components/public/sections'

export const metadata: Metadata = {
  title: 'AFI AI Classroom',
  description:
    'The AFI AI Classroom supports students with explanations, practice, revision and exam preparation grounded in their own courses and materials — and gives teachers AI tools they review before use.',
  alternates: { canonical: '/ai-classroom' },
  openGraph: { url: '/ai-classroom', title: 'AFI AI Classroom' },
}

const MODES = [
  {
    icon: MessagesSquare,
    name: 'Learn',
    body: 'Concepts explained in depth, at the level the student is actually working at.',
  },
  {
    icon: ClipboardCheck,
    name: 'Practice',
    body: 'Interactive questions with adaptive difficulty.',
  },
  {
    icon: Target,
    name: 'Quiz',
    body: 'Generated quizzes drawn from the student’s own course material.',
  },
  {
    icon: RefreshCw,
    name: 'Revision',
    body: 'Focused revision on the topics where mastery is weakest.',
  },
  {
    icon: Compass,
    name: 'Exam preparation',
    body: 'A preparation plan built from past performance.',
  },
  {
    icon: Brain,
    name: 'Socratic',
    body: 'Guiding questions instead of answers, so the student reasons it through.',
  },
]

export default function AiClassroomPage() {
  return (
    <>
      <PublicSection label="AI Classroom" className="pt-16 sm:pt-20">
        <Container>
          <SectionHeading
            eyebrow="AFI AI Classroom"
            title="An AI that knows what you are studying."
            as="h1"
            description="Not a general chatbot with a syllabus pasted into it. The AI Classroom works within a student's own institution, courses, materials and performance history — so its explanations, questions and revision plans are about the actual course, not a generic approximation of it."
            className="max-w-3xl"
          />
        </Container>
      </PublicSection>

      <PublicSection label="Learning modes" tone="muted">
        <Container>
          <SectionHeading
            eyebrow="Modes"
            title="Different ways to work through a topic"
            description="A student who is stuck needs something different from a student revising the night before an examination."
          />
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((mode) => (
              <li key={mode.name}>
                <FeatureCard icon={mode.icon} title={mode.name} description={mode.body} />
              </li>
            ))}
          </ul>
        </Container>
      </PublicSection>

      <PublicSection label="For teachers">
        <Container>
          <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <SectionHeading
              eyebrow="Teacher copilot"
              title="Tools that save time without taking the decision."
              description="Teachers get help drafting lesson plans, assignments, examinations, questions and rubrics — and analysis of where a class is struggling. Everything generated is a draft until a teacher reviews and publishes it."
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FeatureCard
                icon={Layers}
                title="Drafting"
                description="Lesson plans, assignments, question banks and rubrics, generated as reviewable drafts."
              />
              <FeatureCard
                icon={LineChart}
                title="Class analysis"
                description="Weak topics, students needing attention and suggested remedial focus."
              />
              <FeatureCard
                icon={ClipboardCheck}
                title="Grading assistance"
                description="Rubric-based suggested scores with a breakdown and a confidence indicator."
              />
              <FeatureCard
                icon={Brain}
                title="Always reviewable"
                description="AI proposals and teacher decisions are recorded separately, so the record shows both."
              />
            </div>
          </div>
        </Container>
      </PublicSection>

      <PublicSection label="Safeguards" tone="dark">
        <Container className="relative">
          <SectionHeading
            eyebrow="Safeguards"
            title="Where the AI stops."
            description="An education platform that lets an AI quietly decide academic outcomes is not one institutions should trust. These limits are structural."
            tone="inverted"
          />

          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                title: 'Never finalises a grade',
                body: 'A suggested score is stored separately from the mark a teacher awards. The teacher decides.',
              },
              {
                icon: ShieldCheck,
                title: 'Never publishes unreviewed',
                body: 'Generated assignments and examinations stay drafts until a person publishes them.',
              },
              {
                icon: ShieldCheck,
                title: 'Never crosses institutions',
                body: 'What the AI may read is decided before it is called, and applied as a database filter.',
              },
              {
                icon: ShieldCheck,
                title: 'Never acts on a prediction',
                body: 'Early-warning indicators always show their evidence, and never trigger action by themselves.',
              },
            ].map((item) => (
              <li key={item.title}>
                <FeatureCard
                  tone="inverted"
                  icon={item.icon}
                  title={item.title}
                  description={item.body}
                />
              </li>
            ))}
          </ul>

          <p className="mt-10 max-w-3xl text-sm text-white/45">
            The AI Classroom is delivered in a later phase of the platform build. This page
            describes what it will do and the limits it will operate under — it is not live yet.
          </p>
        </Container>
      </PublicSection>

      <PublicSection label="Next steps">
        <Container>
          <div className="flex flex-col items-start gap-6">
            <SectionHeading
              eyebrow="Get started"
              title="Bring AI-assisted learning to your institution."
            />
            <SectionCta href="/apply">Register your institution</SectionCta>
          </div>
        </Container>
      </PublicSection>
    </>
  )
}
