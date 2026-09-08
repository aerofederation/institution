import Link from 'next/link'
import { notFound } from 'next/navigation'

import { BarChart3, CheckSquare, Eye, Table2 } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { AssessmentBuilder } from '@/components/teacher/assessment-builder'
import { DuplicateAssessmentButton } from '@/components/teacher/builder-tools'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { listBankItems } from '@/services/assessments/bank'
import { getAssessment, validateForPublish } from '@/services/assessments/builder'
import { getPublishTargets } from '@/services/teacher/overview'

export const metadata = { title: 'Assessment' }

export default async function AssessmentBuilderPage({
  params,
}: PageProps<'/teacher/assessments/[id]'>) {
  const { id } = await params

  /*
   * Scoped to the acting teacher. Another teacher's paper is indistinguishable
   * from one that does not exist — which is what keeps an answer key from being
   * reachable by guessing an id.
   */
  const detail = await getAssessment(id)
  if (!detail) notFound()

  const [checks, bank, targets] = await Promise.all([
    validateForPublish(id),
    // Only what fits on one page of the picker — the bank can be large, and a
    // dialog is not the place to ship two thousand rows.
    listBankItems({ page: 1 }),
    getPublishTargets(),
  ])
  const live = detail.assessment.status !== 'DRAFT' && detail.assessment.status !== 'ARCHIVED'

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={`${humaniseEnum(detail.assessment.kind)} · ${detail.assessment.classes?.name ?? ''}`}
        title={detail.assessment.title}
        description={
          detail.assessment.duration_minutes
            ? `${detail.assessment.duration_minutes} minutes · ${detail.assessment.max_attempts} attempt${detail.assessment.max_attempts === 1 ? '' : 's'}`
            : `No time limit · ${detail.assessment.max_attempts} attempt${detail.assessment.max_attempts === 1 ? '' : 's'}`
        }
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: detail.assessment.title },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/teacher/assessments/${id}/preview`}>
                <Eye className="size-4" aria-hidden="true" />
                Preview
              </Link>
            </Button>
            <DuplicateAssessmentButton assessmentId={id} />
            {live ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/teacher/assessments/${id}/grading`}>
                    <CheckSquare className="size-4" aria-hidden="true" />
                    Grading
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/teacher/assessments/${id}/results`}>
                    <Table2 className="size-4" aria-hidden="true" />
                    Results
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/teacher/assessments/${id}/analytics`}>
                    <BarChart3 className="size-4" aria-hidden="true" />
                    Analytics
                  </Link>
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <AssessmentBuilder
        detail={detail}
        checks={checks}
        bankItems={bank.rows}
        targets={targets}
      />
    </div>
  )
}
