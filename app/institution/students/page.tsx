import { GraduationCap } from 'lucide-react'

import { MemberActions } from '@/components/institution/member-actions'
import { StudentForm } from '@/components/institution/student-form'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { USER_STATUSES, toOptions } from '@/lib/constants/enums'
import { getAcademicOptions } from '@/services/academics'
import { listStudents, type StudentRow } from '@/services/students'

export const metadata = { title: 'Students' }

const PAGE_SIZE = 25

const columns: Column<StudentRow>[] = [
  {
    id: 'name',
    header: 'Student',
    primary: true,
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{row.profiles?.full_name ?? '—'}</span>
        <span className="text-muted-foreground truncate text-xs">{row.profiles?.email ?? '—'}</span>
      </div>
    ),
  },
  {
    id: 'student_code',
    header: 'Roll number',
    cell: (row) => <span className="font-mono text-xs">{row.student_code}</span>,
  },
  {
    id: 'class',
    header: 'Class',
    hideBelow: 'md',
    cell: (row) =>
      row.classes?.name ? (
        <span>
          {row.classes.name}
          {row.sections?.name ? (
            <span className="text-muted-foreground"> · {row.sections.name}</span>
          ) : null}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    id: 'program',
    header: 'Programme',
    hideBelow: 'lg',
    cell: (row) => row.programs?.name ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'status',
    header: 'Status',
    secondary: true,
    cell: (row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    id: 'actions',
    header: '',
    action: true,
    cell: (row) => (
      <MemberActions
        profileId={row.profile_id}
        name={row.profiles?.full_name ?? row.student_code}
        kind="student"
        status={row.status}
      />
    ),
  },
]

export default async function StudentsPage({ searchParams }: PageProps<'/institution/students'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const [{ rows, total }, options] = await Promise.all([
    listStudents({
      search: read('q'),
      status: read('status'),
      classId: read('class'),
      programId: read('program'),
      page,
    }),
    getAcademicOptions(),
  ])

  const filtered = Boolean(read('q') || read('status') || read('class') || read('program'))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description="Enrolled students. Each account is created without a password — the student sets their own from the invitation link."
        breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Students' }]}
        actions={<StudentForm options={options} />}
      />

      <FilterBar>
        <SearchInput placeholder="Search name, email or roll number" label="Search students" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={toOptions(USER_STATUSES)}
          allLabel="Any status"
        />
        {options.classes.length > 0 ? (
          <FilterSelect
            paramName="class"
            label="Class"
            options={options.classes.map((klass) => ({ value: klass.id, label: klass.name }))}
            allLabel="All classes"
          />
        ) : null}
        {options.programs.length > 0 ? (
          <FilterSelect
            paramName="program"
            label="Programme"
            options={options.programs.map((program) => ({
              value: program.id,
              label: program.name,
            }))}
            allLabel="All programmes"
          />
        ) : null}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={filtered ? 'No students match those filters' : 'No students enrolled yet'}
          description={
            filtered
              ? 'Clear the filters to see everyone enrolled.'
              : 'Enrol your first student. They receive an email with a single-use link to set their own password and sign in.'
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.profile_id}
            getRowHref={(row) => `/institution/students/${row.profile_id}`}
            caption={`${total} student${total === 1 ? '' : 's'}`}
          />
          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/institution/students"
            baseParams={{
              q: read('q'),
              status: read('status'),
              class: read('class'),
              program: read('program'),
            }}
          />
        </>
      )}
    </div>
  )
}
