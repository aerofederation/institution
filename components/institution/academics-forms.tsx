'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Plus } from 'lucide-react'
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
import type { ActionResult } from '@/lib/errors'
import {
  createAcademicYear,
  createClassRecord,
  createDepartment,
  createProgram,
  createSection,
  createSubject,
} from '@/services/academics'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * One dialog shell for all five academic record types.
 *
 * They differ only in their fields and which action they call, so the open
 * state, pending state, field-error plumbing and toast handling are written
 * once. Five near-identical components would drift apart on the first change.
 */
function RecordDialog({
  trigger,
  title,
  description,
  submitLabel,
  action,
  children,
  onDone,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  submitLabel: string
  action: (input: unknown) => Promise<ActionResult<{ id: string }>>
  children: (helpers: { error: (name: string) => string | undefined }) => React.ReactNode
  onDone?: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await action(Object.fromEntries(formData.entries()))

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(`${title.replace('Add ', '').replace('New ', '')} created`)
      setOpen(false)
      onDone?.()
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          {children({ error: (name) => errors[name]?.[0] })}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Props are forwarded, and that is the whole point of this component.
 *
 * `DialogTrigger asChild` merges its own props — the click handler,
 * `aria-expanded`, `data-state` — onto its immediate child. When that child is
 * a custom component, the merge target is the component, and anything it does
 * not spread onto a real element is silently dropped. An earlier version took
 * only `label`, so every one of these buttons rendered perfectly, typechecked,
 * built, and did nothing at all when clicked.
 */
function AddButton({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button size="sm" variant="outline" {...props}>
      <Plus className="size-4" aria-hidden="true" />
      {label}
    </Button>
  )
}

export function DepartmentDialog() {
  return (
    <RecordDialog
      trigger={<AddButton label="Add department" />}
      title="Add department"
      description="Departments organise teachers, programmes and classes."
      submitLabel="Create department"
      action={createDepartment}
    >
      {({ error }) => (
        <>
          <Field label="Code" name="code" error={error('code')} hint="Short, e.g. AERO" required>
            <Input id="code" name="code" placeholder="AERO" required />
          </Field>
          <Field label="Name" name="name" error={error('name')} required>
            <Input id="name" name="name" placeholder="Aerospace Engineering" required />
          </Field>
          <Field label="Description" name="description" error={error('description')}>
            <Textarea id="description" name="description" rows={3} />
          </Field>
        </>
      )}
    </RecordDialog>
  )
}

export function AcademicYearDialog() {
  return (
    <RecordDialog
      trigger={<AddButton label="Add academic year" />}
      title="Add academic year"
      description="Classes belong to an academic year, so this comes first."
      submitLabel="Create year"
      action={createAcademicYear}
    >
      {({ error }) => (
        <>
          <Field label="Name" name="name" error={error('name')} required>
            <Input id="name" name="name" placeholder="2026-27" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts on" name="starts_on" error={error('starts_on')} required>
              <Input id="starts_on" name="starts_on" type="date" required />
            </Field>
            <Field label="Ends on" name="ends_on" error={error('ends_on')} required>
              <Input id="ends_on" name="ends_on" type="date" required />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            {/* Marking a new year current stands the previous one down — only
                one may be current at a time. */}
            <Checkbox name="is_current" value="true" />
            Make this the current academic year
          </label>
        </>
      )}
    </RecordDialog>
  )
}

export function ProgramDialog({
  departments,
}: {
  departments: { id: string; name: string }[]
}) {
  return (
    <RecordDialog
      trigger={<AddButton label="Add programme" />}
      title="Add programme"
      description="A course of study students are enrolled onto, such as B.Tech Aerospace."
      submitLabel="Create programme"
      action={createProgram}
    >
      {({ error }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Code" name="code" error={error('code')} required>
              <Input id="code" name="code" placeholder="BTECH-AE" required />
            </Field>
            <Field label="Level" name="level" error={error('level')}>
              <Input id="level" name="level" placeholder="Undergraduate" />
            </Field>
          </div>
          <Field label="Name" name="name" error={error('name')} required>
            <Input id="name" name="name" placeholder="B.Tech Aerospace Engineering" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Department" name="department_id" error={error('department_id')}>
              <select id="department_id" name="department_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">Not assigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Duration (months)" name="duration_months" error={error('duration_months')}>
              <Input id="duration_months" name="duration_months" type="number" min={1} max={120} />
            </Field>
          </div>
        </>
      )}
    </RecordDialog>
  )
}

export function ClassDialog({
  years,
  programs,
  departments,
}: {
  years: { id: string; name: string; is_current: boolean }[]
  programs: { id: string; name: string }[]
  departments: { id: string; name: string }[]
}) {
  const currentYear = years.find((year) => year.is_current)

  return (
    <RecordDialog
      trigger={<AddButton label="Add class" />}
      title="Add class"
      description="A cohort within an academic year. Students are placed into classes and sections."
      submitLabel="Create class"
      action={createClassRecord}
    >
      {({ error }) => (
        <>
          <Field label="Name" name="name" error={error('name')} required>
            <Input id="name" name="name" placeholder="First Year" required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Academic year"
              name="academic_year_id"
              error={error('academic_year_id')}
              required
            >
              <select
                id="academic_year_id"
                name="academic_year_id"
                defaultValue={currentYear?.id ?? ''}
                className={SELECT_CLASS}
                required
              >
                <option value="">Choose a year</option>
                {years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                    {year.is_current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Code" name="code" error={error('code')}>
              <Input id="code" name="code" placeholder="Y1" />
            </Field>
            <Field label="Programme" name="program_id" error={error('program_id')}>
              <select id="program_id" name="program_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">Not assigned</option>
                {programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Department" name="department_id" error={error('department_id')}>
              <select id="department_id" name="department_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">Not assigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Order"
              name="level_order"
              error={error('level_order')}
              hint="Sorts year 1 before year 2"
            >
              <Input id="level_order" name="level_order" type="number" min={0} max={100} />
            </Field>
            <Field label="Capacity" name="capacity" error={error('capacity')}>
              <Input id="capacity" name="capacity" type="number" min={1} max={10000} />
            </Field>
          </div>
        </>
      )}
    </RecordDialog>
  )
}

export function SectionDialog({ classes }: { classes: { id: string; name: string }[] }) {
  return (
    <RecordDialog
      trigger={<AddButton label="Add section" />}
      title="Add section"
      description="A division within a class, such as A or B."
      submitLabel="Create section"
      action={createSection}
    >
      {({ error }) => (
        <>
          <Field label="Class" name="class_id" error={error('class_id')} required>
            <select id="class_id" name="class_id" defaultValue="" className={SELECT_CLASS} required>
              <option value="">Choose a class</option>
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" error={error('name')} required>
              <Input id="name" name="name" placeholder="A" required />
            </Field>
            <Field label="Capacity" name="capacity" error={error('capacity')}>
              <Input id="capacity" name="capacity" type="number" min={1} max={1000} />
            </Field>
          </div>
        </>
      )}
    </RecordDialog>
  )
}

/**
 * A subject the institution teaches.
 *
 * Teachers pick from this list when they build a paper or publish material, so
 * an institution with none leaves those dropdowns offering only "Not set".
 */
export function SubjectDialog({
  departments,
}: {
  departments: { id: string; name: string }[]
}) {
  return (
    <RecordDialog
      trigger={<AddButton label="Add subject" />}
      title="Add subject"
      description="Physics, Aerodynamics, Materials — whatever this institution teaches. Teachers choose from these when setting work."
      submitLabel="Create subject"
      action={createSubject}
    >
      {({ error }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" name="name" error={error('name')} required>
              <Input id="name" name="name" placeholder="Aerodynamics" required />
            </Field>
            <Field
              label="Code"
              name="code"
              error={error('code')}
              hint="Unique within your institution"
              required
            >
              <Input id="code" name="code" placeholder="AE101" required />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Optional: a small institution may not use departments at all. */}
            <Field label="Department" name="department_id" error={error('department_id')}>
              <select
                id="department_id"
                name="department_id"
                defaultValue=""
                className={SELECT_CLASS}
              >
                <option value="">Not set</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Credits" name="credits" error={error('credits')}>
              <Input id="credits" name="credits" type="number" min={0} max={100} step="0.5" />
            </Field>
          </div>

          <Field label="Description" name="description" error={error('description')}>
            <Textarea id="description" name="description" rows={3} />
          </Field>

          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox name="is_elective" value="true" />
            Elective rather than compulsory
          </label>
        </>
      )}
    </RecordDialog>
  )
}
