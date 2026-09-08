import { FileText } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { humaniseEnum } from '@/lib/constants/enums'
import { requireTenant } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Documents' }

/**
 * The institution's own documents.
 *
 * These are the files submitted with the application and carried over at
 * approval, plus anything added since. Only metadata is listed: the objects sit
 * in a private bucket and are reached through a short-lived signed URL, never a
 * public path, so nothing here is a link to a file anyone could guess.
 */
export default async function InstitutionDocumentsPage() {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('institution_documents')
    .select('id, document_type, file_name, file_size, verification_status, rejection_reason, created_at')
    .eq('institution_id', session.institutionId)
    .order('created_at', { ascending: false })

  const rows = documents ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Files submitted with your application and verified by AFI headquarters."
        breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Documents' }]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents"
          description="Documents submitted with your institution's application appear here once it is approved."
        />
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {rows.map((document) => (
            <li key={document.id} className="flex flex-wrap items-center gap-3 p-4">
              <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{document.file_name}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {humaniseEnum(document.document_type)}
                  {document.rejection_reason ? ` · ${document.rejection_reason}` : ''}
                </span>
              </div>
              <StatusBadge status={document.verification_status} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
