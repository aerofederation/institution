import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Clock, Eye } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { QuestionImage } from '@/components/teacher/question-media'
import { Button } from '@/components/ui/button'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAssessment } from '@/services/assessments/builder'

export const metadata = { title: 'Preview' }

/**
 * The paper as a student would meet it.
 *
 * Rendered from the teacher's own data and written to nothing — no attempt row,
 * no answers, no timer. That is a hard requirement rather than an optimisation:
 * a preview that created an attempt would consume one of the student's allowed
 * attempts, appear in the results table as a submission from the teacher, and
 * skew every figure on the analytics page.
 *
 * Correct answers are shown, marked as such. This is the teacher's own screen —
 * the point of a preview is to check the paper, which includes checking the key.
 */
export default async function PreviewPage({ params }: PageProps<'/teacher/assessments/[id]/preview'>) {
  const { id } = await params

  const detail = await getAssessment(id)
  if (!detail) notFound()

  const { assessment, sections, questions } = detail
  const total = questions.reduce((sum, question) => sum + Number(question.marks), 0)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Preview"
        title={assessment.title}
        description="Exactly what a student sees, without creating an attempt. Nothing on this page is saved."
        breadcrumbs={[
          { label: 'Teaching', href: '/teacher' },
          { label: 'Assessments', href: '/teacher/assessments' },
          { label: assessment.title, href: `/teacher/assessments/${id}` },
          { label: 'Preview' },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/teacher/assessments/${id}`}>Back to builder</Link>
          </Button>
        }
      />

      <div className="border-primary/30 bg-primary/5 flex items-start gap-3 rounded-lg border p-4">
        <Eye className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="text-sm">
          This is a preview. No attempt is created, no timer runs, and nothing you do here is
          recorded against you or the class.
        </p>
      </div>

      <div className="bg-card flex flex-wrap items-center gap-4 rounded-lg border p-5">
        <span className="flex items-center gap-2 text-sm">
          <Clock className="text-muted-foreground size-4" aria-hidden="true" />
          {assessment.duration_minutes ? `${assessment.duration_minutes} minutes` : 'No time limit'}
        </span>
        <span className="text-muted-foreground text-sm">
          {questions.length} question{questions.length === 1 ? '' : 's'} · {total} marks
        </span>
        {assessment.pass_marks !== null ? (
          <span className="text-muted-foreground text-sm">Pass mark {assessment.pass_marks}</span>
        ) : null}
        {assessment.negative_marking ? (
          <span className="border-warning/50 text-warning rounded-full border px-2 py-0.5 text-[11px]">
            Negative marking
          </span>
        ) : null}
      </div>

      {assessment.instructions ? (
        <div className="bg-muted/40 rounded-lg border p-5">
          <h2 className="mb-2 text-sm font-medium">Instructions</h2>
          <p className="text-sm whitespace-pre-wrap">{assessment.instructions}</p>
        </div>
      ) : null}

      {questions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This paper has no questions yet, so there is nothing to preview.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {questions.map((question, index) => {
            const section = sections.find((item) => item.id === question.section_id)

            return (
              <li key={question.id} className="bg-card flex flex-col gap-3 rounded-lg border p-5">
                {section ? (
                  <span className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
                    {section.title}
                  </span>
                ) : null}

                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {question.passage ? (
                      <p className="bg-muted/40 mb-2 rounded-md border p-3 text-sm whitespace-pre-wrap">
                        {question.passage}
                      </p>
                    ) : null}
                    <span className="font-medium">{question.prompt}</span>
                    <span className="text-muted-foreground text-xs">
                      {humaniseEnum(question.question_type)} · {question.marks} mark
                      {Number(question.marks) === 1 ? '' : 's'}
                      {assessment.negative_marking && Number(question.negative_marks) > 0
                        ? ` · −${question.negative_marks} if wrong`
                        : ''}
                    </span>
                  </div>
                </div>

                {question.media_path ? (
                  <div className="pl-9">
                    <QuestionImage questionId={question.id} />
                  </div>
                ) : null}

                {question.assessment_options.length > 0 ? (
                  <ul className="flex flex-col gap-2 pl-9">
                    {[...question.assessment_options]
                      .sort((a, b) => a.position - b.position)
                      .map((option) => (
                        <li
                          key={option.id}
                          className={`rounded-md border p-3 text-sm ${
                            option.is_correct ? 'border-success/40 bg-success/5' : ''
                          }`}
                        >
                          {option.label}
                          {option.match_label ? (
                            <span className="text-muted-foreground"> → {option.match_label}</span>
                          ) : null}
                          {option.is_correct ? (
                            <span className="text-success ml-2 text-xs">correct</span>
                          ) : null}
                        </li>
                      ))}
                  </ul>
                ) : null}

                {question.question_type === 'NUMERICAL' ? (
                  <p className="text-muted-foreground pl-9 text-sm">
                    Expects {question.numeric_answer}
                    {question.numeric_tolerance ? ` ± ${question.numeric_tolerance}` : ''}
                    {question.numeric_unit ? ` ${question.numeric_unit}` : ''}
                  </p>
                ) : null}

                {question.accepted_answers.length > 0 ? (
                  <p className="text-muted-foreground pl-9 text-sm">
                    Accepts: {question.accepted_answers.join(' · ')}
                  </p>
                ) : null}

                {['LONG_ANSWER', 'CASE_STUDY', 'SHORT_ANSWER'].includes(question.question_type) &&
                question.accepted_answers.length === 0 ? (
                  <p className="text-muted-foreground pl-9 text-sm italic">
                    A free-text box. You mark this one.
                  </p>
                ) : null}

                {question.question_type === 'FILE_UPLOAD' ? (
                  <p className="text-muted-foreground pl-9 text-sm italic">
                    An upload box. You mark this one.
                  </p>
                ) : null}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
