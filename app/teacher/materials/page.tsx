import Link from 'next/link'

import { BookOpen, ExternalLink, FileText, Link2, NotebookPen } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { MaterialActions } from '@/components/teacher/content-actions'
import { MaterialForm } from '@/components/teacher/content-forms'
import { getPublishTargets } from '@/services/teacher/overview'
import { listOwnMaterials } from '@/services/teaching/materials'

export const metadata = { title: 'Study materials' }

const ICONS = { DOCUMENT: FileText, LINK: Link2, NOTE: NotebookPen } as const

function formatSize(bytes: number | null) {
  if (!bytes) return null
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function TeacherMaterialsPage() {
  const [materials, options] = await Promise.all([listOwnMaterials(), getPublishTargets()])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Study materials"
        description="Yours alone. Other teachers cannot see or edit what you publish here, and you cannot see theirs."
        breadcrumbs={[{ label: 'Teaching', href: '/teacher' }, { label: 'Study materials' }]}
        actions={<MaterialForm options={options} />}
      />

      {options.targets.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No classes assigned"
          description="Study material is published to a class. Ask your institution administrator to assign you to one."
        />
      ) : materials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No material yet"
          description="Add a file, a link or a written note. It stays a draft until you publish it to the class."
        />
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {materials.map((material) => {
            const Icon = ICONS[material.material_type as keyof typeof ICONS] ?? FileText
            const size = formatSize(material.file_size)

            return (
              <li key={material.id} className="flex flex-wrap items-center gap-3 p-4">
                <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" aria-hidden="true" />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{material.title}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {material.classes?.name ?? '—'}
                    {material.sections?.name ? ` · ${material.sections.name}` : ' · whole class'}
                    {material.subjects?.name ? ` · ${material.subjects.name}` : ''}
                    {material.file_name ? ` · ${material.file_name}` : ''}
                    {size ? ` (${size})` : ''}
                  </span>
                </div>

                {material.material_type === 'LINK' && material.external_url ? (
                  <a
                    href={material.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Open the link for ${material.title}`}
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                ) : null}

                {/*
                  A document with no file attached cannot be published — the
                  CHECK constraint refuses it — so the state is shown rather
                  than letting the teacher discover it at the last step.
                */}
                {material.material_type === 'DOCUMENT' && !material.storage_path ? (
                  <span className="border-warning/40 text-warning shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                    No file yet
                  </span>
                ) : material.is_published ? (
                  <span className="border-success/40 text-success shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                    Published
                  </span>
                ) : (
                  <span className="text-muted-foreground shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                    Draft
                  </span>
                )}

                {/* The same reader the class gets, so a teacher checking an
                    upload sees exactly what the students will see. */}
                {material.mime_type === 'application/pdf' && material.storage_path ? (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/teacher/materials/${material.id}/read`}>
                      <BookOpen className="size-4" aria-hidden="true" />
                      Read
                    </Link>
                  </Button>
                ) : null}

                <MaterialActions
                  materialId={material.id}
                  title={material.title}
                  published={material.is_published}
                  hasFile={Boolean(material.storage_path)}
                  isDocument={material.material_type === 'DOCUMENT'}
                />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
