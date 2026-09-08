'use client'

import { useEffect, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Clock, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { saveAnswer, submitAttempt, type Paper } from '@/services/learning'

/**
 * Sitting a paper.
 *
 * What is *not* in this component is the point of it. The questions arrive from
 * `student_get_paper()`, which projects option ids and labels and nothing else
 * — `is_correct` is never sent to the browser, so there is no client state, no
 * network response and no React prop anywhere on this screen that a determined
 * student could read the answers out of.
 *
 * The countdown below is likewise a courtesy. The real deadline is
 * `assessment_attempts.expires_at`, checked inside the database on every answer
 * and at submission. Changing the clock, pausing the tab or editing the state
 * here buys nothing.
 */
export function AttemptPaper({ paper }: { paper: Paper }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [answers, setAnswers] = useState<Record<string, { options: string[]; text: string }>>(() =>
    Object.fromEntries(
      paper.questions.map((question) => [
        question.id,
        {
          options: question.answer?.selected_option_ids ?? [],
          text: question.answer?.text_answer ?? '',
        },
      ]),
    ),
  )
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    if (!paper.expires_at) return

    const tick = () => {
      const left = new Date(paper.expires_at!).getTime() - Date.now()
      setRemaining(Math.max(0, Math.floor(left / 1000)))
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [paper.expires_at])

  const persist = (questionId: string, next: { options: string[]; text: string }) => {
    setAnswers((current) => ({ ...current, [questionId]: next }))

    // Saved as they go, so a closed tab does not lose the paper.
    void saveAnswer({
      attempt_id: paper.attempt_id,
      question_id: questionId,
      option_ids: next.options,
      text_answer: next.text || null,
    }).then((result) => {
      if (result.ok && !result.data.saved) {
        toast.warning('This attempt is closed — your latest change was not saved.')
      }
    })
  }

  const choose = (questionId: string, optionId: string, multi: boolean) => {
    const current = answers[questionId] ?? { options: [], text: '' }
    const options = multi
      ? current.options.includes(optionId)
        ? current.options.filter((id) => id !== optionId)
        : [...current.options, optionId]
      : [optionId]

    persist(questionId, { ...current, options })
  }

  const finish = () =>
    startTransition(async () => {
      const result = await submitAttempt({ attempt_id: paper.attempt_id })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(
        result.data.awaitingMarking
          ? 'Submitted — some answers need your teacher to mark them'
          : `Submitted — ${result.data.score} / ${result.data.maxScore}`,
      )
      router.refresh()
    })

  const answered = paper.questions.filter((question) => {
    const answer = answers[question.id]
    return (answer?.options.length ?? 0) > 0 || (answer?.text ?? '').trim().length > 0
  }).length

  const outOfTime = remaining !== null && remaining === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-lg border p-4">
        <span className="text-sm font-medium">
          {answered} of {paper.questions.length} answered
        </span>

        {remaining !== null ? (
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-sm ${
              remaining < 60 ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            <Clock className="size-4" aria-hidden="true" />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </span>
        ) : null}

        <Button
          className="ml-auto"
          size="sm"
          onClick={finish}
          disabled={pending || paper.status !== 'IN_PROGRESS'}
        >
          <Send className="size-4" aria-hidden="true" />
          {pending ? 'Submitting…' : 'Submit paper'}
        </Button>
      </div>

      {outOfTime ? (
        <p className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-4 text-sm">
          Your time is up. Submit now — answers changed after this point are not saved.
        </p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {paper.questions.map((question, index) => {
          const answer = answers[question.id] ?? { options: [], text: '' }
          const multi = question.question_type === 'MULTI_CHOICE'

          return (
            <li key={question.id} className="bg-card flex flex-col gap-4 rounded-lg border p-5">
              <div className="flex items-start gap-3">
                <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{question.prompt}</span>
                  <span className="text-muted-foreground text-xs">
                    {question.marks} mark{Number(question.marks) === 1 ? '' : 's'}
                    {multi ? ' · choose all that apply' : ''}
                  </span>
                </div>
              </div>

              {question.question_type === 'SHORT_ANSWER' ? (
                <Textarea
                  rows={4}
                  value={answer.text}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: { ...answer, text: event.target.value },
                    }))
                  }
                  onBlur={() => persist(question.id, answers[question.id] ?? answer)}
                  placeholder="Type your answer"
                  aria-label={`Answer to question ${index + 1}`}
                />
              ) : (
                <ul className="flex flex-col gap-2 pl-9">
                  {question.options.map((option) => {
                    const selected = answer.options.includes(option.id)
                    return (
                      <li key={option.id}>
                        <label
                          className={`flex cursor-pointer items-center gap-2.5 rounded-md border p-3 text-sm transition-colors ${
                            selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                          }`}
                        >
                          <Checkbox
                            checked={selected}
                            onCheckedChange={() => choose(question.id, option.id, multi)}
                          />
                          {option.label}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
