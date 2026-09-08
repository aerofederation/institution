import Link from 'next/link'

import { Building2 } from 'lucide-react'

import { formatDate } from '@/components/hq/activity-timeline'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  INSTITUTION_STATUSES,
  INSTITUTION_TYPES,
  humaniseEnum,
  toOptions,
} from '@/lib/constants/enums'
import {
  countMembersByInstitution,
  listInstitutions,
  type InstitutionRow,
} from '@/services/hq/directory'

export const metadata = { title: 'Institutions' }

type Row = InstitutionRow & { teachers: number; students: number }

const columns: Column<Row>[] = [
  {
    id: 'name',
    header: 'Institution',
    primary: true,
    cell: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    id: 'type',
    header: 'Type',
    secondary: true,
    cell: (row) => <span className="text-sm">{humaniseEnum(row.institution_type)}</span>,
  },
  {
    id: 'location',
    header: 'Location',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {[row.city, row.state, row.country].filter(Boolean).join(', ') || '—'}
      </span>
    ),
  },
  {
    id: 'teachers',
    header: 'Teachers',
    hideBelow: 'xl',
    className: 'text-right',
    cell: (row) => <span className="afi-metric text-sm">{row.teachers}</span>,
  },
  {
    id: 'students',
    header: 'Students',
    hideBelow: 'xl',
    className: 'text-right',
    cell: (row) => <span className="afi-metric text-sm">{row.students}</span>,
  },
  {
    id: 'joined',
    header: 'Joined',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(row.approved_at ?? row.created_at)}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    cell: (row) => <StatusBadge status={row.status} size="sm" />,
  },
  {
    id: 'actions',
    header: 'Actions',
    action: true,
    cell: (row) => (
      <Button asChild size="sm" variant="outline">
        <Link href={`/hq/institutions/${row.id}`}>Inspect</Link>
      </Button>
    ),
  },
]

export default async function HqInstitutionsPage({ searchParams }: PageProps<'/hq/institutions'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const status = read('status')
  const type = read('type')

  const result = await listInstitutions({ page, q, status, type })

  // One grouped pass for the whole page of rows, rather than two queries per
  // institution.
  const members = await countMembersByInstitution(result.rows.map((row) => row.id))
  const rows: Row[] = result.rows.map((row) => ({
    ...row,
    teachers: members.get(row.id)?.teachers ?? 0,
    students: members.get(row.id)?.students ?? 0,
  }))

  const filtered = Boolean(q || status || type)

  return (
    <>
      <PageHeader
        eyebrow="Network"
        title="Institutions"
        description="Every institution registered in the Aero Federation of India network."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Institutions' }]}
      />

      <FilterBar>
        <SearchInput placeholder="Search by name, slug or city…" label="Search institutions" />
        <FilterSelect
          paramName="status"
          label="Filter by status"
          allLabel="All statuses"
          options={toOptions(INSTITUTION_STATUSES)}
        />
        <FilterSelect
          paramName="type"
          label="Filter by type"
          allLabel="All types"
          options={toOptions(INSTITUTION_TYPES)}
        />
      </FilterBar>

      {rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={filtered ? 'No institutions match those filters' : 'No institutions yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see the whole network.'
              : 'An institution joins the network when HQ approves its application. Approved institutions appear here.'
          }
          action={
            filtered ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href="/hq/applications">Review applications</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Institutions registered in the federation"
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/hq/institutions/${row.id}`}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/institutions"
            baseParams={{ q, status, type }}
          />
        </div>
      )}
    </>
  )
}
