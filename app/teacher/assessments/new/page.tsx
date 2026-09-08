import { PageHeader } from '@/components/shared/page-header'
import { AssessmentCreateForm } from '@/components/teacher/assessment-create-form'
import { getPublishTargets } from '@/services/teacher/overview'

export const metadata = { title: 'Create assessment' }

export default async function NewAssessmentPage() {
  const options = await getPublishTargets()

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <PageHeader
        title="Create assessment"
        description="Choose a type to start from. Every setting can be changed afterwards — the type only decides where you begin."
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: 'Create' },
        ]}
      />

      <AssessmentCreateForm options={options} />
    </div>
  )
}
