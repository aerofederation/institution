'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Copy, Layers, Library, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { humaniseEnum } from '@/lib/constants/enums'
import { addBankItemsToAssessment, type BankItem } from '@/services/assessments/bank'
import { createSection, duplicateAssessment } from '@/services/assessments/builder'

/**
 * Adding a section to a paper.
 *
 * Sections are optional grouping — Section A multiple choice, Section B essay.
 * The question editor shows a section picker once at least one exists, so this
 * is the door to that.
 */
export function SectionDialog({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})
    startTransition(async () => {
      const result = await createSection({
        ...Object.fromEntries(formData.entries()),
        assessment_id: assessmentId,
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success('Section added')
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Layers className="size-4" aria-hidden="true" />
          Add section
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a section</DialogTitle>
          <DialogDescription>
            Groups questions within the paper. Optional — a paper without sections works fine.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <Field label="Title" name="title" error={errors.title?.[0]} required>
            <Input name="title" placeholder="Section A — Multiple choice" required />
          </Field>
          <Field label="Instructions" name="instructions" error={errors.instructions?.[0]}>
            <Textarea name="instructions" rows={3} placeholder="Shown above this section" />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Adding…' : 'Add section'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Picking questions out of the bank.
 *
 * Chosen questions are **copied** into the paper — see the note at the top of
 * `services/assessments/bank`. Editing the bank afterwards never reaches a paper
 * a class has already sat, which is the property that makes reuse safe.
 */
export function BankPickerDialog({
  assessmentId,
  items,
}: {
  assessmentId: string
  items: BankItem[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [chosen, setChosen] = useState<string[]>([])

  const add = () =>
    startTransition(async () => {
      const result = await addBankItemsToAssessment({
        assessment_id: assessmentId,
        item_ids: chosen,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(
        `${result.data.added} question${result.data.added === 1 ? '' : 's'} copied into this paper`,
      )
      setChosen([])
      setOpen(false)
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={items.length === 0}>
          <Library className="size-4" aria-hidden="true" />
          {items.length === 0 ? 'Bank is empty' : 'Add from bank'}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add from your question bank</DialogTitle>
          <DialogDescription>
            Each one is copied into this paper. Changing it in the bank later will not alter this
            assessment.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const selected = chosen.includes(item.id)
            return (
              <li key={item.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                    selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      setChosen((current) =>
                        selected ? current.filter((id) => id !== item.id) : [...current, item.id],
                      )
                    }
                    className="mt-0.5"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{item.prompt}</span>
                    <span className="text-muted-foreground text-xs">
                      {humaniseEnum(item.question_type)} · {item.marks} mark
                      {Number(item.marks) === 1 ? '' : 's'}
                      {item.topic ? ` · ${item.topic}` : ''}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={add} disabled={pending || chosen.length === 0}>
            {pending
              ? 'Adding…'
              : `Add ${chosen.length} question${chosen.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Copies a whole paper into a new draft.
 *
 * The original is untouched, including any attempts against it — which is the
 * point: duplicating is how a teacher reuses last term's exam without editing
 * the one last term's marks were computed from.
 */
export function DuplicateAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await duplicateAssessment({ assessment_id: assessmentId })
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          toast.success('Copied to a new draft')
          router.push(`/teacher/assessments/${result.data.id}`)
        })
      }
    >
      <Copy className="size-4" aria-hidden="true" />
      {pending ? 'Copying…' : 'Duplicate'}
    </Button>
  )
}

/** Shown when a paper has no questions yet, alongside the editor. */
export function AddQuestionHint() {
  return (
    <p className="text-muted-foreground flex items-center gap-2 text-sm">
      <Plus className="size-4" aria-hidden="true" />
      Write one below, or pull one out of your bank.
    </p>
  )
}
