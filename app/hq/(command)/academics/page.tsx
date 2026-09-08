import { BarChart3, Building2, GraduationCap, Layers, Network, Users } from 'lucide-react'

import { BarSeries, ChartCard } from '@/components/charts/afi-charts'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatCard, StatGrid } from '@/components/shared/stat-card'
import { ComingSoon } from '@/components/shared/states'
import { getAcademicNetwork } from '@/services/hq/analytics'
import { getHqOverview } from '@/services/hq/overview'

export const metadata = { title: 'Academic network' }

/**
 * The federation's academic structure in aggregate.
 *
 * Counts every level of the hierarchy that institutions have actually defined.
 * Not every institution uses every level — a school may never create a
 * programme, a corporate academy may never create a class — so a zero here is a
 * real answer about how the network is shaped rather than a gap.
 */
export default async function HqAcademicsPage() {
  const [network, overview] = await Promise.all([getAcademicNetwork(), getHqOverview()])

  const structure = [
    { label: 'Departments', value: network.departments },
    { label: 'Programmes', value: network.programs },
    { label: 'Academic years', value: network.academicYears },
    { label: 'Classes', value: network.classes },
    { label: 'Sections', value: network.sections },
    { label: 'Subjects', value: network.subjects },
    { label: 'Courses', value: network.courses },
  ]

  const hasStructure = structure.some((entry) => entry.value > 0)

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Academic network"
        description="The academic hierarchy defined across every institution in the federation."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Academic network' }]}
      />

      <StatGrid>
        <StatCard
          label="Institutions"
          value={network.institutions}
          icon={Building2}
          href="/hq/institutions"
        />
        <StatCard label="Programmes" value={network.programs} icon={Network} />
        <StatCard label="Courses" value={network.courses} icon={Layers} />
        <StatCard label="Active enrolments" value={network.enrolments} icon={GraduationCap} />
      </StatGrid>

      <StatGrid>
        <StatCard label="Departments" value={network.departments} />
        <StatCard label="Classes" value={network.classes} />
        <StatCard label="Sections" value={network.sections} />
        <StatCard label="Subjects" value={network.subjects} />
      </StatGrid>

      <Section
        title="Structure across the federation"
        description="Each institution defines only the levels it needs, so these totals describe how the network is actually organised."
      >
        <ChartCard
          title="Academic hierarchy"
          description="Total records at each level of the academic structure."
          footer="Counted live from the academic tables."
        >
          {hasStructure ? (
            <BarSeries data={structure} valueLabel="records" horizontal height={280} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No academic structure has been defined yet. Institutions build this out after
              onboarding.
            </p>
          )}
        </ChartCard>
      </Section>

      <Section title="People">
        <StatGrid columns={3}>
          <StatCard
            label="Teachers"
            value={overview.people.teachers}
            hint={`${overview.people.activeTeachers.toLocaleString('en-IN')} active`}
            icon={Users}
            href="/hq/teachers"
          />
          <StatCard
            label="Students"
            value={overview.people.students}
            hint={`${overview.people.activeStudents.toLocaleString('en-IN')} active`}
            icon={GraduationCap}
            href="/hq/students"
          />
          <StatCard
            label="Class assignments"
            value={network.teacherClassAssignments}
            hint="Teacher-to-class links"
          />
        </StatGrid>
      </Section>

      <ComingSoon
        title="Curriculum and delivery analytics"
        description="Topic mastery, syllabus coverage and cross-institution curriculum comparison need the academic and assessment engines from later phases."
        phase="Phases 13–15"
        icon={BarChart3}
      />
    </>
  )
}
