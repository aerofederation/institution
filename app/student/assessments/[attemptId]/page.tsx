import Link from 'next/link'
import { notFound } from 'next/navigation'

import { CheckCircle2, Circle, Clock, XCircle } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { AttemptRunner } from '@/components/student/attempt-runner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAttemptResult, getPaper } from '@/services/learning/attempt'

export const metadata = { title: 'Attempt' }

/**
 * One route, two states: sitting the paper, and reading the result.
 *
 * Which one renders is decided by the attempt's status in the database, never by
 * a query parameter — `student_get_result()` refuses an attempt that is still
 * IN_PROGRESS, so a student cannot ask to see a result they have not earned.
 */
export default async function AttemptPage({
  params,
}: PageProps<'/student/assessments/[attemptId]'>) {
  const { attemptId } = await params

  const paper = await getPaper(attemptId)
  if (!paper) notFound()

  if (paper.status === 'IN_PROGRESS') {
    return (
      <div className="flex flex-col gap-5">
        {/*
          Minimal chrome while a paper is live: title, instructions, and then the
          paper. Everything else is a distraction during a timed test.
        */}
        <div className="flex flex-col gap-1">
          <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
            {humaniseEnum(paper.kind)} · attempt {paper.attempt_no}
          </span>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{paper.title}</h1>
        </div>

        {paper.instructions ? (
          <p className="bg-muted/40 rounded-lg border p-4 text-sm whitespace-pre-wrap">
            {paper.instructions}
          </p>
        ) : null}

        <AttemptRunner paper={paper} />
      </div>
    )
  }

  const result = await getAttemptResult(attemptId)
  if (!result) notFound()

  // Not released yet: the student is told that, and nothing else. The score is
  // not in the payload at all — see `student_get_result()`.
  if (!result.released) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <PageHeader
          eyebrow={humaniseEnum(result.kind)}
          title={result.title}
          description="Submitted."
          breadcrumbs={[
            { label: 'Learning', href: '/student' },
            { label: 'Quizzes & tests', href: '/student/assessments' },
            { label: result.title },
          ]}
        />

        <div className="border-primary/30 bg-primary/5 flex items-start gap-3 rounded-lg border p-5">
          <Clock className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Your result is not available yet</p>
            <p className="text-muted-foreground text-sm">
              {result.awaiting_marking
                ? 'Some answers need your teacher to read them. Your result appears once that is done.'
                : result.release_policy === 'MANUAL'
                  ? 'Your teacher will release results when they are ready.'
                  : result.release_policy === 'AFTER_CLOSE'
                    ? 'Results become available after this paper closes.'
                    : 'Your result will appear shortly.'}
            </p>
          </div>
        </div>

        <Button asChild variant="outline" size="sm" className="w-fit">
          <Link href="/student/assessments">Back to all</Link>
        </Button>
      </div>
    )
  }

  const passed = result.passed

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        eyebrow={humaniseEnum(result.kind)}
        title={result.title}
        description="Your result."
        breadcrumbs={[
          { label: 'Learning', href: '/student' },
          { label: 'Quizzes & tests', href: '/student/assessments' },
          { label: result.title },
        ]}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/student/assessments">Back to all</Link>
          </Button>
        }
      />

      <div
        className={cn(
          'flex flex-wrap items-center gap-4 rounded-lg border p-6',
          passed === false ? 'border-destructive/40 bg-destructive/5' : 'border-success/40 bg-success/5',
        )}
      >
        <div className="flex flex-col gap-1">
          <span className="font-heading text-3xl font-semibold">
            {result.score ?? '—'}{' '}
            <span className="text-muted-foreground text-lg">/ {result.max_score}</span>
          </span>
          <span className="text-muted-foreground text-sm">
            {result.percentage}%
            {result.pass_marks !== null && result.pass_marks !== undefined
              ? ` · pass mark ${result.pass_marks}`
              : ''}
          </span>
        </div>

        {passed !== null && passed !== undefined ? (
          <span
            className={cn(
              'ml-auto rounded-full border px-3 py-1 text-sm font-medium',
              passed ? 'border-success/40 text-success' : 'border-destructive/40 text-destructive',
            )}
          >
            {passed ? 'Passed' : 'Not passed'}
          </span>
        ) : null}
      </div>

      {result.is_late && (result.penalty_applied ?? 0) > 0 ? (
        <p className="border-warning/40 bg-warning/5 rounded-lg border p-4 text-sm">
          This was submitted after the deadline, so a late penalty of{' '}
          {result.penalty_applied} marks was applied.
        </p>
      ) : null}

      {result.reveal_answers && (result.questions?.length ?? 0) > 0 ? (
        <Section title="Your answers">
          <ol className="flex flex-col gap-3">
            {result.questions!.map((question, index) => (
              <li key={question.id} className="bg-card flex flex-col gap-3 rounded-lg border p-5">
                <div className="flex items-start gap-3">
                  <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium">{question.prompt}</span>
                    <span className="text-muted-foreground text-xs">
                      {question.marks_awarded} of {question.marks} mark
                      {Number(question.marks) === 1 ? '' : 's'}
                    </span>
                  </div>

                  {question.is_correct === true ? (
                    <CheckCircle2 className="text-success size-5 shrink-0" aria-label="Correct" />
                  ) : question.is_correct === false ? (
                    <XCircle className="text-destructive size-5 shrink-0" aria-label="Incorrect" />
                  ) : (
                    <span className="text-muted-foreground shrink-0 text-xs">Not marked</span>
                  )}
                </div>

                {question.text_answer ? (
                  <p className="bg-muted/40 ml-9 rounded-md border p-3 text-sm whitespace-pre-wrap">
                    {question.text_answer}
                  </p>
                ) : null}

                {question.options.length > 0 ? (
                  <ul className="flex flex-col gap-1.5 pl-9">
                    {question.options.map((option) => {
                      const chose = question.selected_option_ids.includes(option.id)
                      return (
                        <li key={option.id} className="flex items-center gap-2 text-sm">
                          {option.is_correct ? (
                            <CheckCircle2
                              className="text-success size-4 shrink-0"
                              aria-label="Correct answer"
                            />
                          ) : (
                            <Circle
                              className="text-muted-foreground/40 size-4 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className={cn(
                              option.is_correct && 'font-medium',
                              !option.is_correct && chose && 'text-destructive line-through',
                            )}
                          >
                            {option.label}
                          </span>
                          {chose ? (
                            <span className="text-muted-foreground text-xs">· you chose this</span>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}

                {question.feedback ? (
                  <p className="border-primary/25 bg-primary/5 ml-9 rounded-md border p-3 text-sm">
                    <span className="font-medium">Your teacher: </span>
                    {question.feedback}
                  </p>
                ) : null}

                {question.explanation ? (
                  <p className="bg-muted/40 ml-9 rounded-md border p-3 text-sm">
                    {question.explanation}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your teacher has chosen not to reveal the answers for this paper.
        </p>
      )}
    </div>
  )
}
