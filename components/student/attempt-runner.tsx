'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import {
  AlertTriangle,
  Check,
  Clock,
  Flag,
  Loader2,
  Pause,
  Play,
  Send,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { QuestionImage } from '@/components/teacher/question-media'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  attachAnswerFile,
  markForReview,
  pauseAttempt,
  resumeAttempt,
  recordIntegrityEvent,
  requestAnswerUpload,
  saveAttemptAnswer,
  submitAttempt,
  type Paper,
  type PaperQuestion,
} from '@/services/learning/attempt'

type Answer = {
  options: string[]
  text: string
  payload: Record<string, unknown>
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * Sitting a paper.
 *
 * Three things about this component are load-bearing, and all three are about
 * what it does *not* do.
 *
 * It does not hold the answers. `student_get_paper()` projects option ids and
 * labels and nothing else — no `is_correct`, no `accepted_answers`, no
 * `numeric_answer`. There is no prop, no fetch response and no piece of state
 * on this screen that a determined student could read a mark scheme out of.
 *
 * It does not own the clock. The countdown is drawn from `expires_at`, which the
 * server set, corrected by the offset between the server's clock and this
 * browser's. Editing the state, changing the system time or leaving the tab
 * open past zero buys nothing: every save and the submission are re-checked
 * against the database's own `now()`.
 *
 * It does not decide the score. Submitting returns what the engine computed.
 */
export function AttemptRunner({ paper }: { paper: Paper }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      paper.questions.map((question) => [
        question.id,
        {
          options: question.answer?.selected_option_ids ?? [],
          text: question.answer?.text_answer ?? '',
          payload: (question.answer?.answer_payload as Record<string, unknown>) ?? {},
        },
      ]),
    ),
  )

  const [current, setCurrent] = useState(0)
  const [flagged, setFlagged] = useState<string[]>(paper.marked_for_review ?? [])
  const [visited, setVisited] = useState<Set<string>>(new Set([paper.questions[0]?.id]))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  /*
   * Whether the clock is stopped, and the deadline it resumes against. Both
   * start from what the server said and are replaced by what the server says
   * after each pause or resume — the browser never computes either.
   */
  const [pausedAt, setPausedAt] = useState<string | null>(paper.paused_at)
  const [deadline, setDeadline] = useState<string | null>(paper.expires_at)

  /*
   * The gap between this browser's clock and the server's.
   *
   * Measured in an effect rather than during render: reading `Date.now()` while
   * rendering is impure, and React may render more than once. Everything below
   * counts down against the server's idea of time, so a device with the wrong
   * date still shows the right remaining time — and a device whose clock is
   * deliberately wrong gains nothing, because the database re-checks every save
   * and the submission against its own `now()`.
   */
  const clockOffset = useRef(0)
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(() => {
    clockOffset.current = paper.server_now
      ? new Date(paper.server_now).getTime() - Date.now()
      : 0
  }, [paper.server_now])
  const submittedRef = useRef(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const question = paper.questions[current]
  const answeredCount = paper.questions.filter((item) => isAnswered(answers[item.id])).length

  // ── Submission ────────────────────────────────────────────────────────────

  const finish = useCallback(
    (auto: boolean) => {
      // Guarded so a double click, a timer firing during a manual submit, and a
      // retry cannot each score the paper. The database is idempotent too; this
      // simply avoids the round trip.
      if (submittedRef.current) return
      submittedRef.current = true
      setSubmitting(true)

      startTransition(async () => {
        const result = await submitAttempt({ attempt_id: paper.attempt_id })

        if (!result.ok) {
          submittedRef.current = false
          setSubmitting(false)
          toast.error(result.message)
          return
        }

        toast.success(
          result.data.awaitingMarking
            ? 'Submitted — some answers need your teacher to mark them'
            : auto
              ? 'Time up — your paper was submitted automatically'
              : 'Submitted',
        )
        router.refresh()
      })
    },
    [paper.attempt_id, router],
  )

  // ── The countdown ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!deadline) return

    // Paused: the display is frozen and nothing auto-submits. The server is
    // holding the clock, not this interval.
    if (pausedAt) return

    const ends = new Date(deadline).getTime()

    const tick = () => {
      const serverNow = Date.now() + clockOffset.current
      const left = Math.max(0, Math.floor((ends - serverNow) / 1000))
      setRemaining(left)

      // At zero the paper submits itself. The server would refuse a later
      // submission anyway; this makes the outcome immediate and visible.
      if (left === 0) finish(true)
    }

    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline, pausedAt, finish])

  // ── Integrity signals ─────────────────────────────────────────────────────

  useEffect(() => {
    /*
     * What the browser can honestly report: whether this tab was hidden, and
     * whether the window lost focus. Nothing else is collected — no keystrokes,
     * no screenshots, no camera. These are context for a teacher, and they do
     * not prevent anything.
     */
    const onVisibility = () => {
      void recordIntegrityEvent({
        attempt_id: paper.attempt_id,
        event: document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE',
      })
    }
    const onBlur = () => {
      void recordIntegrityEvent({ attempt_id: paper.attempt_id, event: 'WINDOW_BLUR' })
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
    }
  }, [paper.attempt_id])

  // ── Autosave ──────────────────────────────────────────────────────────────

  /**
   * Saves one question, debounced.
   *
   * Debounced per question rather than globally, so typing an essay does not
   * postpone the save of a multiple-choice answer picked a moment earlier. A
   * choice is saved almost at once; text waits until the typing pauses, which
   * is what keeps this from writing on every keystroke.
   */
  const persist = useCallback(
    (questionId: string, next: Answer, delay: number) => {
      clearTimeout(timers.current[questionId])
      setSaveState('saving')

      timers.current[questionId] = setTimeout(async () => {
        const result = await saveAttemptAnswer({
          attempt_id: paper.attempt_id,
          question_id: questionId,
          option_ids: next.options,
          text_answer: next.text || null,
          payload: next.payload,
        })

        if (!result.ok) {
          // A network blip must not look like lost work: the answer is still in
          // state and the next change retries.
          setSaveState('failed')
          return
        }

        if (!result.data.saved) {
          setSaveState('failed')
          if (result.data.reason === 'expired') {
            toast.warning('Your time is up — that change was not saved.')
          }
          return
        }

        setSaveState('saved')
      }, delay)
    },
    [paper.attempt_id],
  )

  const update = useCallback(
    (questionId: string, next: Answer, delay = 600) => {
      setAnswers((current) => ({ ...current, [questionId]: next }))
      persist(questionId, next, delay)
    },
    [persist],
  )

  const goTo = (index: number) => {
    const target = paper.questions[index]
    if (!target) return
    setCurrent(index)
    setVisited((current) => new Set(current).add(target.id))
  }

  const toggleFlag = () => {
    if (!question) return
    const next = flagged.includes(question.id)
      ? flagged.filter((id) => id !== question.id)
      : [...flagged, question.id]

    setFlagged(next)
    void markForReview({ attempt_id: paper.attempt_id, question_ids: next })
  }

  if (!question) return null

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-5">
        {/*
          The bar stays put on every size. On a phone it is the one thing that
          must not scroll away: it carries the clock and the submit button.
        */}
        <div className="bg-background/95 sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-lg border p-3 backdrop-blur">
          <span className="text-sm font-medium">
            Question {current + 1} of {paper.questions.length}
          </span>

          <SaveIndicator state={saveState} />

          {remaining !== null ? (
            <Countdown seconds={remaining} paused={Boolean(pausedAt)} />
          ) : null}

          <div className="ml-auto flex items-center gap-2">
            {paper.allow_pause ? (
              <PauseControl
                attemptId={paper.attempt_id}
                pausedAt={pausedAt}
                disabled={submitting}
                onPaused={(at) => setPausedAt(at)}
                onResumed={(expiresAt) => {
                  // The server decides the new deadline; this only displays it.
                  setDeadline(expiresAt)
                  setPausedAt(null)
                }}
              />
            ) : null}

            <Button size="sm" onClick={() => setConfirming(true)} disabled={submitting}>
              <Send className="size-4" aria-hidden="true" />
              Submit
            </Button>
          </div>
        </div>

        {remaining !== null && remaining <= 60 && remaining > 0 ? (
          <p
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive rounded-lg border p-3 text-sm"
          >
            Less than a minute remaining. Your paper will be submitted automatically at zero.
          </p>
        ) : null}

        {pausedAt ? (
          <div
            role="status"
            className="border-primary/30 bg-primary/5 flex flex-col items-center gap-3 rounded-lg border p-10 text-center"
          >
            <Pause className="text-primary size-8" aria-hidden="true" />
            <p className="font-medium">Paused</p>
            <p className="text-muted-foreground max-w-sm text-sm">
              Your time is not running. The questions are hidden while you are paused and answers
              cannot be saved — resume when you are ready to continue.
            </p>
          </div>
        ) : null}

        <article
          className={cn(
            'bg-card flex flex-col gap-5 rounded-lg border p-5 sm:p-6',
            pausedAt && 'hidden',
          )}
        >
          {question.passage ? (
            <div className="bg-muted/40 rounded-md border p-4 text-sm whitespace-pre-wrap">
              {question.passage}
            </div>
          ) : null}

          <header className="flex items-start gap-3">
            <span className="bg-primary/10 text-primary mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold">
              {current + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="font-medium">{question.prompt}</h2>
              <p className="text-muted-foreground text-xs">
                {question.marks} mark{Number(question.marks) === 1 ? '' : 's'}
                {Number(question.negative_marks) > 0
                  ? ` · −${question.negative_marks} if wrong`
                  : ''}
              </p>
            </div>

            <Button
              variant={flagged.includes(question.id) ? 'default' : 'outline'}
              size="sm"
              onClick={toggleFlag}
              aria-pressed={flagged.includes(question.id)}
            >
              <Flag className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">
                {flagged.includes(question.id) ? 'Flagged' : 'Flag'}
              </span>
            </Button>
          </header>

          {question.media_path ? <QuestionImage questionId={question.id} /> : null}

          <QuestionInput
            question={question}
            answer={answers[question.id] ?? { options: [], text: '', payload: {} }}
            onChange={update}
            attemptId={paper.attempt_id}
            existingFileName={question.answer?.file_name ?? null}
          />
        </article>

        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={() => goTo(current - 1)} disabled={current === 0}>
            Previous
          </Button>
          <Button
            variant="outline"
            onClick={() => goTo(current + 1)}
            disabled={current === paper.questions.length - 1}
          >
            Next
          </Button>
        </div>
      </div>

      <Navigator
        questions={paper.questions}
        answers={answers}
        flagged={flagged}
        visited={visited}
        current={current}
        onSelect={goTo}
      />

      <AlertDialog open={confirming} onOpenChange={(next) => !submitting && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit this paper?</AlertDialogTitle>
            <AlertDialogDescription>
              You have answered {answeredCount} of {paper.questions.length} questions.
              {answeredCount < paper.questions.length
                ? ` ${paper.questions.length - answeredCount} remain unanswered.`
                : ''}{' '}
              Once submitted, answers cannot be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Continue attempt</AlertDialogCancel>
            <Button onClick={() => finish(false)} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit now'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function isAnswered(answer: Answer | undefined) {
  if (!answer) return false
  return (
    answer.options.length > 0 ||
    answer.text.trim().length > 0 ||
    Object.keys(answer.payload ?? {}).length > 0
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null

  const content = {
    saving: { icon: Loader2, label: 'Saving…', className: 'text-muted-foreground animate-spin' },
    saved: { icon: Check, label: 'Saved', className: 'text-success' },
    failed: { icon: WifiOff, label: 'Not saved — will retry', className: 'text-destructive' },
  }[state]

  return (
    // `aria-live` so a screen-reader user hears that their work is safe without
    // having to go looking for the indicator.
    <span
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 text-xs',
        state === 'failed' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <content.icon className={cn('size-3.5', content.className)} aria-hidden="true" />
      {content.label}
    </span>
  )
}

function Countdown({ seconds, paused }: { seconds: number; paused: boolean }) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  // A paused clock is never urgent — it is not running.
  const critical = !paused && seconds <= 60
  const strong = !paused && seconds <= 300
  const warning = !paused && seconds <= 600

  return (
    <span
      // Announced every minute rather than every second: a countdown read aloud
      // continuously would make the paper impossible to sit.
      aria-live={critical ? 'assertive' : 'off'}
      className={cn(
        'flex items-center gap-1.5 font-mono text-sm tabular-nums',
        critical
          ? 'text-destructive font-semibold'
          : strong
            ? 'text-destructive'
            : warning
              ? 'text-warning'
              : 'text-muted-foreground',
      )}
    >
      <Clock className="size-4" aria-hidden="true" />
      <span className="sr-only">{paused ? 'Paused, time remaining: ' : 'Time remaining: '}</span>
      {hours > 0 ? `${String(hours).padStart(2, '0')}:` : ''}
      {String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      {paused ? <span className="text-muted-foreground ml-1 text-xs">paused</span> : null}
    </span>
  )
}

function Navigator({
  questions,
  answers,
  flagged,
  visited,
  current,
  onSelect,
}: {
  questions: PaperQuestion[]
  answers: Record<string, Answer>
  flagged: string[]
  visited: Set<string>
  current: number
  onSelect: (index: number) => void
}) {
  return (
    <nav
      aria-label="Question navigator"
      className="bg-card flex w-full shrink-0 flex-col gap-3 rounded-lg border p-4 lg:sticky lg:top-20 lg:w-56"
    >
      <h2 className="text-sm font-medium">Questions</h2>

      <ol className="flex flex-wrap gap-1.5">
        {questions.map((question, index) => {
          const answered = isAnswered(answers[question.id])
          const isFlagged = flagged.includes(question.id)
          const seen = visited.has(question.id)
          const active = index === current

          const state = isFlagged
            ? 'flagged'
            : answered
              ? 'answered'
              : seen
                ? 'unanswered'
                : 'unvisited'

          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onSelect(index)}
                aria-current={active ? 'true' : undefined}
                // The state is in the label, not only in the colour.
                aria-label={`Question ${index + 1}, ${state}`}
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-md border font-mono text-xs transition-colors',
                  active && 'ring-primary ring-2 ring-offset-1',
                  state === 'answered' && 'border-success/50 bg-success/10 text-success',
                  state === 'flagged' && 'border-warning/60 bg-warning/10 text-warning',
                  state === 'unanswered' && 'border-border text-muted-foreground',
                  state === 'unvisited' && 'border-dashed text-muted-foreground/60',
                )}
              >
                {index + 1}
                {isFlagged ? (
                  <Flag className="absolute -top-1 -right-1 size-3" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>

      <dl className="text-muted-foreground flex flex-col gap-1 border-t pt-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="border-success/50 bg-success/10 size-3 rounded border" aria-hidden="true" />
          <dt>Answered</dt>
          <dd className="ml-auto font-mono">
            {questions.filter((question) => isAnswered(answers[question.id])).length}
          </dd>
        </div>
        <div className="flex items-center gap-2">
          <span className="border-warning/60 bg-warning/10 size-3 rounded border" aria-hidden="true" />
          <dt>Flagged</dt>
          <dd className="ml-auto font-mono">{flagged.length}</dd>
        </div>
        <div className="flex items-center gap-2">
          <span className="size-3 rounded border border-dashed" aria-hidden="true" />
          <dt>Not visited</dt>
          <dd className="ml-auto font-mono">
            {questions.filter((question) => !visited.has(question.id)).length}
          </dd>
        </div>
      </dl>
    </nav>
  )
}

/** The answer control for one question type. */
function QuestionInput({
  question,
  answer,
  onChange,
  attemptId,
  existingFileName,
}: {
  question: PaperQuestion
  answer: Answer
  onChange: (questionId: string, next: Answer, delay?: number) => void
  attemptId: string
  existingFileName: string | null
}) {
  const multi = question.question_type === 'MULTI_CHOICE'

  switch (question.question_type) {
    case 'SINGLE_CHOICE':
    case 'MULTI_CHOICE':
    case 'TRUE_FALSE':
      return (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => {
            const selected = answer.options.includes(option.id)
            return (
              <li key={option.id}>
                <label
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md border p-3.5 text-sm transition-colors',
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                  )}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      onChange(
                        question.id,
                        {
                          ...answer,
                          options: multi
                            ? selected
                              ? answer.options.filter((id) => id !== option.id)
                              : [...answer.options, option.id]
                            : [option.id],
                        },
                        150,
                      )
                    }
                  />
                  {option.label}
                </label>
              </li>
            )
          })}
        </ul>
      )

    case 'NUMERICAL':
      return (
        <div className="flex max-w-xs items-center gap-2">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={answer.text}
            onChange={(event) => onChange(question.id, { ...answer, text: event.target.value })}
            aria-label="Your numerical answer"
            placeholder="Your answer"
          />
        </div>
      )

    case 'FILL_BLANK': {
      const blanks = (answer.payload.blanks as string[] | undefined) ?? []
      const count = question.blank_count || 1

      return (
        <div className="flex flex-col gap-2">
          {Array.from({ length: count }, (_, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">
                Blank {index + 1}
              </span>
              <Input
                value={blanks[index] ?? ''}
                onChange={(event) => {
                  const next = [...blanks]
                  next[index] = event.target.value
                  onChange(question.id, { ...answer, payload: { ...answer.payload, blanks: next } })
                }}
                aria-label={`Answer for blank ${index + 1}`}
              />
            </div>
          ))}
        </div>
      )
    }

    case 'MATCHING': {
      const pairs = (answer.payload.pairs as Record<string, string> | undefined) ?? {}

      return (
        <ul className="flex flex-col gap-2">
          {question.options.map((option) => (
            <li key={option.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
              <span className="min-w-0 flex-1 text-sm">{option.label}</span>
              <label className="sr-only" htmlFor={`match-${option.id}`}>
                Match for {option.label}
              </label>
              <select
                id={`match-${option.id}`}
                value={pairs[option.id] ?? ''}
                onChange={(event) =>
                  onChange(
                    question.id,
                    {
                      ...answer,
                      payload: {
                        ...answer.payload,
                        pairs: { ...pairs, [option.id]: event.target.value },
                      },
                    },
                    150,
                  )
                }
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="">Choose…</option>
                {question.match_targets.map((target) => (
                  <option key={target} value={target}>
                    {target}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )
    }

    case 'ORDERING': {
      const order = (answer.payload.order as string[] | undefined) ?? question.options.map((o) => o.id)

      const move = (index: number, direction: -1 | 1) => {
        const next = [...order]
        const target = index + direction
        if (target < 0 || target >= next.length) return
        ;[next[index], next[target]] = [next[target], next[index]]
        onChange(question.id, { ...answer, payload: { ...answer.payload, order: next } }, 150)
      }

      return (
        <ol className="flex flex-col gap-2">
          {order.map((optionId, index) => {
            const option = question.options.find((item) => item.id === optionId)
            if (!option) return null

            return (
              <li key={optionId} className="flex items-center gap-3 rounded-md border p-3">
                <span className="text-muted-foreground w-6 shrink-0 text-center font-mono text-xs">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 text-sm">{option.label}</span>
                {/* Buttons, not drag handles: reordering must work from a
                    keyboard and be announced to a screen reader. */}
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move ${option.label} up`}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    disabled={index === order.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move ${option.label} down`}
                  >
                    ↓
                  </Button>
                </span>
              </li>
            )
          })}
        </ol>
      )
    }

    case 'FILE_UPLOAD':
      return <FileAnswer question={question} attemptId={attemptId} existing={existingFileName} />

    default:
      return (
        <Textarea
          rows={question.question_type === 'SHORT_ANSWER' ? 3 : 10}
          value={answer.text}
          onChange={(event) => onChange(question.id, { ...answer, text: event.target.value })}
          placeholder="Type your answer"
          aria-label="Your answer"
        />
      )
  }
}


/**
 * Answering with a file.
 *
 * Three steps, and the middle one is the only part the browser does on its own:
 * the server mints a signed URL for exactly one path, the browser PUTs the
 * bytes to it, and the server records the metadata — re-checking the attempt,
 * the clock, the question type, the declared size and the path prefix.
 *
 * A file the server declines is not left looking uploaded. The object may
 * already be in the bucket, but without a metadata row nothing references it
 * and nothing marks it.
 */
function FileAnswer({
  question,
  attemptId,
  existing,
}: {
  question: PaperQuestion
  attemptId: string
  existing: string | null
}) {
  const [uploading, setUploading] = useState(false)
  const [fileName, setFileName] = useState<string | null>(existing)
  const [problem, setProblem] = useState<string | null>(null)

  const limit = question.max_file_bytes
  const accepted = question.allowed_mime_types

  const upload = async (file: File) => {
    setProblem(null)

    // Checked here so an oversized file is refused before it is uploaded; the
    // database checks it again, which is the check that counts.
    if (limit && file.size > limit) {
      setProblem(`That file is ${Math.round(file.size / 1048576)} MB. The limit is ${Math.round(limit / 1048576)} MB.`)
      return
    }
    if (accepted.length > 0 && !accepted.includes(file.type)) {
      setProblem('That file type is not accepted for this question.')
      return
    }

    setUploading(true)

    try {
      const ticket = await requestAnswerUpload({
        attempt_id: attemptId,
        question_id: question.id,
        file_name: file.name,
      })

      if (!ticket.ok) {
        setProblem(ticket.message)
        return
      }

      const put = await fetch(ticket.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'content-type': file.type || 'application/octet-stream' },
      })

      if (!put.ok) {
        setProblem('The upload did not complete. Check your connection and try again.')
        return
      }

      const recorded = await attachAnswerFile({
        attempt_id: attemptId,
        question_id: question.id,
        path: ticket.data.path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || 'application/octet-stream',
      })

      if (!recorded.ok || !recorded.data.saved) {
        setProblem(
          recorded.ok
            ? recorded.data.reason === 'expired'
              ? 'Your time is up, so that file was not attached.'
              : 'That file was not accepted.'
            : recorded.message,
        )
        return
      }

      setFileName(file.name)
      toast.success('File attached')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium">Upload your answer</span>
        <input
          type="file"
          disabled={uploading}
          accept={accepted.length > 0 ? accepted.join(',') : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
          className="file:bg-muted file:text-foreground text-muted-foreground w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-2 file:text-sm"
        />
      </label>

      <p className="text-muted-foreground text-xs">
        {accepted.length > 0 ? `Accepted: ${accepted.join(', ')}. ` : ''}
        {limit ? `Up to ${Math.round(limit / 1048576)} MB.` : ''}
      </p>

      {uploading ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm" aria-live="polite">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Uploading…
        </p>
      ) : null}

      {fileName ? (
        <p className="border-success/40 bg-success/5 flex items-center gap-2 rounded-md border p-3 text-sm">
          <Check className="text-success size-4 shrink-0" aria-hidden="true" />
          Attached: {fileName}
        </p>
      ) : null}

      {problem ? (
        <p className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border p-3 text-sm" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      ) : null}
    </div>
  )
}


/**
 * Stopping and restarting the clock.
 *
 * Every decision is the server's: whether pausing is allowed, how much of the
 * paused time converts into extra, and the ceiling imposed by the paper's own
 * closing time. This button asks and then displays the answer — it never
 * computes a deadline.
 */
function PauseControl({
  attemptId,
  pausedAt,
  disabled,
  onPaused,
  onResumed,
}: {
  attemptId: string
  pausedAt: string | null
  disabled: boolean
  onPaused: (at: string) => void
  onResumed: (expiresAt: string | null) => void
}) {
  const [pending, startTransition] = useTransition()

  const toggle = () =>
    startTransition(async () => {
      if (pausedAt) {
        const result = await resumeAttempt({ attempt_id: attemptId })
        if (!result.ok) {
          toast.error(result.message)
          return
        }
        onResumed(result.data.expiresAt)
        return
      }

      const result = await pauseAttempt({ attempt_id: attemptId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (!result.data.paused) {
        toast.error(
          result.data.reason === 'not_allowed'
            ? 'This paper cannot be paused.'
            : 'That attempt is no longer open.',
        )
        return
      }

      onPaused(new Date().toISOString())
      toast.success('Paused — your time is not running')
    })

  return (
    <Button variant="outline" size="sm" onClick={toggle} disabled={disabled || pending}>
      {pausedAt ? (
        <>
          <Play className="size-4" aria-hidden="true" />
          Resume
        </>
      ) : (
        <>
          <Pause className="size-4" aria-hidden="true" />
          Pause
        </>
      )}
    </Button>
  )
}
