'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Check, ChevronLeft, ChevronRight, Download, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import { AiSuggestion } from '@/components/teacher/ai-suggestion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import { getAnswerFileUrl } from '@/services/learning/attempt'
import { gradeAnswer } from '@/services/assessments/grading'
import type { GradingAnswer, GradingAttempt } from '@/services/assessments/grading'

/**
 * Marking one student's paper.
 *
 * Every answer gets a mark box, including ones the engine already decided. A
 * teacher who disagrees with an automatic mark can change it, and
 * `teacher_grade_answer` records a revision if the result had already been
 * released — so an override is possible but never silent.
 *
 * Which answers are *outstanding* is a separate question, and it has one
 * answer: nobody has marked them. That covers both modes — with auto marking
 * on, the written answers remain; with it off, everything does.
 *
 * Marks are entered per question and saved per question. There is no "save all"
 * button, deliberately: a teacher who marks nine of twelve answers and closes
 * the tab has nine marks saved, not none.
 */
export function GradingConsole({
  assessmentId,
  attempts,
  current,
  answers,
}: {
  assessmentId: string
  attempts: GradingAttempt[]
  current: GradingAttempt
  answers: GradingAnswer[]
}) {
  const router = useRouter()
  const index = attempts.findIndex((attempt) => attempt.id === current.id)
  const previous = index > 0 ? attempts[index - 1] : null
  const next = index < attempts.length - 1 ? attempts[index + 1] : null

  const pendingCount = answers.filter(needsMarking).length

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">
            {current.students?.profiles?.full_name ?? 'Student'}
          </span>
          <span className="text-muted-foreground truncate text-xs">
            {current.students?.student_code ?? '—'} · attempt {current.attempt_no} ·{' '}
            {current.score ?? 0} / {current.max_score ?? 0}
            {current.is_late ? ' · late' : ''}
          </span>
        </div>

        <span
          className={cn(
            'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px]',
            pendingCount > 0
              ? 'border-warning/50 text-warning'
              : 'border-success/40 text-success',
          )}
        >
          {pendingCount > 0 ? `${pendingCount} to mark` : 'Fully marked'}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={!previous}
            onClick={() =>
              previous &&
              router.push(`/teacher/assessments/${assessmentId}/grading?attempt=${previous.id}`)
            }
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!next}
            onClick={() =>
              next && router.push(`/teacher/assessments/${assessmentId}/grading?attempt=${next.id}`)
            }
          >
            Next
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {answers.map((answer, position) => (
          <AnswerCard
            key={answer.id}
            answer={answer}
            position={position + 1}
            assessmentId={assessmentId}
          />
        ))}
      </ol>
    </div>
  )
}

/**
 * Does this answer still need a person?
 *
 * The answer is simply "nobody has marked it" — `is_correct === null`. That one
 * rule covers both modes: with auto marking on it leaves the written answers,
 * and with it off it leaves everything. The previous version asked the question
 * type instead, which could not express the off case at all and would have
 * shown a teacher an unmarked multiple-choice question as though it were done.
 */
function needsMarking(answer: GradingAnswer) {
  return answer.is_correct === null
}

function AnswerCard({
  answer,
  position,
  assessmentId,
}: {
  answer: GradingAnswer
  position: number
  assessmentId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  /*
   * The marks box is uncontrolled until a suggestion fills it, at which point
   * this holds the value. The teacher can still overwrite it — filling a box is
   * not the same as awarding a mark, and the save is a separate deliberate act.
   */
  const [filled, setFilled] = useState<number | null>(null)

  const question = answer.assessment_questions
  const maxMarks = Number(question?.marks ?? 0)
  const unmarked = needsMarking(answer)
  /*
   * A marked answer still gets a form, so a teacher can correct a mark they or
   * the engine got wrong — `teacher_grade_answer` records a revision when the
   * result was already released.
   */
  const manual = true

  const submit = (formData: FormData) => {
    setErrors({})
    startTransition(async () => {
      const result = await gradeAnswer({
        answer_id: answer.id,
        assessment_id: assessmentId,
        marks: formData.get('marks'),
        feedback: formData.get('feedback'),
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(
        result.data.awaiting > 0
          ? `Saved — ${result.data.awaiting} answer${result.data.awaiting === 1 ? '' : 's'} left on this paper`
          : result.data.released
            ? 'Saved — this paper is complete and the result is released'
            : 'Saved — this paper is complete',
      )
      router.refresh()
    })
  }

  return (
    <li
      className={cn(
        'bg-card flex flex-col gap-4 rounded-lg border p-5',
        unmarked && 'border-warning/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
          {position}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{question?.prompt ?? 'Question'}</span>
          <span className="text-muted-foreground text-xs">
            {question ? humaniseEnum(question.question_type) : ''} · out of {maxMarks}
          </span>
        </div>

        {answer.is_correct !== null && answer.graded_at === null ? (
          <span
            className={cn(
              'shrink-0 rounded-full border px-2 py-0.5 text-[11px]',
              answer.is_correct
                ? 'border-success/40 text-success'
                : 'border-destructive/40 text-destructive',
            )}
          >
            {answer.is_correct ? 'Correct' : 'Incorrect'} · {answer.marks_awarded}
          </span>
        ) : null}
      </div>

      <div className="bg-muted/40 rounded-md border p-3 text-sm">
        {answer.text_answer ? (
          <p className="whitespace-pre-wrap">{answer.text_answer}</p>
        ) : answer.file_name ? (
          <AnswerFileLink answerId={answer.id} fileName={answer.file_name} />
        ) : Object.keys(answer.answer_payload ?? {}).length > 0 ? (
          <p className="text-muted-foreground font-mono text-xs">
            {JSON.stringify(answer.answer_payload)}
          </p>
        ) : (
          <p className="text-muted-foreground">No answer given.</p>
        )}
      </div>

      {manual ? (
        <form action={submit} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor={`marks-${answer.id}`} className="text-xs font-medium">
                Marks / {maxMarks}
              </Label>
              <Input
                id={`marks-${answer.id}`}
                name="marks"
                type="number"
                min={0}
                max={maxMarks}
                step="0.5"
                {...(filled === null
                  ? {
                      defaultValue:
                        answer.is_correct !== null
                          ? answer.marks_awarded
                          : (answer.suggested_marks ?? ''),
                    }
                  : { value: filled, onChange: (event) => setFilled(Number(event.target.value)) })}
                required
              />
            </div>

            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor={`feedback-${answer.id}`} className="text-xs font-medium">
                Feedback
              </Label>
              <Textarea
                id={`feedback-${answer.id}`}
                name="feedback"
                rows={2}
                defaultValue={answer.feedback ?? ''}
                placeholder="Seen by this student only"
              />
            </div>

            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Saving…' : answer.is_correct === null ? 'Award' : 'Update'}
            </Button>
          </div>

          {/*
            Offered only for the written answers a person has to judge. An
            objective question already has a key, and asking a model to
            second-guess it would be inviting a worse answer than the one the
            teacher already wrote.
          */}
          {['LONG_ANSWER', 'CASE_STUDY', 'SHORT_ANSWER'].includes(
            question?.question_type ?? '',
          ) ? (
            <AiSuggestion
              answerId={answer.id}
              assessmentId={assessmentId}
              maxMarks={maxMarks}
              hasRubric={Boolean(question?.rubric)}
              onUse={(marks) => setFilled(marks)}
            />
          ) : null}

          {answer.suggested_marks !== null && answer.is_correct === null ? (
            /*
             * Auto marking is off for this paper, so nothing was awarded. The
             * engine's arithmetic is offered as a starting point and counts for
             * nothing until this form is submitted.
             */
            <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <Sparkles className="size-3.5" aria-hidden="true" />
              The answer key suggests {answer.suggested_marks} — nothing is awarded until you save.
            </p>
          ) : null}

          {errors.marks?.[0] ? (
            <p className="text-destructive text-xs" role="alert">
              {errors.marks[0]}
            </p>
          ) : null}
        </form>
      ) : null}

      {answer.feedback && !manual ? (
        <p className="text-sm">
          <Check className="text-success mr-1 inline size-3.5" aria-hidden="true" />
          {answer.feedback}
        </p>
      ) : null}
    </li>
  )
}


/**
 * Opens a student's uploaded answer.
 *
 * The path is never rendered. `assessment_answer_file()` returns one only to the
 * student who wrote it or the teacher who owns the paper, and the signed URL it
 * is exchanged for lasts five minutes — so this is a door, not a permanent
 * address.
 */
function AnswerFileLink({ answerId, fileName }: { answerId: string; fileName: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await getAnswerFileUrl(answerId)
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          window.open(result.data.url, '_blank', 'noopener,noreferrer')
        })
      }
    >
      <Download className="size-4" aria-hidden="true" />
      {pending ? 'Preparing…' : fileName}
    </Button>
  )
}
