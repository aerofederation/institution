import Link from 'next/link'

import { FileCheck2 } from 'lucide-react'

import { formatDate } from '@/components/hq/activity-timeline'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import {
  APPLICATION_STATUSES,
  INSTITUTION_TYPES,
  humaniseEnum,
  toOptions,
} from '@/lib/constants/enums'
import { listApplications, type ApplicationRow } from '@/services/hq/directory'

export const metadata = { title: 'Applications' }

const columns: Column<ApplicationRow>[] = [
  {
    id: 'institution',
    header: 'Institution',
    primary: true,
    cell: (row) => <span className="font-medium">{row.institution_name}</span>,
  },
  {
    id: 'ref',
    header: 'Reference',
    secondary: true,
    cell: (row) => <span className="font-mono text-xs">{row.application_ref}</span>,
  },
  {
    id: 'type',
    header: 'Type',
    hideBelow: 'lg',
    cell: (row) => <span className="text-sm">{humaniseEnum(row.institution_type)}</span>,
  },
  {
    id: 'location',
    header: 'Location',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {[row.city, row.state].filter(Boolean).join(', ') || '—'}
      </span>
    ),
  },
  {
    id: 'submitted',
    header: 'Submitted',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {formatDate(row.submitted_at ?? row.created_at)}
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
        <Link href={`/hq/applications/${row.id}`}>Review</Link>
      </Button>
    ),
  },
]

export default async function HqApplicationsPage({ searchParams }: PageProps<'/hq/applications'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const status = read('status')
  const type = read('type')

  const result = await listApplications({ page, q, status, type })
  const filtered = Boolean(q || status || type)

  return (
    <>
      <PageHeader
        eyebrow="Onboarding"
        title="Institution applications"
        description="Every application submitted to the federation, with its current review state."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Applications' }]}
      />

      <FilterBar>
        <SearchInput placeholder="Search name, reference or email…" label="Search applications" />
        <FilterSelect
          paramName="status"
          label="Filter by status"
          allLabel="All statuses"
          options={toOptions(APPLICATION_STATUSES)}
        />
        <FilterSelect
          paramName="type"
          label="Filter by institution type"
          allLabel="All types"
          options={toOptions(INSTITUTION_TYPES)}
        />
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={FileCheck2}
          title={filtered ? 'No applications match those filters' : 'No applications yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see every application.'
              : 'Institutions applying through the public site appear here for HQ review.'
          }
          action={
            filtered ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href="/apply">Open the public application form</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Institution applications across the federation"
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/hq/applications/${row.id}`}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/applications"
            baseParams={{ q, status, type }}
          />
        </div>
      )}
    </>
  )
}
