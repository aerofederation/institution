'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Info, Plus, X } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  AUTO_MARKED_TYPES,
  MANUAL_ONLY_TYPES,
  type QuestionType,
} from '@/lib/validation/assessment'
import { saveQuestion, updateQuestion, type QuestionDetail } from '@/services/assessments/builder'
import { saveBankItem } from '@/services/assessments/bank'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * Every question type, with an honest description of how it is marked.
 *
 * The "marked by" line is not decoration: a teacher choosing between Short
 * answer and Long answer is choosing between something the engine can mark and
 * something that will land in their grading queue, and that is the single most
 * useful thing to tell them at the point of choosing.
 */
const TYPES: { id: QuestionType; label: string; marking: string }[] = [
  { id: 'SINGLE_CHOICE', label: 'Multiple choice', marking: 'Marked automatically' },
  { id: 'MULTI_CHOICE', label: 'Multiple select', marking: 'Marked automatically' },
  { id: 'TRUE_FALSE', label: 'True or false', marking: 'Marked automatically' },
  { id: 'NUMERICAL', label: 'Numerical', marking: 'Marked automatically, within tolerance' },
  { id: 'FILL_BLANK', label: 'Fill in the blank', marking: 'Marked automatically' },
  { id: 'MATCHING', label: 'Matching', marking: 'Marked automatically' },
  { id: 'ORDERING', label: 'Ordering', marking: 'Marked automatically' },
  { id: 'SHORT_ANSWER', label: 'Short answer', marking: 'Automatic if you list accepted answers' },
  { id: 'LONG_ANSWER', label: 'Long answer', marking: 'You mark this one' },
  { id: 'CASE_STUDY', label: 'Case study', marking: 'You mark this one' },
  { id: 'FILE_UPLOAD', label: 'File upload', marking: 'You mark this one' },
]

type Option = { label: string; match_label: string; is_correct: boolean }

/**
 * Writing a question.
 *
 * One component for eleven types, because they share far more than they differ:
 * a prompt, marks, a difficulty, an explanation. What changes is the answer key,
 * and that is the part that switches.
 *
 * The correct answer is entered here and stored in `assessment_options.is_correct`
 * or on the question itself. Neither ever reaches a student's browser — their
 * paper is assembled by `student_get_paper()`, which does not project them.
 */
export function QuestionEditor({
  assessmentId,
  sections,
  existing,
  onSaved,
  onCancel,
}: {
  assessmentId: string
  sections: { id: string; title: string }[]
  /** Present when editing. Absent when writing a new question. */
  existing?: QuestionDetail
  onSaved?: () => void
  onCancel?: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const editing = Boolean(existing)

  const [type, setType] = useState<QuestionType>(
    (existing?.question_type as QuestionType) ?? 'SINGLE_CHOICE',
  )
  const [options, setOptions] = useState<Option[]>(() =>
    existing && existing.assessment_options.length > 0
      ? [...existing.assessment_options]
          .sort((a, b) => a.position - b.position)
          .map((option) => ({
            label: option.label,
            match_label: option.match_label ?? '',
            is_correct: option.is_correct,
          }))
      : [
          { label: '', match_label: '', is_correct: true },
          { label: '', match_label: '', is_correct: false },
        ],
  )
  const [blanks, setBlanks] = useState<string[]>(
    existing && existing.question_type === 'FILL_BLANK' && existing.accepted_answers.length > 0
      ? existing.accepted_answers
      : [''],
  )
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [alsoBank, setAlsoBank] = useState(false)

  const usesOptions = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE', 'MATCHING', 'ORDERING'].includes(type)
  const multi = type === 'MULTI_CHOICE'
  const manual = MANUAL_ONLY_TYPES.includes(type)
  const auto = AUTO_MARKED_TYPES.includes(type)

  const changeType = (next: QuestionType) => {
    setType(next)
    setErrors({})
    if (next === 'TRUE_FALSE') {
      setOptions([
        { label: 'True', match_label: '', is_correct: true },
        { label: 'False', match_label: '', is_correct: false },
      ])
    } else if (next === 'MATCHING' || next === 'ORDERING') {
      setOptions([
        { label: '', match_label: '', is_correct: false },
        { label: '', match_label: '', is_correct: false },
      ])
    } else {
      setOptions([
        { label: '', match_label: '', is_correct: true },
        { label: '', match_label: '', is_correct: false },
      ])
    }
  }

  /*
   * Only one option may be correct unless this is a multiple-select question.
   * The grader wants an exact set match, so a single-answer question with two
   * correct options is one nobody could ever pass.
   */
  const toggleCorrect = (index: number) =>
    setOptions((current) =>
      current.map((option, position) =>
        position === index
          ? { ...option, is_correct: !option.is_correct }
          : multi
            ? option
            : { ...option, is_correct: false },
      ),
    )

  const submit = (formData: FormData) => {
    setErrors({})

    const payload = {
      ...Object.fromEntries(formData.entries()),
      assessment_id: assessmentId,
      question_type: type,
      options: usesOptions
        ? options
            .filter((option) => option.label.trim().length > 0)
            .map((option) => ({
              label: option.label,
              match_label: option.match_label || null,
              is_correct: option.is_correct,
            }))
        : [],
      accepted_answers:
        type === 'FILL_BLANK'
          ? blanks.filter((blank) => blank.trim().length > 0)
          : type === 'SHORT_ANSWER'
            ? String(formData.get('accepted_answers') ?? '')
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            : [],
      allowed_mime_types:
        type === 'FILE_UPLOAD'
          ? String(formData.get('allowed_mime_types') ?? '')
              .split(',')
              .map((entry) => entry.trim())
              .filter(Boolean)
          : [],
    }

    startTransition(async () => {
      const result = existing
        ? await updateQuestion(existing.id, payload)
        : await saveQuestion(payload)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      // Saving to the bank as well is a copy, not a link — see the note in
      // `services/assessments/bank`.
      if (alsoBank && !editing) {
        const banked = await saveBankItem(payload)
        if (!banked.ok) toast.warning(`Added to the paper, but not to the bank: ${banked.message}`)
      }

      toast.success(editing ? 'Question updated' : 'Question added')

      // A new-question form clears itself for the next one; an edit form is
      // closed by its parent instead.
      if (!editing) {
        changeType('SINGLE_CHOICE')
        setBlanks([''])
      }

      onSaved?.()
      router.refresh()
    })
  }

  const error = (name: string) => errors[name]?.[0]

  return (
    <form action={submit} className="bg-card flex flex-col gap-5 rounded-lg border p-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Question type" name="question_type" required>
          <select
            id="question_type"
            value={type}
            onChange={(event) => changeType(event.target.value as QuestionType)}
            className={SELECT_CLASS}
          >
            {TYPES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Marks" name="marks" error={error('marks')} required>
          <Input
            name="marks"
            type="number"
            min={0.5}
            max={1000}
            step="0.5"
            defaultValue={existing?.marks ?? 1}
            required
          />
        </Field>

        <Field
          label="Negative marks"
          name="negative_marks"
          error={error('negative_marks')}
          hint="Applied only if the paper has negative marking on"
        >
          <Input
            name="negative_marks"
            type="number"
            min={0}
            max={1000}
            step="0.25"
            defaultValue={existing?.negative_marks ?? 0}
          />
        </Field>
      </div>

      <p
        className={cn(
          'flex items-start gap-2 rounded-md border p-3 text-xs',
          manual ? 'border-warning/40 bg-warning/5' : 'border-primary/30 bg-primary/5',
        )}
      >
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        <span>{TYPES.find((option) => option.id === type)?.marking}</span>
      </p>

      {sections.length > 0 ? (
        <Field label="Section" name="section_id" error={error('section_id')}>
          <select
            id="section_id"
            name="section_id"
            defaultValue={existing?.section_id ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">No section</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.title}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {type === 'CASE_STUDY' ? (
        <Field
          label="Case or passage"
          name="passage"
          error={error('passage')}
          hint="Shown above the question"
        >
          <Textarea name="passage" rows={5} defaultValue={existing?.passage ?? ''} />
        </Field>
      ) : null}

      <Field
        label={type === 'FILL_BLANK' ? 'Question — write ___ for each blank' : 'Question'}
        name="prompt"
        error={error('prompt')}
        required
      >
        <Textarea
          name="prompt"
          rows={2}
          required
          defaultValue={existing?.prompt ?? ''}
          placeholder={
            type === 'FILL_BLANK'
              ? 'The force opposing motion is ___ and it acts ___ to the direction of travel.'
              : 'What are you asking?'
          }
        />
      </Field>

      {/* ── The answer key, per type ─────────────────────────────────────── */}

      {usesOptions ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">
            {type === 'MATCHING'
              ? 'Pairs'
              : type === 'ORDERING'
                ? 'Items, in their correct order'
                : 'Options'}
            <span className="text-destructive ml-0.5">*</span>
            <span className="text-muted-foreground ml-2 font-normal">
              {type === 'MATCHING'
                ? 'Students see both columns shuffled'
                : type === 'ORDERING'
                  ? 'Students see them shuffled and must reorder'
                  : multi
                    ? 'Tick every correct answer'
                    : 'Tick the correct answer'}
            </span>
          </span>

          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              {type === 'ORDERING' ? (
                <span className="text-muted-foreground w-6 shrink-0 text-center font-mono text-xs">
                  {index + 1}
                </span>
              ) : type === 'MATCHING' ? null : (
                <Checkbox
                  checked={option.is_correct}
                  onCheckedChange={() => toggleCorrect(index)}
                  aria-label={`Option ${index + 1} is correct`}
                />
              )}

              <Input
                value={option.label}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
                placeholder={type === 'MATCHING' ? 'Left item' : `Option ${index + 1}`}
                disabled={type === 'TRUE_FALSE'}
                aria-label={`Option ${index + 1}`}
              />

              {type === 'MATCHING' ? (
                <Input
                  value={option.match_label}
                  onChange={(event) =>
                    setOptions((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, match_label: event.target.value } : item,
                      ),
                    )
                  }
                  placeholder="Matches with"
                  aria-label={`Match for item ${index + 1}`}
                />
              ) : null}

              {options.length > 2 && type !== 'TRUE_FALSE' ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setOptions((current) => current.filter((_, p) => p !== index))}
                  aria-label={`Remove option ${index + 1}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}

          {error('options') ? (
            <p className="text-destructive text-xs" role="alert">
              {error('options')}
            </p>
          ) : null}

          {type !== 'TRUE_FALSE' && options.length < 20 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() =>
                setOptions((current) => [...current, { label: '', match_label: '', is_correct: false }])
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add {type === 'MATCHING' ? 'pair' : 'option'}
            </Button>
          ) : null}
        </div>
      ) : null}

      {type === 'NUMERICAL' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Correct value" name="numeric_answer" error={error('numeric_answer')} required>
            <Input
              name="numeric_answer"
              type="number"
              step="any"
              placeholder="9.81"
              defaultValue={existing?.numeric_answer ?? ''}
              required
            />
          </Field>
          <Field
            label="Tolerance"
            name="numeric_tolerance"
            error={error('numeric_tolerance')}
            hint="± this much counts as correct"
          >
            <Input
              name="numeric_tolerance"
              type="number"
              step="any"
              min={0}
              placeholder="0.05"
              defaultValue={existing?.numeric_tolerance ?? ''}
            />
          </Field>
          <Field label="Unit" name="numeric_unit" error={error('numeric_unit')}>
            <Input name="numeric_unit" placeholder="m/s²" defaultValue={existing?.numeric_unit ?? ''} />
          </Field>
        </div>
      ) : null}

      {type === 'SHORT_ANSWER' ? (
        <Field
          label="Accepted answers"
          name="accepted_answers"
          error={error('accepted_answers')}
          hint="One per line. Leave empty to mark this question yourself."
        >
          <Textarea
            name="accepted_answers"
            rows={3}
            placeholder={'drag\nair resistance'}
            defaultValue={
              existing && existing.question_type === 'SHORT_ANSWER'
                ? existing.accepted_answers.join('\n')
                : ''
            }
          />
        </Field>
      ) : null}

      {type === 'FILL_BLANK' ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">
            Accepted answer for each blank, in order
            <span className="text-destructive ml-0.5">*</span>
            <span className="text-muted-foreground ml-2 font-normal">
              Separate alternatives with |
            </span>
          </span>

          {blanks.map((blank, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="text-muted-foreground w-16 shrink-0 font-mono text-xs">
                Blank {index + 1}
              </span>
              <Input
                value={blank}
                onChange={(event) =>
                  setBlanks((current) =>
                    current.map((item, position) => (position === index ? event.target.value : item)),
                  )
                }
                placeholder="drag|air resistance"
                aria-label={`Accepted answer for blank ${index + 1}`}
              />
              {blanks.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => setBlanks((current) => current.filter((_, p) => p !== index))}
                  aria-label={`Remove blank ${index + 1}`}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              ) : null}
            </div>
          ))}

          {error('accepted_answers') ? (
            <p className="text-destructive text-xs" role="alert">
              {error('accepted_answers')}
            </p>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() => setBlanks((current) => [...current, ''])}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add blank
          </Button>
        </div>
      ) : null}

      {type === 'FILE_UPLOAD' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Accepted file types"
            name="allowed_mime_types"
            error={error('allowed_mime_types')}
            hint="Comma separated MIME types"
          >
            <Input
              name="allowed_mime_types"
              defaultValue={
                existing && existing.allowed_mime_types.length > 0
                  ? existing.allowed_mime_types.join(',')
                  : 'application/pdf,image/jpeg,image/png'
              }
            />
          </Field>
          <Field label="Maximum size (bytes)" name="max_file_bytes" error={error('max_file_bytes')}>
            <Input
              name="max_file_bytes"
              type="number"
              min={1}
              defaultValue={existing?.max_file_bytes ?? 10_485_760}
            />
          </Field>
        </div>
      ) : null}

      {(type === 'MULTI_CHOICE' || type === 'MATCHING' || type === 'ORDERING' || type === 'FILL_BLANK') ? (
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox name="allow_partial_credit" value="true" />
          Award partial marks for a partly correct answer
        </label>
      ) : null}

      {type === 'SHORT_ANSWER' || type === 'FILL_BLANK' ? (
        <label className="flex items-center gap-2.5 text-sm">
          <Checkbox name="case_sensitive" value="true" />
          Answers must match capitalisation exactly
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Difficulty" name="difficulty" error={error('difficulty')}>
          <select
            id="difficulty"
            name="difficulty"
            defaultValue={existing?.difficulty ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            <option value="EASY">Easy</option>
            <option value="MODERATE">Moderate</option>
            <option value="HARD">Hard</option>
          </select>
        </Field>
        <Field label="Topic" name="topic" error={error('topic')}>
          <Input name="topic" placeholder="Aerodynamics" defaultValue={existing?.topic ?? ''} />
        </Field>
        <Field label="Learning objective" name="learning_objective" error={error('learning_objective')}>
          <Input name="learning_objective" defaultValue={existing?.learning_objective ?? ''} />
        </Field>
      </div>

      {/*
        Offered for the written types only. A rubric on a multiple-choice
        question would have nothing to do — the answer key already decides it.
      */}
      {['LONG_ANSWER', 'CASE_STUDY', 'SHORT_ANSWER'].includes(type) ? (
        <Field
          label="Marking rubric"
          name="rubric"
          error={error('rubric')}
          hint="What full marks look like, and what partial marks look like. Also what the AI assistant marks against — without it, it will not offer a suggestion."
        >
          <Textarea
            name="rubric"
            rows={4}
            defaultValue={existing?.rubric ?? ''}
            placeholder={
              '5 marks — explains the mechanism and names the cause.\n3 marks — names the cause only.\n0 marks — blank or off-topic.'
            }
          />
        </Field>
      ) : null}

      <Field
        label="Explanation"
        name="explanation"
        error={error('explanation')}
        hint="Shown to students afterwards, if the paper reveals answers"
      >
        <Textarea name="explanation" rows={2} defaultValue={existing?.explanation ?? ''} />
      </Field>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : editing ? 'Save changes' : 'Add question'}
        </Button>

        {editing ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : (
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox checked={alsoBank} onCheckedChange={(value) => setAlsoBank(value === true)} />
            Also save to my question bank
          </label>
        )}

        {auto ? (
          <span className="text-muted-foreground ml-auto text-xs">This one marks itself.</span>
        ) : null}
      </div>
    </form>
  )
}
