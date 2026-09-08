'use client'

import { useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { Check, Loader2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/shared/date-time-picker'
import { Field } from '@/components/institution/teacher-form'
import { useAutosave, type SaveState } from '@/components/teacher/use-autosave'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { ASSESSMENT_KINDS } from '@/lib/validation/assessment'
import { humaniseEnum } from '@/lib/constants/enums'
import { updateAssessmentDetails, type AssessmentDetail } from '@/services/assessments/builder'
import type { PublishTargets } from '@/services/teacher/overview'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/** `2026-08-28T14:30:00+00:00` → `2026-08-28T14:30`, which is what the input wants. */
function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * The paper's own details, saved as they are typed.
 *
 * A teacher who writes a title, gets distracted and closes the tab should come
 * back to their title. There is no Save button here for the same reason there is
 * no Save button on the student's answers: the work is the teacher's, and asking
 * them to remember to press something is how it gets lost.
 *
 * Which class the paper is addressed to is locked once it is published. The
 * server refuses that change too — this only stops the field being offered when
 * pressing it would produce an error.
 */
export function AssessmentDetailsPanel({
  assessment,
  targets,
  editable,
}: {
  assessment: AssessmentDetail['assessment']
  targets: PublishTargets
  editable: boolean
}) {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const { state, trigger } = useAutosave(
    async () => {
      const form = formRef.current
      if (!form) return { ok: true }

      // The delivery target rides along as hidden fields even when it is not
      // editable, so a save is never read as a request to clear it.
      const values = Object.fromEntries(new FormData(form).entries())
      const result = await updateAssessmentDetails(assessment.id, values)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        return { ok: false, message: result.message }
      }

      setErrors({})
      // The publish checks read title, duration and pass marks, so they have to
      // be recomputed once a change lands.
      router.refresh()
      return { ok: true }
    },
    { onError: (message) => toast.error(message) },
  )

  const error = (name: string) => errors[name]?.[0]
  const current = targets.targets.find(
    (item) =>
      item.class_id === assessment.class_id &&
      (item.section_id ?? null) === (assessment.section_id ?? null),
  )

  return (
    <section className="flex flex-col gap-4" aria-labelledby="details-heading">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="details-heading" className="font-heading text-lg font-semibold">
          Details
        </h2>
        <SaveIndicator state={state} />
      </div>

      <form
        ref={formRef}
        // `onChange` bubbles from every field, so one handler covers the form.
        // `onInput` would fire per keystroke; the debounce inside `useAutosave`
        // is what makes either safe, and `onChange` is the quieter of the two.
        onChange={trigger}
        className="bg-card grid gap-4 rounded-lg border p-5 sm:grid-cols-2"
      >
        <Field label="Title" name="title" error={error('title')} required className="sm:col-span-2">
          <Input name="title" defaultValue={assessment.title} required />
        </Field>

        <Field
          label="Instructions"
          name="instructions"
          error={error('instructions')}
          className="sm:col-span-2"
        >
          <Textarea name="instructions" rows={3} defaultValue={assessment.instructions ?? ''} />
        </Field>

        <Field label="Type" name="kind" error={error('kind')} required>
          <select name="kind" defaultValue={assessment.kind} className={SELECT_CLASS}>
            {ASSESSMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {humaniseEnum(kind)}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Class"
          name="class_id"
          error={error('class_id')}
          hint={editable ? undefined : 'Fixed once published'}
          required
        >
          {editable ? (
            <select
              name="class_id"
              defaultValue={assessment.class_id}
              className={SELECT_CLASS}
              required
            >
              {targets.targets.map((item) => (
                <option key={`${item.class_id}:${item.section_id ?? ''}`} value={item.class_id}>
                  {item.label}
                </option>
              ))}
            </select>
          ) : (
            <Input value={current?.label ?? assessment.classes?.name ?? '—'} readOnly disabled />
          )}
        </Field>

        <Field label="Subject" name="subject_id" error={error('subject_id')}>
          <select
            name="subject_id"
            defaultValue={assessment.subject_id ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            {targets.subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Duration (minutes)"
          name="duration_minutes"
          error={error('duration_minutes')}
          hint="Blank means no time limit"
        >
          <Input
            name="duration_minutes"
            type="number"
            min={1}
            max={600}
            defaultValue={assessment.duration_minutes ?? ''}
          />
        </Field>

        <Field label="Attempts allowed" name="max_attempts" error={error('max_attempts')} required>
          <Input
            name="max_attempts"
            type="number"
            min={1}
            max={10}
            defaultValue={assessment.max_attempts}
            required
          />
        </Field>

        <Field label="Pass mark" name="pass_marks" error={error('pass_marks')}>
          <Input
            name="pass_marks"
            type="number"
            min={0}
            step="0.5"
            defaultValue={assessment.pass_marks ?? ''}
          />
        </Field>

        <Field label="Difficulty" name="difficulty" error={error('difficulty')}>
          <select
            name="difficulty"
            defaultValue={assessment.difficulty ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            <option value="EASY">Easy</option>
            <option value="MODERATE">Moderate</option>
            <option value="HARD">Hard</option>
          </select>
        </Field>

        <Field label="Opens" name="opens_at" error={error('opens_at')}>
          {/*
            A hidden input set from React fires no change event, so the form's
            own onChange never sees it. The picker reports its own changes and
            the autosave is triggered explicitly.
          */}
          <DateTimePicker
            name="opens_at"
            defaultValue={toLocalInput(assessment.opens_at)}
            defaultTime="09:00"
            onValueChange={trigger}
          />
        </Field>

        <Field label="Closes" name="closes_at" error={error('closes_at')}>
          <DateTimePicker
            name="closes_at"
            defaultValue={toLocalInput(assessment.closes_at)}
            defaultTime="23:59"
            onValueChange={trigger}
          />
        </Field>

        {/* The delivery target travels with the form even when it is not shown,
            so a save after publication does not look like a request to clear it. */}
        {!editable ? (
          <>
            <input type="hidden" name="class_id" value={assessment.class_id} />
            <input type="hidden" name="section_id" value={assessment.section_id ?? ''} />
          </>
        ) : (
          <input type="hidden" name="section_id" value={assessment.section_id ?? ''} />
        )}
        <input type="hidden" name="academic_year_id" value={assessment.academic_year_id} />
      </form>
    </section>
  )
}

export function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'idle') return null

  const content = {
    saving: { icon: Loader2, label: 'Saving…', spin: true },
    saved: { icon: Check, label: 'Saved', spin: false },
    failed: { icon: WifiOff, label: 'Not saved — your last change did not reach the server', spin: false },
  }[state]

  return (
    // `aria-live` so somebody using a screen reader hears that their work is
    // safe without having to go looking for the indicator.
    <span
      aria-live="polite"
      className={cn(
        'flex items-center gap-1.5 text-xs',
        state === 'failed' ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      <content.icon
        className={cn('size-3.5', content.spin && 'animate-spin')}
        aria-hidden="true"
      />
      {content.label}
    </span>
  )
}
