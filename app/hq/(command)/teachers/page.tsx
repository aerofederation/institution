import Link from 'next/link'

import { Users } from 'lucide-react'

import { formatDate, relativeTime } from '@/components/hq/activity-timeline'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { USER_STATUSES, toOptions } from '@/lib/constants/enums'
import { listTeachers, type TeacherRow } from '@/services/hq/directory'

export const metadata = { title: 'Teachers' }

const columns: Column<TeacherRow>[] = [
  {
    id: 'name',
    header: 'Teacher',
    primary: true,
    cell: (row) => (
      <span className="font-medium">{row.profiles?.full_name ?? 'Pending activation'}</span>
    ),
  },
  {
    id: 'institution',
    header: 'Institution',
    secondary: true,
    cell: (row) => <span className="text-sm">{row.institutions?.name ?? '—'}</span>,
  },
  {
    id: 'employee',
    header: 'Employee ID',
    hideBelow: 'lg',
    cell: (row) => <span className="font-mono text-xs">{row.employee_id}</span>,
  },
  {
    id: 'department',
    header: 'Department',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{row.departments?.name ?? '—'}</span>
    ),
  },
  {
    id: 'activity',
    header: 'Last active',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.profiles?.last_login_at ? relativeTime(row.profiles.last_login_at) : 'Never signed in'}
      </span>
    ),
  },
  {
    id: 'created',
    header: 'Added',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.created_at)}</span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge status={row.status} size="sm" />,
  },
]

export default async function HqTeachersPage({ searchParams }: PageProps<'/hq/teachers'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const status = read('status')
  const institutionId = read('institution')

  const result = await listTeachers({ page, q, status, institutionId })
  const filtered = Boolean(q || status || institutionId)

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Teachers"
        description="Educators provisioned by institutions across the federation."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Teachers' }]}
      />

      <FilterBar>
        <SearchInput placeholder="Search by employee ID…" label="Search teachers" />
        <FilterSelect
          paramName="status"
          label="Filter by account status"
          allLabel="All statuses"
          options={toOptions(USER_STATUSES)}
        />
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtered ? 'No teachers match those filters' : 'No teachers yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see every teacher.'
              : 'Teachers are provisioned by institution administrators. They appear here once an institution begins onboarding staff.'
          }
          action={
            filtered ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href="/hq/institutions">View institutions</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Teachers across the federation"
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.profile_id}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/teachers"
            baseParams={{ q, status, institution: institutionId }}
          />
        </div>
      )}
    </>
  )
}
