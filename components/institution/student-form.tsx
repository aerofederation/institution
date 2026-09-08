'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
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
import { createStudent } from '@/services/students'

export type AcademicOptions = {
  departments: { id: string; name: string; code: string }[]
  programs: { id: string; name: string }[]
  years: { id: string; name: string; is_current: boolean }[]
  classes: { id: string; name: string; academic_year_id: string }[]
  sections: { id: string; name: string; class_id: string }[]
}

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * Enrolling a student.
 *
 * As with teachers there is no password field: the student receives a
 * single-use link and chooses their own.
 *
 * Sections are filtered to the chosen class in the browser, which is a
 * convenience rather than a rule. The rule is a composite foreign key —
 * `(section_id, class_id)` — so a section from another class is refused by the
 * database whatever this form sends.
 */
export function StudentForm({ options }: { options: AcademicOptions }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [classId, setClassId] = useState('')

  const currentYear = options.years.find((year) => year.is_current)
  const sections = options.sections.filter((section) => section.class_id === classId)

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const values = Object.fromEntries(formData.entries())
      const result = await createStudent(values)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      if (result.data.emailed) {
        toast.success(
          `${result.data.studentCode} enrolled — activation link sent to ${result.data.email}`,
        )
      } else {
        toast.warning(
          `${result.data.studentCode} enrolled, but the invitation to ${result.data.email} could not be delivered. Use "Resend invitation" once mail is working.`,
        )
      }

      setOpen(false)
      setClassId('')
      router.refresh()
    })
  }

  const fieldError = (name: string) => errors[name]?.[0]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return
        setOpen(next)
        if (!next) setClassId('')
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" aria-hidden="true" />
          Enrol student
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Enrol a student</DialogTitle>
          <DialogDescription>
            They receive an email with a single-use link to set their own password. No password is
            created here.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" name="full_name" error={fieldError('full_name')} required>
              <Input id="full_name" name="full_name" autoComplete="off" required />
            </Field>

            <Field label="Email" name="email" error={fieldError('email')} required>
              <Input id="email" name="email" type="email" autoComplete="off" required />
            </Field>

            <Field
              label="Roll number"
              name="student_code"
              error={fieldError('student_code')}
              hint="Unique within your institution"
              required
            >
              <Input id="student_code" name="student_code" placeholder="2026-AE-014" required />
            </Field>

            <Field
              label="Admission number"
              name="admission_number"
              error={fieldError('admission_number')}
            >
              <Input id="admission_number" name="admission_number" />
            </Field>

            <Field label="Department" name="department_id" error={fieldError('department_id')}>
              <select id="department_id" name="department_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">Not assigned</option>
                {options.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Programme" name="program_id" error={fieldError('program_id')}>
              <select id="program_id" name="program_id" defaultValue="" className={SELECT_CLASS}>
                <option value="">Not assigned</option>
                {options.programs.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Academic year" name="academic_year_id" error={fieldError('academic_year_id')}>
              <select
                id="academic_year_id"
                name="academic_year_id"
                defaultValue={currentYear?.id ?? ''}
                className={SELECT_CLASS}
              >
                <option value="">Not assigned</option>
                {options.years.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                    {year.is_current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Class" name="class_id" error={fieldError('class_id')}>
              <select
                id="class_id"
                name="class_id"
                value={classId}
                onChange={(event) => setClassId(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="">Not assigned</option>
                {options.classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {klass.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Section"
              name="section_id"
              error={fieldError('section_id')}
              hint={classId ? undefined : 'Choose a class first'}
            >
              <select
                id="section_id"
                name="section_id"
                defaultValue=""
                disabled={!classId}
                className={`${SELECT_CLASS} disabled:opacity-50`}
              >
                <option value="">Not assigned</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Admission date" name="admission_date" error={fieldError('admission_date')}>
              <Input id="admission_date" name="admission_date" type="date" />
            </Field>

            <Field label="Phone" name="phone" error={fieldError('phone')}>
              <Input id="phone" name="phone" type="tel" autoComplete="off" />
            </Field>

            <Field label="Guardian name" name="guardian_name" error={fieldError('guardian_name')}>
              <Input id="guardian_name" name="guardian_name" />
            </Field>

            <Field label="Guardian phone" name="guardian_phone" error={fieldError('guardian_phone')}>
              <Input id="guardian_phone" name="guardian_phone" type="tel" />
            </Field>

            <Field label="Guardian email" name="guardian_email" error={fieldError('guardian_email')}>
              <Input id="guardian_email" name="guardian_email" type="email" />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enrolling…' : 'Enrol and invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
