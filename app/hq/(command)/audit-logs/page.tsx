import { ScrollText, ShieldCheck } from 'lucide-react'

import { humaniseAction } from '@/components/hq/activity-timeline'
import { DataTable, TablePagination, type Column } from '@/components/shared/data-table'
import { FilterBar, FilterSelect, SearchInput } from '@/components/shared/filter-bar'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { ROLE_CODES_LIST, toOptions } from '@/lib/constants/enums'
import { listAuditActions, listAuditLogs, type AuditRow } from '@/services/hq/directory'

export const metadata = { title: 'Audit centre' }

const columns: Column<AuditRow>[] = [
  {
    id: 'action',
    header: 'Action',
    primary: true,
    cell: (row) => <span className="font-medium">{humaniseAction(row.action)}</span>,
  },
  {
    id: 'actor',
    header: 'Actor',
    secondary: true,
    cell: (row) => (
      <span className="text-sm">
        {row.actor_email ?? <span className="text-muted-foreground">System</span>}
      </span>
    ),
  },
  {
    id: 'role',
    header: 'Role',
    hideBelow: 'lg',
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground">{row.actor_role ?? '—'}</span>
    ),
  },
  {
    id: 'entity',
    header: 'Entity',
    hideBelow: 'lg',
    cell: (row) => <span className="font-mono text-xs">{row.entity_type}</span>,
  },
  {
    id: 'entity_id',
    header: 'Entity ID',
    hideBelow: 'xl',
    cell: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.entity_id ? `${row.entity_id.slice(0, 8)}…` : '—'}
      </span>
    ),
  },
  {
    id: 'timestamp',
    header: 'Timestamp',
    cell: (row) => (
      <time
        dateTime={row.created_at}
        className="font-mono text-xs whitespace-nowrap text-muted-foreground"
      >
        {new Date(row.created_at).toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </time>
    ),
  },
]

/**
 * The audit centre.
 *
 * `audit_logs` has INSERT and SELECT policies and deliberately no UPDATE or
 * DELETE policy for any role, so the record is append-only at the database
 * level rather than by convention. There is no edit or delete control on this
 * page because there is no way to build one.
 */
export default async function HqAuditPage({ searchParams }: PageProps<'/hq/audit-logs'>) {
  const params = await searchParams
  const read = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : undefined
  }

  const page = Number(read('page') ?? '1') || 1
  const q = read('q')
  const actorRole = read('status')
  const actionFilter = read('action')
  const institutionId = read('institution')
  const from = read('from')
  const to = read('to')

  const [result, actions] = await Promise.all([
    listAuditLogs({
      page,
      q,
      status: actorRole,
      action: actionFilter,
      institutionId,
      from,
      to,
    }),
    listAuditActions(),
  ])

  const filtered = Boolean(q || actorRole || actionFilter || institutionId || from || to)

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Audit centre"
        description="Append-only record of security-relevant actions across the federation."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Audit centre' }]}
      />

      <div className="flex items-center gap-2.5 rounded-lg border border-success/25 bg-success/5 px-4 py-3">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          This log cannot be edited or deleted through the platform — the database grants no UPDATE
          or DELETE policy on it to any role, including HQ.
        </p>
      </div>

      <FilterBar>
        <SearchInput placeholder="Search action or actor…" label="Search the audit log" />
        <FilterSelect
          paramName="action"
          label="Filter by action"
          allLabel="All actions"
          options={actions.map((action) => ({ value: action, label: humaniseAction(action) }))}
        />
        <FilterSelect
          paramName="status"
          label="Filter by actor role"
          allLabel="All roles"
          options={toOptions(ROLE_CODES_LIST)}
        />
      </FilterBar>

      {result.rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? 'No entries match those filters' : 'No audited events yet'}
          description={
            filtered
              ? 'Try a broader search, or clear the filters to see the whole record.'
              : 'Sign-ins, application decisions, provisioning and administrative changes are recorded here as they happen.'
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <DataTable
            caption="Federation audit log"
            columns={columns}
            rows={result.rows}
            getRowKey={(row) => row.id}
          />
          <TablePagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            basePath="/hq/audit-logs"
            baseParams={{
              q,
              status: actorRole,
              action: actionFilter,
              institution: institutionId,
              from,
              to,
            }}
          />
        </div>
      )}
    </>
  )
}
