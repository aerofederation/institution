import Link from 'next/link'
import { notFound } from 'next/navigation'

import { FileText, Sparkles } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { MaterialReader } from '@/components/shared/material-reader'
import { Button } from '@/components/ui/button'
import { getMaterialForStudent } from '@/services/learning'

export const metadata = { title: 'Reading' }

export default async function StudentReadMaterialPage({
  params,
}: PageProps<'/student/materials/[id]/read'>) {
  const { id } = await params

  const material = await getMaterialForStudent(id)
  if (!material) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={material.subjects?.name ?? undefined}
        title={material.title}
        description={
          material.teachers?.profiles?.full_name
            ? `Published by ${material.teachers.profiles.full_name}`
            : undefined
        }
        breadcrumbs={[
          { label: 'Learning', href: '/student' },
          { label: 'Study materials', href: '/student/materials' },
          { label: 'Reading' },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/student/materials/${id}/study`}>
              <Sparkles className="size-4" aria-hidden="true" />
              Study aid
            </Link>
          </Button>
        }
      />

      {material.mime_type === 'application/pdf' && material.file_name ? (
        <MaterialReader materialId={id} fileName={material.file_name} />
      ) : (
        <EmptyState
          icon={FileText}
          title="This one cannot be read here"
          description={
            material.file_name
              ? `${material.file_name} is not a PDF, so your browser cannot display it in the page. Download it from the materials list to open it.`
              : 'There is no document attached to this material.'
          }
        />
      )}
    </div>
  )
}
