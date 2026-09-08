import Link from 'next/link'

import { BarChart3 } from 'lucide-react'

import { AreaTrend, BarSeries, ChartCard } from '@/components/charts/afi-charts'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { ComingSoon, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { getHqAnalytics } from '@/services/hq/analytics'

export const metadata = { title: 'Analytics' }

/**
 * Federation analytics.
 *
 * Every series is derived from `created_at` on real rows. Where the underlying
 * engines do not exist yet — attendance, assignments, examinations — the page
 * says so instead of drawing an empty axis and implying the feature is broken.
 */
export default async function HqAnalyticsPage() {
  const analytics = await getHqAnalytics(12)

  if (analytics.isEmpty) {
    return (
      <>
        <PageHeader
          eyebrow="Intelligence"
          title="Analytics"
          description="Growth, composition and activity across the federation."
          breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Analytics' }]}
        />
        <EmptyState
          icon={BarChart3}
          title="Nothing to measure yet"
          description="Analytics are computed from real institutions, applications and people. Charts appear as soon as the federation has data — no sample figures are shown here."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/hq/applications">Review applications</Link>
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description="Growth, composition and activity across the federation, over the last 12 months."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Analytics' }]}
      />

      <StatGrid>
        <StatCard label="Institutions" value={analytics.totals.institutions} />
        <StatCard label="Applications" value={analytics.totals.applications} />
        <StatCard
          label="Teachers added · 12 mo"
          value={analytics.totals.teachers}
          hint="Provisioned in the window"
        />
        <StatCard
          label="Students added · 12 mo"
          value={analytics.totals.students}
          hint="Enrolled in the window"
        />
      </StatGrid>

      <Section title="Network growth">
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Institutions joined"
            description="New institutions approved each month."
            footer="Counted from institutions.created_at."
          >
            <AreaTrend data={analytics.institutionGrowth} valueLabel="institutions" />
          </ChartCard>

          <ChartCard
            title="Network size"
            description="Cumulative institutions in the federation."
            footer="Running total, including institutions that joined before this window."
          >
            <AreaTrend
              data={analytics.institutionCumulative}
              valueLabel="institutions"
              colorIndex={2}
            />
          </ChartCard>

          <ChartCard
            title="Teachers provisioned"
            description="New teacher accounts created each month."
          >
            <AreaTrend data={analytics.teacherGrowth} valueLabel="teachers" colorIndex={5} />
          </ChartCard>

          <ChartCard
            title="Students enrolled"
            description="New student accounts created each month."
          >
            <AreaTrend data={analytics.studentGrowth} valueLabel="students" colorIndex={2} />
          </ChartCard>
        </div>
      </Section>

      <Section title="Applications">
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard title="Application volume" description="Applications received each month.">
            <AreaTrend data={analytics.applicationTrend} valueLabel="applications" colorIndex={4} />
          </ChartCard>

          <ChartCard
            title="Application outcomes"
            description="Current state of every application on record."
          >
            {analytics.applicationOutcomes.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No applications on record.
              </p>
            ) : (
              <BarSeries
                data={analytics.applicationOutcomes}
                valueLabel="applications"
                colorIndex={4}
                horizontal
              />
            )}
          </ChartCard>
        </div>
      </Section>

      <Section title="Composition">
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title="Institutions by type"
            description="How the network breaks down across institution categories."
          >
            {analytics.byType.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No institutions yet.
              </p>
            ) : (
              <BarSeries data={analytics.byType} valueLabel="institutions" horizontal />
            )}
          </ChartCard>

          <ChartCard
            title="Institutions by status"
            description="Active, pending and suspended institutions."
          >
            {analytics.byStatus.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No institutions yet.
              </p>
            ) : (
              <BarSeries
                data={analytics.byStatus}
                valueLabel="institutions"
                colorIndex={3}
                horizontal
              />
            )}
          </ChartCard>
        </div>
      </Section>

      <Section title="Academic activity">
        <ComingSoon
          title="Attendance, assignments and examination analytics"
          description="These series need the attendance, assignment and examination engines, which are built in later phases. Rather than plotting an empty axis, this section stays explicit about what does not exist yet."
          phase="Phases 14–15, 19"
          icon={BarChart3}
        />
      </Section>
    </>
  )
}
