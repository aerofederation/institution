'use client'

import { useRef, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { ArrowDown, ArrowUp, Check, Copy, Pencil, Trash2, TriangleAlert, X } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { BankPickerDialog, SectionDialog } from '@/components/teacher/builder-tools'
import {
  AssessmentDetailsPanel,
  SaveIndicator,
} from '@/components/teacher/assessment-details-panel'
import { QuestionEditor } from '@/components/teacher/question-editor'
import { QuestionMedia } from '@/components/teacher/question-media'
import { useAutosave } from '@/components/teacher/use-autosave'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import {
  deleteQuestion,
  duplicateQuestion,
  moveQuestion,
  publishAssessment,
  setAssessmentStatus,
  updateAssessmentSettings,
  type AssessmentDetail,
  type PublishCheck,
} from '@/services/assessments/builder'
import type { BankItem } from '@/services/assessments/bank'
import type { PublishTargets } from '@/services/teacher/overview'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * The paper as the teacher builds it.
 *
 * Questions, settings and publication in one place, because they are one task:
 * a teacher writing question fourteen should not have to navigate away to check
 * whether the paper is publishable yet. The publish panel therefore shows the
 * same checks the publish button enforces, live, as the paper is written.
 *
 * Everything below is refused server-side once the paper leaves DRAFT. That is
 * not a UI convention — `assertEditable` raises, and the state machine in the
 * database refuses to take a started paper back to draft at all.
 */
export function AssessmentBuilder({
  detail,
  checks,
  bankItems,
  targets,
}: {
  detail: AssessmentDetail
  checks: PublishCheck[]
  bankItems: BankItem[]
  targets: PublishTargets
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const { assessment, sections, questions } = detail

  const editable = assessment.status === 'DRAFT'
  const total = questions.reduce((sum, question) => sum + Number(question.marks), 0)
  const ready = checks.every((check) => check.ok)

  const remove = (questionId: string) =>
    startTransition(async () => {
      const result = await deleteQuestion({
        question_id: questionId,
        assessment_id: assessment.id,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Question removed')
      router.refresh()
    })

  const duplicate = (questionId: string) =>
    startTransition(async () => {
      const result = await duplicateQuestion({
        question_id: questionId,
        assessment_id: assessment.id,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success('Question duplicated')
      router.refresh()
    })

  const move = (questionId: string, direction: 'up' | 'down') =>
    startTransition(async () => {
      const result = await moveQuestion({
        assessment_id: assessment.id,
        question_id: questionId,
        direction,
      })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      router.refresh()
    })

  const publish = () =>
    startTransition(async () => {
      const result = await publishAssessment({ assessment_id: assessment.id })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(
        result.data.notified > 0
          ? `Published — ${result.data.notified} student${result.data.notified === 1 ? '' : 's'} notified`
          : 'Published',
      )
      router.refresh()
    })

  const changeStatus = (status: string, message: string) =>
    startTransition(async () => {
      const result = await setAssessmentStatus({ assessment_id: assessment.id, status })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(message)
      router.refresh()
    })

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-8">
        <AssessmentDetailsPanel
          assessment={assessment}
          targets={targets}
          editable={editable}
        />

        {/* ── Questions ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4" aria-labelledby="questions-heading">
          <div className="flex flex-wrap items-center gap-3">
            <h2 id="questions-heading" className="font-heading text-lg font-semibold">
              Questions
            </h2>
            <span className="text-muted-foreground text-sm">
              {questions.length} question{questions.length === 1 ? '' : 's'} · {total} marks
            </span>

            {editable ? (
              <div className="ml-auto flex flex-wrap gap-2">
                <SectionDialog assessmentId={assessment.id} />
                <BankPickerDialog assessmentId={assessment.id} items={bankItems} />
              </div>
            ) : null}
          </div>

          {questions.length === 0 ? (
            <p className="text-muted-foreground bg-muted/40 rounded-lg border p-5 text-sm">
              No questions yet. Add the first one below — the paper cannot be published until it has
              at least one.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {questions.map((question, index) =>
                editingId === question.id ? (
                  <li key={question.id} className="flex flex-col gap-2">
                    <span className="text-muted-foreground text-xs font-medium">
                      Editing question {index + 1}
                    </span>
                    <QuestionEditor
                      assessmentId={assessment.id}
                      sections={sections}
                      existing={question}
                      onSaved={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                ) : (
                <li key={question.id} className="bg-card flex flex-col gap-3 rounded-lg border p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className="bg-primary/10 text-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold">
                      {index + 1}
                    </span>

                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="font-medium">{question.prompt}</span>
                      <span className="text-muted-foreground text-xs">
                        {humaniseEnum(question.question_type)} · {question.marks} mark
                        {Number(question.marks) === 1 ? '' : 's'}
                        {Number(question.negative_marks) > 0
                          ? ` · −${question.negative_marks} if wrong`
                          : ''}
                        {question.difficulty ? ` · ${humaniseEnum(question.difficulty)}` : ''}
                        {question.topic ? ` · ${question.topic}` : ''}
                      </span>
                    </div>

                    {editable ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {/*
                          Buttons rather than drag handles. Reordering has to work
                          for somebody using a keyboard or a screen reader, and a
                          pair of arrows does that without a parallel code path.
                        */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={pending || index === 0}
                          onClick={() => move(question.id, 'up')}
                          aria-label={`Move question ${index + 1} up`}
                        >
                          <ArrowUp className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={pending || index === questions.length - 1}
                          onClick={() => move(question.id, 'down')}
                          aria-label={`Move question ${index + 1} down`}
                        >
                          <ArrowDown className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={pending}
                          onClick={() => setEditingId(question.id)}
                          aria-label={`Edit question ${index + 1}`}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={pending}
                          onClick={() => duplicate(question.id)}
                          aria-label={`Duplicate question ${index + 1}`}
                        >
                          <Copy className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={pending}
                          onClick={() => remove(question.id)}
                          aria-label={`Delete question ${index + 1}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {question.assessment_options.length > 0 ? (
                    <ul className="flex flex-col gap-1 pl-9">
                      {[...question.assessment_options]
                        .sort((a, b) => a.position - b.position)
                        .map((option) => (
                          <li key={option.id} className="flex items-center gap-2 text-sm">
                            {question.question_type === 'ORDERING' ? (
                              <span className="text-muted-foreground w-4 font-mono text-xs">
                                {option.position + 1}
                              </span>
                            ) : option.is_correct ? (
                              <Check className="text-success size-4 shrink-0" aria-label="Correct" />
                            ) : (
                              <X className="text-muted-foreground/40 size-4 shrink-0" aria-hidden="true" />
                            )}
                            <span className={option.is_correct ? 'font-medium' : undefined}>
                              {option.label}
                              {option.match_label ? (
                                <span className="text-muted-foreground"> → {option.match_label}</span>
                              ) : null}
                            </span>
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  <QuestionMedia
                    questionId={question.id}
                    assessmentId={assessment.id}
                    hasMedia={Boolean(question.media_path)}
                    editable={editable}
                  />

                  {question.question_type === 'NUMERICAL' ? (
                    <p className="text-muted-foreground pl-9 text-sm">
                      Answer {question.numeric_answer}
                      {question.numeric_tolerance ? ` ± ${question.numeric_tolerance}` : ''}
                      {question.numeric_unit ? ` ${question.numeric_unit}` : ''}
                    </p>
                  ) : null}

                  {question.accepted_answers.length > 0 ? (
                    <p className="text-muted-foreground pl-9 text-sm">
                      Accepts: {question.accepted_answers.join(' · ')}
                    </p>
                  ) : null}
                </li>
                ),
              )}
            </ol>
          )}

          {editable ? (
            <QuestionEditor assessmentId={assessment.id} sections={sections} />
          ) : (
            <p className="border-warning/40 bg-warning/5 flex items-start gap-2 rounded-lg border p-4 text-sm">
              <TriangleAlert className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                This paper is {assessment.status.toLowerCase()}, so its questions are fixed. Take it
                back to draft to change them — which is refused once a student has started it,
                because their attempt was marked against this exact paper.
              </span>
            </p>
          )}
        </section>

        {/* ── Settings ──────────────────────────────────────────────────── */}
        <SettingsPanel assessment={assessment} questionCount={questions.length} />
      </div>

      {/* ── Publish ───────────────────────────────────────────────────────── */}
      <aside className="bg-card sticky top-20 flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="font-heading text-base font-semibold">
          {editable ? 'Ready to publish?' : 'Status'}
        </h2>

        <p className="text-muted-foreground text-sm">
          {editable
            ? 'Every line has to pass before this reaches your class.'
            : assessment.status === 'ARCHIVED'
              ? 'Archived, so your class cannot see it. Restore it to a draft and you can publish it again.'
              : `This paper is ${assessment.status.toLowerCase()}.`}
        </p>

        <ul className="flex flex-col gap-2">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2 text-sm">
              {check.ok ? (
                <Check className="text-success mt-0.5 size-4 shrink-0" aria-label="Passed" />
              ) : (
                <X className="text-destructive mt-0.5 size-4 shrink-0" aria-label="Not yet" />
              )}
              <span className="flex min-w-0 flex-col">
                <span className={check.ok ? undefined : 'font-medium'}>{check.label}</span>
                {check.detail ? (
                  <span className="text-muted-foreground text-xs">{check.detail}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 border-t pt-4">
          {editable ? (
            <Button disabled={pending || !ready} onClick={publish}>
              {pending ? 'Publishing…' : 'Publish to class'}
            </Button>
          ) : null}

          {assessment.status === 'PUBLISHED' || assessment.status === 'SCHEDULED' ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus('DRAFT', 'Taken back to draft')}
            >
              Take down to draft
            </Button>
          ) : null}

          {['PUBLISHED', 'ACTIVE', 'SCHEDULED'].includes(assessment.status) ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus('CLOSED', 'Closed to new attempts')}
            >
              Close to new attempts
            </Button>
          ) : null}

          {assessment.status === 'CLOSED' ? (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => changeStatus('GRADING', 'Moved to grading')}
            >
              Move to grading
            </Button>
          ) : null}

          {assessment.status === 'ARCHIVED' ? (
            <Button
              disabled={pending}
              onClick={() => changeStatus('DRAFT', 'Restored — it is a draft again')}
            >
              Restore to draft
            </Button>
          ) : null}

          {assessment.status !== 'ARCHIVED' && assessment.status !== 'DRAFT' ? (
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => changeStatus('ARCHIVED', 'Archived')}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function SettingsPanel({
  assessment,
  questionCount,
}: {
  assessment: AssessmentDetail['assessment']
  questionCount: number
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const { state, trigger } = useAutosave(
    async () => {
      const form = formRef.current
      if (!form) return { ok: true }

      const result = await updateAssessmentSettings({
        ...Object.fromEntries(new FormData(form).entries()),
        assessment_id: assessment.id,
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return { ok: false, message: result.message }
      }

      setErrors({})
      // Publish validation reads `questions_to_serve`, so it is recomputed.
      router.refresh()
      return { ok: true }
    },
    { onError: (message) => toast.error(message) },
  )

  const error = (name: string) => errors[name]?.[0]

  return (
    <section className="flex flex-col gap-4" aria-labelledby="settings-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="settings-heading" className="font-heading text-lg font-semibold">
          Settings
        </h2>
        <SaveIndicator state={state} />
      </div>

      <form
        ref={formRef}
        onChange={trigger}
        className="bg-card flex flex-col gap-5 rounded-lg border p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Which attempt counts"
            name="attempt_scoring"
            error={error('attempt_scoring')}
          >
            <select
              id="attempt_scoring"
              name="attempt_scoring"
              defaultValue={assessment.attempt_scoring}
              className={SELECT_CLASS}
            >
              <option value="HIGHEST">Highest score</option>
              <option value="LATEST">Latest attempt</option>
              <option value="AVERAGE">Average of attempts</option>
              <option value="FIRST">First attempt</option>
            </select>
          </Field>

          <Field label="When students see results" name="release_policy" error={error('release_policy')}>
            <select
              id="release_policy"
              name="release_policy"
              defaultValue={assessment.release_policy}
              className={SELECT_CLASS}
            >
              <option value="IMMEDIATE">As soon as marking finishes</option>
              <option value="AFTER_GRADING">Once I have marked everything</option>
              <option value="AFTER_CLOSE">After the paper closes</option>
              <option value="MANUAL">Only when I release them</option>
            </select>
          </Field>

          <Field
            label="Questions to serve"
            name="questions_to_serve"
            error={error('questions_to_serve')}
            hint={`Blank serves all ${questionCount}. Fewer draws a random subset per student.`}
          >
            <Input
              name="questions_to_serve"
              type="number"
              min={1}
              max={500}
              defaultValue={assessment.questions_to_serve ?? ''}
            />
          </Field>

          <Field
            label="Grace period (minutes)"
            name="grace_minutes"
            error={error('grace_minutes')}
            hint="Extra time after closing in which a student may still start"
          >
            <Input
              name="grace_minutes"
              type="number"
              min={0}
              max={180}
              defaultValue={assessment.grace_minutes}
            />
          </Field>

          <Field
            label="Late penalty (%)"
            name="late_penalty_percent"
            error={error('late_penalty_percent')}
            hint="Applied to a submission after the closing time"
          >
            <Input
              name="late_penalty_percent"
              type="number"
              min={0}
              max={100}
              step="0.5"
              defaultValue={assessment.late_penalty_percent}
            />
          </Field>
        </div>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-xs font-medium">Behaviour</legend>

          <Toggle
            name="auto_marking"
            defaultChecked={assessment.auto_marking}
            label="Mark objective questions automatically"
            hint={
              assessment.auto_marking
                ? 'Multiple choice, numerical, matching and the rest are marked on submission. Written answers still come to you.'
                : 'Off: nothing is marked automatically. Every question waits for you, and students see no score until you have been through it.'
            }
          />
          <Toggle
            name="negative_marking"
            defaultChecked={assessment.negative_marking}
            label="Negative marking"
            hint="Subtracts each question's negative marks for a wrong answer"
          />
          <Toggle
            name="shuffle_questions"
            defaultChecked={assessment.shuffle_questions}
            label="Shuffle question order"
            hint="Each student is served the same questions in a different order"
          />
          <Toggle
            name="shuffle_options"
            defaultChecked={assessment.shuffle_options}
            label="Shuffle option order"
          />
          <Toggle
            name="reveal_answers"
            defaultChecked={assessment.reveal_answers}
            label="Show correct answers afterwards"
            hint="Only ever after their result is released"
          />
          <Toggle
            name="allow_late"
            defaultChecked={assessment.allow_late}
            label="Accept work after the closing time"
          />
          <Toggle
            name="allow_pause"
            defaultChecked={assessment.allow_pause}
            label="Let students pause the timer"
          />
        </fieldset>

        <p className="text-muted-foreground text-xs">
          Saved as you change them. Nothing here alters a paper students have
          already sat — the settings that would are refused by the server.
        </p>
      </form>
    </section>
  )
}

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: string
  label: string
  hint?: string
  defaultChecked: boolean
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <Checkbox name={name} value="true" defaultChecked={defaultChecked} className="mt-0.5" />
      <span className="flex flex-col">
        <span>{label}</span>
        {hint ? <span className={cn('text-muted-foreground text-xs')}>{hint}</span> : null}
      </span>
    </label>
  )
}
