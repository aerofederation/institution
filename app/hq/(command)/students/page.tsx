import Link from 'next/link'

import { GraduationCap } from 'lucide-react'

import { formatDate, relativeTime } from '@/components/hq/activity-timeline'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { USER_STATUSES, toOptions } from '@/lib/constants/enums'
import { listStudents, type StudentRow } from '@/services/hq/directory'

export const metadata = { title: 'Students' }

/**
 * Federation-wide student directory.
 *
 * Deliberately identity-light. HQ oversees the network, so this shows who is
 * enrolled where and whether their account is usable — not guardian contacts,
 * addresses or academic records, which belong to the institution that holds
 * them. Performance analytics appear in aggregate on the analytics surface
 * rather than per named student here.
 */
const columns: Column<StudentRow>[] = [
  {
    id: 'name',
    header: 'Student',
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
    id: 'code',
    header: 'Student ID',
    hideBelow: 'lg',
    cell: (row) => <span className="font-mono text-xs">{row.student_code}</span>,
  },
  {
    id: 'program',
    header: 'Programme',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{row.programs?.name ?? '—'}</span>
    ),
  },
  {
    id: 'class',
    header: 'Class',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{row.classes?.name ?? '—'}</span>
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
    header: 'Enrolled',
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

export default async function HqStudentsPage({ searchParams }: PageProps<'/hq/students'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const status = read('status')
  const institutionId = read('institution')

  const result = await listStudents({ page, q, status, institutionId })
  const filtered = Boolean(q || status || institutionId)

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Students"
        description="Learners enrolled across the federation. Institution-held personal records stay with the institution."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Students' }]}
      />

      <FilterBar>
        <SearchInput
          placeholder="Search by student ID or admission number…"
          label="Search students"
        />
        <FilterSelect
          paramName="status"
          label="Filter by account status"
          allLabel="All statuses"
          options={toOptions(USER_STATUSES)}
        />
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={filtered ? 'No students match those filters' : 'No students yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see every student.'
              : 'Students are enrolled by their institution. They appear here as institutions onboard their cohorts.'
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
            caption="Students across the federation"
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.profile_id}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/students"
            baseParams={{ q, status, institution: institutionId }}
          />
        </div>
      )}
    </>
  )
}
