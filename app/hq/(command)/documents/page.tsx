import { FileText } from 'lucide-react'

import { formatDate } from '@/components/hq/activity-timeline'
import { DocumentActions } from '@/components/hq/document-actions'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import {
  DOCUMENT_TYPES,
  VERIFICATION_STATUSES,
  humaniseEnum,
  toOptions,
} from '@/lib/constants/enums'
import { listDocuments, type DocumentRow } from '@/services/hq/directory'

export const metadata = { title: 'Document centre' }

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const columns: Column<DocumentRow>[] = [
  {
    id: 'file',
    header: 'Document',
    primary: true,
    cell: (row) => <span className="font-medium">{row.file_name}</span>,
  },
  {
    id: 'type',
    header: 'Type',
    secondary: true,
    cell: (row) => <span className="text-sm">{humaniseEnum(row.document_type)}</span>,
  },
  {
    id: 'size',
    header: 'Size',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="afi-metric text-sm text-muted-foreground">{fileSize(row.file_size)}</span>
    ),
  },
  {
    id: 'uploaded',
    header: 'Uploaded',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.created_at)}</span>
    ),
  },
  {
    id: 'reviewed',
    header: 'Reviewed',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="text-sm text-muted-foreground">
        {row.reviewed_at ? formatDate(row.reviewed_at) : '—'}
      </span>
    ),
  },
  {
    id: 'status',
    header: 'Verification',
    cell: (row) => <StatusBadge status={row.verification_status} size="sm" />,
  },
  {
    id: 'actions',
    header: 'Actions',
    action: true,
    cell: (row) => (
      <DocumentActions
        documentId={row.id}
        fileName={row.file_name}
        status={row.verification_status}
      />
    ),
  },
]

/**
 * Verification documents across the federation.
 *
 * The table shows metadata only. Binaries live in a private Supabase Storage
 * bucket and are opened through a short-lived signed URL minted on the server
 * after an authorisation check — `storage_path` is never rendered into the page
 * and no bucket is public.
 */
export default async function HqDocumentsPage({ searchParams }: PageProps<'/hq/documents'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const status = read('status')
  const type = read('type')
  const institutionId = read('institution')

  const result = await listDocuments({ page, q, status, type, institutionId })
  const filtered = Boolean(q || status || type || institutionId)

  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Document centre"
        description="Verification documents submitted by institutions. Files are stored privately and opened through short-lived signed links."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Documents' }]}
      />

      <FilterBar>
        <SearchInput placeholder="Search by file name…" label="Search documents" />
        <FilterSelect
          paramName="status"
          label="Filter by verification status"
          allLabel="All statuses"
          options={toOptions(VERIFICATION_STATUSES)}
        />
        <FilterSelect
          paramName="type"
          label="Filter by document type"
          allLabel="All types"
          options={toOptions(DOCUMENT_TYPES)}
        />
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={filtered ? 'No documents match those filters' : 'No documents submitted yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see every document.'
              : 'Verification documents uploaded with institution applications appear here for review.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Institution verification documents"
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/documents"
            baseParams={{ q, status, type, institution: institutionId }}
          />
        </div>
      )}
    </>
  )
}
