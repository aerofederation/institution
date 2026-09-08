import { BookMarked, CalendarDays, GraduationCap, Layers, Network, Rows3 } from 'lucide-react'

import {
  AcademicYearDialog,
  ClassDialog,
  DepartmentDialog,
  ProgramDialog,
  SectionDialog,
  SubjectDialog,
} from '@/components/institution/academics-forms'
import { PageHeader, Section } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { getAcademicOptions } from '@/services/academics'

export const metadata = { title: 'Academic structure' }

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * The institution's academic structure, on one page.
 *
 * Five related record types that are set up together and rarely revisited.
 * Splitting them across five routes would turn a single sitting into five
 * navigations, and each list is short enough that they coexist comfortably.
 *
 * The order is the order of dependency: years before classes because a class
 * belongs to one, classes before sections because a section belongs to a class.
 */
export default async function AcademicsPage() {
  const { departments, years, programs, classes, sections, subjects } = await getAcademicOptions()

  const classNameById = new Map(classes.map((klass) => [klass.id, klass.name]))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Academic structure"
        description="Departments, academic years, programmes, classes and sections. Teachers and students are assigned to these, so they are worth setting up first."
        breadcrumbs={[
          { label: 'Institution', href: '/institution' },
          { label: 'Academic structure' },
        ]}
      />

      <Section
        title="Academic years"
        description="Classes belong to an academic year. One year may be marked current, and new classes default to it."
        actions={<AcademicYearDialog />}
      >
        {years.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No academic years"
            description="Add a year before creating classes — a class cannot exist without one."
            action={<AcademicYearDialog />}
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {years.map((year) => (
              <li key={year.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{year.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {formatDate(year.starts_on)} — {formatDate(year.ends_on)}
                  </span>
                </div>
                {year.is_current ? (
                  <span className="border-primary/30 text-primary shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                    Current
                  </span>
                ) : null}
                <StatusBadge status={year.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Departments"
        description="Teachers, programmes and classes are organised by department."
        actions={<DepartmentDialog />}
      >
        {departments.length === 0 ? (
          <EmptyState
            icon={Network}
            title="No departments"
            description="Add the departments your institution teaches through."
            action={<DepartmentDialog />}
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {departments.map((department) => (
              <li key={department.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]">
                  {department.code}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{department.name}</span>
                  {department.description ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {department.description}
                    </span>
                  ) : null}
                </div>
                <StatusBadge status={department.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Programmes"
        description="Courses of study students are enrolled onto."
        actions={<ProgramDialog departments={departments} />}
      >
        {programs.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No programmes"
            description="Add the programmes students can be enrolled onto, such as B.Tech Aerospace."
            action={<ProgramDialog departments={departments} />}
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {programs.map((program) => (
              <li key={program.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="bg-muted shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px]">
                  {program.code}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{program.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {program.departments?.name ?? 'No department'}
                    {program.level ? ` · ${program.level}` : ''}
                    {program.duration_months ? ` · ${program.duration_months} months` : ''}
                  </span>
                </div>
                <StatusBadge status={program.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Classes"
        description="Cohorts within an academic year. Students are placed into a class, and optionally a section."
        actions={
          years.length > 0 ? (
            <ClassDialog years={years} programs={programs} departments={departments} />
          ) : null
        }
      >
        {classes.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No classes"
            description={
              years.length === 0
                ? 'Create an academic year first — a class belongs to one.'
                : 'Add the classes students are placed into.'
            }
            action={
              years.length > 0 ? (
                <ClassDialog years={years} programs={programs} departments={departments} />
              ) : (
                <AcademicYearDialog />
              )
            }
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {classes.map((klass) => (
              <li key={klass.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{klass.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {klass.academic_years?.name ?? '—'}
                    {klass.programs?.name ? ` · ${klass.programs.name}` : ''}
                    {klass.capacity ? ` · capacity ${klass.capacity}` : ''}
                  </span>
                </div>
                <StatusBadge status={klass.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Sections"
        description="Divisions within a class, such as A and B."
        actions={classes.length > 0 ? <SectionDialog classes={classes} /> : null}
      >
        {sections.length === 0 ? (
          <EmptyState
            icon={Rows3}
            title="No sections"
            description={
              classes.length === 0
                ? 'Create a class first — a section belongs to one.'
                : 'Sections are optional. Add them if your classes are divided.'
            }
            action={classes.length > 0 ? <SectionDialog classes={classes} /> : null}
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {sections.map((section) => (
              <li key={section.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{section.name}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {section.classes?.name ?? classNameById.get(section.class_id) ?? '—'}
                    {section.capacity ? ` · capacity ${section.capacity}` : ''}
                  </span>
                </div>
                <StatusBadge status={section.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Subjects"
        description="What this institution teaches. Teachers choose from these when setting a paper or publishing material, so a subject added here appears in their dropdowns straight away."
        actions={<SubjectDialog departments={departments} />}
      >
        {subjects.length === 0 ? (
          <EmptyState
            icon={BookMarked}
            title="No subjects"
            description="Until a subject exists, the Subject field on a teacher's assessment and material forms offers nothing to choose."
            action={<SubjectDialog departments={departments} />}
          />
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {subjects.map((subject) => (
              <li key={subject.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{subject.name}</span>
                    <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                      {subject.code}
                    </span>
                    {subject.is_elective ? (
                      <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[10px]">
                        Elective
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {subject.departments?.name ?? 'No department'}
                    {subject.credits !== null ? ` · ${subject.credits} credits` : ''}
                  </span>
                </div>
                <StatusBadge status={subject.status} size="sm" />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
