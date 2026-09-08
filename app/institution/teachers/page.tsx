import { Users } from 'lucide-react'

import { MemberActions } from '@/components/institution/member-actions'
import { TeacherForm } from '@/components/institution/teacher-form'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { USER_STATUSES, toOptions } from '@/lib/constants/enums'
import { listDepartments } from '@/services/academics'
import { listTeachers, type TeacherRow } from '@/services/teachers'

export const metadata = { title: 'Teachers' }

const PAGE_SIZE = 25

const columns: Column<TeacherRow>[] = [
  {
    id: 'name',
    header: 'Teacher',
    primary: true,
    cell: (row) => (
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-medium">{row.profiles?.full_name ?? '—'}</span>
        <span className="text-muted-foreground truncate text-xs">{row.profiles?.email ?? '—'}</span>
      </div>
    ),
  },
  {
    id: 'employee_id',
    header: 'Staff number',
    cell: (row) => <span className="font-mono text-xs">{row.employee_id}</span>,
  },
  {
    id: 'department',
    header: 'Department',
    hideBelow: 'md',
    cell: (row) => row.departments?.name ?? <span className="text-muted-foreground">—</span>,
  },
  {
    id: 'specialization',
    header: 'Specialisation',
    hideBelow: 'lg',
    cell: (row) => row.specialization ?? <span className="text-muted-foreground">—</span>,
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
        name={row.profiles?.full_name ?? row.employee_id}
        kind="teacher"
        status={row.status}
      />
    ),
  },
]

export default async function TeachersPage({ searchParams }: PageProps<'/institution/teachers'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const [{ rows, total }, departments] = await Promise.all([
    listTeachers({
      search: read('q'),
      status: read('status'),
      departmentId: read('department'),
      page,
    }),
    listDepartments(),
  ])

  const filtered = Boolean(read('q') || read('status') || read('department'))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Teachers"
        description="Teaching staff at your institution. Each account is created without a password — the teacher sets their own from the invitation link."
        breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Teachers' }]}
        actions={
          <TeacherForm
            departments={departments.map((department) => ({
              id: department.id,
              name: department.name,
              code: department.code,
            }))}
          />
        }
      />

      <FilterBar>
        <SearchInput placeholder="Search name, email or staff number" label="Search teachers" />
        <FilterSelect
          paramName="status"
          label="Status"
          options={toOptions(USER_STATUSES)}
          allLabel="Any status"
        />
        {departments.length > 0 ? (
          <FilterSelect
            paramName="department"
            label="Department"
            options={departments.map((department) => ({
              value: department.id,
              label: department.name,
            }))}
            allLabel="All departments"
          />
        ) : null}
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? 'No teachers match those filters' : 'No teachers yet'}
          description={
            filtered
              ? 'Clear the filters to see everyone on staff.'
              : 'Add your first teacher. They receive an email with a single-use link to set their own password and sign in.'
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.profile_id}
            getRowHref={(row) => `/institution/teachers/${row.profile_id}`}
            caption={`${total} teacher${total === 1 ? '' : 's'}`}
          />
          <TablePagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            basePath="/institution/teachers"
            baseParams={{
              q: read('q'),
              status: read('status'),
              department: read('department'),
            }}
          />
        </>
      )}
    </div>
  )
}
