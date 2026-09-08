'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { deleteQuestion, saveQuestion } from '@/services/teaching/assessments'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

type Option = { label: string; is_correct: boolean }

/**
 * Adding a question to a paper.
 *
 * Options are part of the same form and the same save, because a choice
 * question without options is not answerable — writing them separately would
 * allow a paper to exist in that state.
 *
 * The correct answer is marked here and travels to the server, where it is
 * stored in `assessment_options.is_correct`. That column is the answer key:
 * students hold no policy on the table at all, and their view of a paper comes
 * from `student_get_paper()`, which does not project it.
 */
export function QuestionBuilder({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [questionType, setQuestionType] = useState('SINGLE_CHOICE')
  const [options, setOptions] = useState<Option[]>([
    { label: '', is_correct: true },
    { label: '', is_correct: false },
  ])
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const needsOptions = questionType !== 'SHORT_ANSWER'
  const multi = questionType === 'MULTI_CHOICE'

  const setType = (next: string) => {
    setQuestionType(next)
    if (next === 'TRUE_FALSE') {
      setOptions([
        { label: 'True', is_correct: true },
        { label: 'False', is_correct: false },
      ])
    }
  }

  /*
   * Only one option may be correct unless the question is multi-choice. The
   * grader requires an exact set match, so a single-choice question with two
   * correct answers is one nobody could ever pass — the schema rejects it, and
   * this keeps the form from building it in the first place.
   */
  const toggleCorrect = (index: number) => {
    setOptions((current) =>
      current.map((option, position) =>
        position === index
          ? { ...option, is_correct: !option.is_correct }
          : multi
            ? option
            : { ...option, is_correct: false },
      ),
    )
  }

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await saveQuestion({
        assessment_id: assessmentId,
        question_type: questionType,
        prompt: formData.get('prompt'),
        marks: formData.get('marks'),
        explanation: formData.get('explanation'),
        options: needsOptions
          ? options.filter((option) => option.label.trim().length > 0)
          : [],
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success('Question added')
      setOptions([
        { label: '', is_correct: true },
        { label: '', is_correct: false },
      ])
      setQuestionType('SINGLE_CHOICE')
      router.refresh()
    })
  }

  const error = (name: string) => errors[name]?.[0]

  return (
    <form action={submit} className="bg-card flex flex-col gap-4 rounded-lg border p-5">
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Question type" name="question_type" required>
          <select
            id="question_type"
            value={questionType}
            onChange={(event) => setType(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="SINGLE_CHOICE">Single choice</option>
            <option value="MULTI_CHOICE">Multiple choice</option>
            <option value="TRUE_FALSE">True or false</option>
            <option value="SHORT_ANSWER">Short answer (you mark it)</option>
          </select>
        </Field>

        <Field label="Marks" name="marks" error={error('marks')} required>
          <Input name="marks" type="number" min={0.5} max={1000} step="0.5" defaultValue={1} required />
        </Field>
      </div>

      <Field label="Question" name="prompt" error={error('prompt')} required>
        <Textarea name="prompt" rows={2} required placeholder="What are you asking?" />
      </Field>

      {needsOptions ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium">
            Options<span className="text-destructive ml-0.5">*</span>
            <span className="text-muted-foreground ml-2 font-normal">
              {multi ? 'Tick every correct answer' : 'Tick the correct answer'}
            </span>
          </span>

          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <Checkbox
                checked={option.is_correct}
                onCheckedChange={() => toggleCorrect(index)}
                aria-label={`Option ${index + 1} is correct`}
              />
              <Input
                value={option.label}
                onChange={(event) =>
                  setOptions((current) =>
                    current.map((item, position) =>
                      position === index ? { ...item, label: event.target.value } : item,
                    ),
                  )
                }
                placeholder={`Option ${index + 1}`}
                disabled={questionType === 'TRUE_FALSE'}
              />
              {options.length > 2 && questionType !== 'TRUE_FALSE' ? (
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

          {questionType !== 'TRUE_FALSE' && options.length < 10 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setOptions((current) => [...current, { label: '', is_correct: false }])}
            >
              <Plus className="size-4" aria-hidden="true" />
              Add option
            </Button>
          ) : null}
        </div>
      ) : null}

      <Field
        label="Explanation"
        name="explanation"
        error={error('explanation')}
        hint="Shown to students afterwards, if the paper reveals answers"
      >
        <Textarea name="explanation" rows={2} />
      </Field>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? 'Adding…' : 'Add question'}
      </Button>
    </form>
  )
}

export function DeleteQuestionButton({
  questionId,
  assessmentId,
}: {
  questionId: string
  assessmentId: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label="Delete question"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deleteQuestion({
            question_id: questionId,
            assessment_id: assessmentId,
          })
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          toast.success('Question removed')
          router.refresh()
        })
      }
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  )
}
