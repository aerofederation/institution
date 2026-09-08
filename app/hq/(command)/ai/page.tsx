import { Brain, Cpu, LineChart, Sparkles } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { ComingSoon } from '@/components/shared/states'

export const metadata = { title: 'AI intelligence' }

/**
 * AI intelligence.
 *
 * Deliberately empty of numbers. The tables this surface reads — `ai_usage`,
 * `ai_insights`, `ai_conversations` — arrive with the AI Classroom in a later
 * phase. Inventing request counts, or showing speculative "insights" with no
 * data underneath them, would be worse than showing nothing: an administrator
 * cannot tell a fabricated trend from a real one. So the page states what it
 * will report and what it is waiting on.
 */
const PLANNED = [
  {
    icon: Cpu,
    title: 'Usage and cost',
    body: 'Requests, tokens and estimated cost by institution, role and feature — recorded on every AI call, whether it succeeds or fails.',
  },
  {
    icon: Sparkles,
    title: 'Adoption',
    body: 'Which institutions and roles are actually using AI tools, and which features they reach for.',
  },
  {
    icon: LineChart,
    title: 'Institution intelligence',
    body: 'Engagement and academic trends, each presented with the metrics it was drawn from, its reasoning, and a confidence indicator.',
  },
]

export default function HqAiPage() {
  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="AI intelligence"
        description="Federation-wide AI adoption, usage and institutional insight."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'AI intelligence' }]}
      />

      <ComingSoon
        title="Not yet connected to real analytics"
        description="This surface reports AI requests, active AI users, usage by institution, usage by role and feature adoption. Those figures come from the ai_usage and ai_insights tables, which are created alongside the AI Classroom. Nothing is shown here until there is something real to report."
        phase="Phases 16–19"
        icon={Brain}
      />

      <Section
        title="What this surface will report"
        description="Planned, and dependent on the AI engine landing first."
      >
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PLANNED.map((entry) => (
            <li key={entry.title} className="flex flex-col gap-2 rounded-lg border bg-card p-5">
              <entry.icon className="size-4 text-muted-foreground" aria-hidden="true" />
              <h3 className="font-heading text-sm font-semibold">{entry.title}</h3>
              <p className="text-sm text-muted-foreground">{entry.body}</p>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          AI insights will never trigger disciplinary action automatically, and every insight will
          carry the data it was drawn from.
        </p>
      </Section>
    </>
  )
}
