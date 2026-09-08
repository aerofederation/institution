import { notFound } from 'next/navigation'

import { FileText } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { MaterialReader } from '@/components/shared/material-reader'
import { StatusBadge } from '@/components/shared/status-badge'
import { getOwnMaterial } from '@/services/teaching/materials'

export const metadata = { title: 'Reading' }

/**
 * The same reader the students get.
 *
 * Deliberately the same component: a teacher checking that a handout uploaded
 * correctly should be looking at what the class will look at, not at a
 * different viewer that might render it differently.
 */
export default async function TeacherReadMaterialPage({
  params,
}: PageProps<'/teacher/materials/[id]/read'>) {
  const { id } = await params

  const material = await getOwnMaterial(id)
  if (!material) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={material.subjects?.name ?? undefined}
        title={material.title}
        description={material.classes?.name ?? undefined}
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Study materials', href: '/teacher/materials' },
          { label: 'Reading' },
        ]}
        actions={<StatusBadge status={material.is_published ? 'PUBLISHED' : 'DRAFT'} />}
      />

      {material.mime_type === 'application/pdf' && material.file_name ? (
        <MaterialReader materialId={id} fileName={material.file_name} />
      ) : (
        <EmptyState
          icon={FileText}
          title="This one cannot be read here"
          description={
            material.file_name
              ? `${material.file_name} is not a PDF, so a browser cannot display it in the page.`
              : 'There is no document attached to this material yet.'
          }
        />
      )}
    </div>
  )
}
