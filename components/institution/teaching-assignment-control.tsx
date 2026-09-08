'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Plus, X } from 'lucide-react'
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
import {
  assignTeacherToClass,
  removeTeachingAssignment,
  type TeachingAssignment,
} from '@/services/institution/teaching-assignments'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

type ClassOption = { id: string; name: string; academic_year_id: string }
type SectionOption = { id: string; name: string; class_id: string }

/**
 * Assigning a teacher to a class.
 *
 * This is the switch that turns a provisioned teacher into a working one.
 * `private.teaches_class()` reads these rows, and every RLS policy that lets a
 * teacher publish material, set an assignment or author a paper consults it —
 * so until a class appears here, that teacher can sign in and create nothing.
 *
 * It lives on the administrator's screen rather than the teacher's for the
 * obvious reason: a teacher who could assign themselves a class could publish
 * into any class in the institution.
 */
export function TeachingAssignmentControl({
  teacherId,
  teacherName,
  assignments,
  classes,
  sections,
}: {
  teacherId: string
  teacherName: string
  assignments: TeachingAssignment[]
  classes: ClassOption[]
  sections: SectionOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [classId, setClassId] = useState(classes[0]?.id ?? '')
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const chosenClass = classes.find((option) => option.id === classId)
  const availableSections = sections.filter((section) => section.class_id === classId)

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await assignTeacherToClass({
        teacher_id: teacherId,
        class_id: classId,
        section_id: formData.get('section_id'),
        academic_year_id: chosenClass?.academic_year_id ?? '',
        is_class_teacher: formData.get('is_class_teacher'),
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(`${teacherName} can now publish to that class`)
      setOpen(false)
      router.refresh()
    })
  }

  const remove = (assignmentId: string, label: string) =>
    startTransition(async () => {
      const result = await removeTeachingAssignment({ assignment_id: assignmentId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(`Removed ${label}. Material already published stays with the class.`)
      router.refresh()
    })

  const error = (name: string) => errors[name]?.[0]

  return (
    <div className="flex flex-col gap-3">
      {assignments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Not assigned to any class. Until they are, this teacher cannot publish study material,
          set assignments or build quizzes — the database refuses the write.
        </p>
      ) : (
        <ul className="divide-border bg-card divide-y rounded-lg border">
          {assignments.map((assignment) => {
            const label = assignment.sections?.name
              ? `${assignment.classes?.name ?? 'Class'} · ${assignment.sections.name}`
              : `${assignment.classes?.name ?? 'Class'} (whole class)`

            return (
              <li key={assignment.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{label}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {assignment.academic_years?.name ?? '—'}
                  </span>
                </div>
                {assignment.is_class_teacher ? (
                  <span className="border-primary/30 text-primary shrink-0 rounded-full border px-2 py-0.5 text-[11px]">
                    Class teacher
                  </span>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Remove ${label}`}
                  disabled={pending}
                  onClick={() => remove(assignment.id, label)}
                >
                  <X className="size-4" aria-hidden="true" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="w-fit" disabled={classes.length === 0}>
            <Plus className="size-4" aria-hidden="true" />
            Assign a class
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign {teacherName} to a class</DialogTitle>
            <DialogDescription>
              They will be able to publish study material, set assignments and build quizzes for
              this class — and only this class.
            </DialogDescription>
          </DialogHeader>

          <form action={submit} className="flex flex-col gap-4">
            <Field label="Class" name="class_id" error={error('class_id')} required>
              <select
                id="class_id"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className={SELECT_CLASS}
                required
              >
                {classes.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Section"
              name="section_id"
              error={error('section_id')}
              hint="Leave unset to reach the whole class"
            >
              <select
                id="section_id"
                name="section_id"
                defaultValue=""
                className={SELECT_CLASS}
                disabled={availableSections.length === 0}
              >
                <option value="">Whole class</option>
                {availableSections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </Field>

            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox name="is_class_teacher" value="true" />
              This is their class teacher role
            </label>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !classId}>
                {pending ? 'Assigning…' : 'Assign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
