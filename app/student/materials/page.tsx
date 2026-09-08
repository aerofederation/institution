import Link from 'next/link'

import { BookOpen, ExternalLink, FileText, Link2, NotebookPen, Sparkles } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { DownloadMaterialButton } from '@/components/student/student-actions'
import { Button } from '@/components/ui/button'
import { listMaterialsForStudent } from '@/services/learning'

export const metadata = { title: 'Study materials' }

const ICONS = { DOCUMENT: FileText, LINK: Link2, NOTE: NotebookPen } as const

export default async function StudentMaterialsPage() {
  const materials = await listMaterialsForStudent()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Study materials"
        description="Everything your teachers have published to your class and section."
        breadcrumbs={[{ label: 'Learning', href: '/student' }, { label: 'Study materials' }]}
      />

      {materials.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nothing published yet"
          description="Material your teachers publish to your class appears here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {materials.map((material) => {
            const Icon = ICONS[material.material_type as keyof typeof ICONS] ?? FileText

            return (
              <li key={material.id} className="bg-card flex flex-col gap-3 rounded-lg border p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium">{material.title}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {material.teachers?.profiles?.full_name ?? 'Your teacher'}
                      {material.subjects?.name ? ` · ${material.subjects.name}` : ''}
                      {material.classes?.name ? ` · ${material.classes.name}` : ''}
                    </span>
                  </div>
                </div>

                {material.description ? (
                  <p className="text-sm whitespace-pre-wrap">{material.description}</p>
                ) : null}

                {material.material_type === 'DOCUMENT' && material.file_name ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {/* A PDF is read in the page. Everything else a browser
                        cannot render still has to be opened outside it. */}
                    {material.mime_type === 'application/pdf' ? (
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/student/materials/${material.id}/read`}>
                          <BookOpen className="size-4" aria-hidden="true" />
                          Read
                        </Link>
                      </Button>
                    ) : null}
                    <DownloadMaterialButton
                      materialId={material.id}
                      fileName={material.file_name}
                    />
                  </div>
                ) : null}

                {material.material_type === 'LINK' && material.external_url ? (
                  <a
                    href={material.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex w-fit items-center gap-1.5 text-sm hover:underline"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Open the link
                  </a>
                ) : null}

                {/* Summary, key points and practice questions built from this
                    material. Made once and shared with the class. */}
                <Button asChild variant="outline" size="sm" className="w-fit">
                  <Link href={`/student/materials/${material.id}/study`}>
                    <Sparkles className="size-4" aria-hidden="true" />
                    Study aid
                  </Link>
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
