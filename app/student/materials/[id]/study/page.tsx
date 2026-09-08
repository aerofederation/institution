import { notFound } from 'next/navigation'

import { PageHeader } from '@/components/shared/page-header'
import { StudyAidPanel } from '@/components/student/study-aid-panel'
import { getStudyAid } from '@/services/ai/study-aid'
import { getMaterialForStudent } from '@/services/learning'

export const metadata = { title: 'Study aid' }

export default async function StudyAidPage({
  params,
}: PageProps<'/student/materials/[id]/study'>) {
  const { id } = await params

  const material = await getMaterialForStudent(id)
  if (!material) notFound()

  const aid = await getStudyAid(id)

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
          { label: 'Study aid' },
        ]}
      />

      <StudyAidPanel materialId={id} materialTitle={material.title} aid={aid} />
    </div>
  )
}
