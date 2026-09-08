'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { BookOpen, ClipboardList, FlaskConical, GraduationCap, Timer } from 'lucide-react'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/shared/date-time-picker'
import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { KIND_DEFAULTS, type AssessmentKind } from '@/lib/validation/assessment'
import type { PublishTargets } from '@/services/teacher/overview'
import { createAssessment } from '@/services/assessments/builder'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * The five kinds, with what actually distinguishes them.
 *
 * The engine underneath is identical — the same questions, the same marking,
 * the same timer. What differs is the defaults, so the descriptions say what a
 * teacher gets rather than inventing a distinction that is not there.
 */
const KINDS: {
  id: AssessmentKind
  label: string
  icon: typeof ClipboardList
  blurb: string
}[] = [
  {
    id: 'ASSIGNMENT',
    label: 'Assignment',
    icon: ClipboardList,
    blurb: 'No time limit, one attempt, marks released once you have graded it.',
  },
  {
    id: 'QUIZ',
    label: 'Quiz',
    icon: Timer,
    blurb: 'Short and low stakes. 15 minutes, two attempts, score shown immediately.',
  },
  {
    id: 'TEST',
    label: 'Test',
    icon: BookOpen,
    blurb: '45 minutes, one attempt, results after you have finished marking.',
  },
  {
    id: 'EXAM',
    label: 'Exam',
    icon: GraduationCap,
    blurb: '2 hours, one attempt, negative marking on, results released by you.',
  },
  {
    id: 'PRACTICE',
    label: 'Practice',
    icon: FlaskConical,
    blurb: 'Unlimited-ish. Ten attempts, no time limit, feedback straight away.',
  },
]

export function AssessmentCreateForm({ options }: { options: PublishTargets }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [kind, setKind] = useState<AssessmentKind>('QUIZ')
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  type Target = PublishTargets['targets'][number]
  const [target, setTarget] = useState<Target | null>(options.targets[0] ?? null)

  const defaults = KIND_DEFAULTS[kind]

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await createAssessment({
        ...Object.fromEntries(formData.entries()),
        kind,
        class_id: target?.class_id ?? '',
        section_id: target?.section_id ?? '',
        academic_year_id: target?.academic_year_id ?? '',
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success('Created — now add your questions')
      router.push(`/teacher/assessments/${result.data.id}`)
    })
  }

  const error = (name: string) => errors[name]?.[0]

  if (options.targets.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You are not assigned to any class yet, so there is nowhere to publish an assessment. Ask
        your institution administrator to assign you to one.
      </p>
    )
  }

  return (
    <form action={submit} className="flex flex-col gap-8">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">What are you setting?</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {KINDS.map((option) => {
            const selected = kind === option.id
            return (
              <label
                key={option.id}
                className={cn(
                  'flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors',
                  selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                )}
              >
                <span className="flex items-center gap-2.5">
                  {/* A real radio, so keyboard and screen-reader users get the
                      grouping semantics rather than a div that looks selected. */}
                  <input
                    type="radio"
                    name="kind-picker"
                    value={option.id}
                    checked={selected}
                    onChange={() => setKind(option.id)}
                    className="text-primary size-4"
                  />
                  <option.icon className="text-primary size-4" aria-hidden="true" />
                  <span className="font-medium">{option.label}</span>
                </span>
                <span className="text-muted-foreground text-xs">{option.blurb}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="bg-card grid gap-4 rounded-lg border p-5 sm:grid-cols-2">
        <Field label="Title" name="title" error={error('title')} required className="sm:col-span-2">
          <Input id="title" name="title" required placeholder="e.g. Unit 3 — Propulsion" />
        </Field>

        <Field
          label="Instructions"
          name="instructions"
          error={error('instructions')}
          className="sm:col-span-2"
        >
          <Textarea
            id="instructions"
            name="instructions"
            rows={3}
            placeholder="Shown to students before they start"
          />
        </Field>

        <Field label="Class" name="class_id" error={error('class_id')} required>
          <select
            id="class_id"
            className={SELECT_CLASS}
            value={target ? `${target.class_id}:${target.section_id ?? ''}` : ''}
            onChange={(event) => {
              const [classId, sectionId] = event.target.value.split(':')
              setTarget(
                options.targets.find(
                  (item) => item.class_id === classId && (item.section_id ?? '') === sectionId,
                ) ?? null,
              )
            }}
            required
          >
            {options.targets.map((item) => (
              <option
                key={`${item.class_id}:${item.section_id ?? ''}`}
                value={`${item.class_id}:${item.section_id ?? ''}`}
              >
                {item.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Subject" name="subject_id" error={error('subject_id')}>
          <select id="subject_id" name="subject_id" defaultValue="" className={SELECT_CLASS}>
            <option value="">Not set</option>
            {options.subjects.map((subject) => (
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
          hint={defaults.duration_minutes ? undefined : 'Blank means no time limit'}
        >
          <Input
            id="duration_minutes"
            name="duration_minutes"
            type="number"
            min={1}
            max={600}
            key={`duration-${kind}`}
            defaultValue={defaults.duration_minutes ?? ''}
          />
        </Field>

        <Field label="Attempts allowed" name="max_attempts" error={error('max_attempts')} required>
          <Input
            id="max_attempts"
            name="max_attempts"
            type="number"
            min={1}
            max={10}
            key={`attempts-${kind}`}
            defaultValue={defaults.max_attempts}
            required
          />
        </Field>

        <Field
          label="Pass mark"
          name="pass_marks"
          error={error('pass_marks')}
          hint="Optional. Checked against the total once questions are added."
        >
          <Input id="pass_marks" name="pass_marks" type="number" min={0} step="0.5" />
        </Field>

        <Field label="Difficulty" name="difficulty" error={error('difficulty')}>
          <select id="difficulty" name="difficulty" defaultValue="" className={SELECT_CLASS}>
            <option value="">Not set</option>
            <option value="EASY">Easy</option>
            <option value="MODERATE">Moderate</option>
            <option value="HARD">Hard</option>
          </select>
        </Field>

        <Field label="Opens" name="opens_at" error={error('opens_at')} hint="Blank means as soon as published">
          <DateTimePicker id="opens_at" name="opens_at" defaultTime="09:00" />
        </Field>

        <Field label="Closes" name="closes_at" error={error('closes_at')}>
          <DateTimePicker id="closes_at" name="closes_at" defaultTime="23:59" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !target}>
          {pending ? 'Creating…' : 'Create and add questions'}
        </Button>
        <p className="text-muted-foreground text-sm">
          It stays a draft until you publish it. Nothing reaches students yet.
        </p>
      </div>
    </form>
  )
}
