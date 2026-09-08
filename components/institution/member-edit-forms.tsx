'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { updateStudent } from '@/services/students'
import { updateTeacher } from '@/services/teachers'

/**
 * Editing a teacher's or a student's record.
 *
 * Both services already existed and neither had a form, so the only way to
 * correct a misspelled name or a wrong roll number was a database client.
 *
 * Email is absent from both, and that is the one field an administrator will
 * look for. It is the account's identity: changing it is an Auth-verified flow
 * — the new address has to prove it exists before it becomes the way somebody
 * signs in — not a profile edit an administrator can make on their behalf. The
 * schemas behind these forms do not accept it.
 *
 * `status` is absent too. Suspending a member is `MemberActions`, which
 * confirms first, because it takes their access away.
 */

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

type Option = { id: string; name: string }

/** Shared submit plumbing: pending state, field errors, toast, refresh. */
function useMemberEdit(
  save: (input: Record<string, unknown>) => Promise<
    { ok: true; data: unknown } | { ok: false; message: string; fieldErrors?: Record<string, string[]> }
  >,
  successMessage: string,
) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await save(Object.fromEntries(formData.entries()))

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(successMessage)
      router.refresh()
    })
  }

  return { submit, pending, error: (name: string) => errors[name]?.[0] }
}

export type EditableTeacher = {
  profile_id: string
  employee_id: string
  department_id: string | null
  qualification: string | null
  specialization: string | null
  experience_years: number | null
  joining_date: string | null
  bio: string | null
  full_name: string
  phone: string | null
}

export function TeacherEditForm({
  teacher,
  departments,
}: {
  teacher: EditableTeacher
  departments: Option[]
}) {
  const { submit, pending, error } = useMemberEdit(
    (input) => updateTeacher({ ...input, profile_id: teacher.profile_id }),
    'Teacher updated',
  )

  return (
    <form action={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="full_name" error={error('full_name')} required>
          <Input id="full_name" name="full_name" defaultValue={teacher.full_name} required />
        </Field>

        <Field label="Phone" name="phone" error={error('phone')}>
          <Input id="phone" name="phone" type="tel" defaultValue={teacher.phone ?? ''} />
        </Field>

        <Field
          label="Employee ID"
          name="employee_id"
          error={error('employee_id')}
          hint="Unique within your institution"
          required
        >
          <Input id="employee_id" name="employee_id" defaultValue={teacher.employee_id} required />
        </Field>

        <Field label="Department" name="department_id" error={error('department_id')}>
          <select
            id="department_id"
            name="department_id"
            defaultValue={teacher.department_id ?? ''}
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

        <Field label="Qualification" name="qualification" error={error('qualification')}>
          <Input
            id="qualification"
            name="qualification"
            defaultValue={teacher.qualification ?? ''}
          />
        </Field>

        <Field label="Specialization" name="specialization" error={error('specialization')}>
          <Input
            id="specialization"
            name="specialization"
            defaultValue={teacher.specialization ?? ''}
          />
        </Field>

        <Field label="Years of experience" name="experience_years" error={error('experience_years')}>
          <Input
            id="experience_years"
            name="experience_years"
            type="number"
            min={0}
            max={70}
            defaultValue={teacher.experience_years ?? ''}
          />
        </Field>

        <Field label="Joining date" name="joining_date" error={error('joining_date')}>
          <Input
            id="joining_date"
            name="joining_date"
            type="date"
            defaultValue={teacher.joining_date ?? ''}
          />
        </Field>

        <Field label="Bio" name="bio" error={error('bio')} className="sm:col-span-2">
          <Textarea id="bio" name="bio" rows={3} defaultValue={teacher.bio ?? ''} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <p className="text-muted-foreground text-sm">
          Email is not editable here — it is how they sign in.
        </p>
      </div>
    </form>
  )
}

export type EditableStudent = {
  profile_id: string
  student_code: string
  admission_number: string | null
  department_id: string | null
  program_id: string | null
  academic_year_id: string | null
  class_id: string | null
  section_id: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_email: string | null
  admission_date: string | null
  full_name: string
  phone: string | null
}

export function StudentEditForm({
  student,
  departments,
  programs,
  years,
  classes,
  sections,
}: {
  student: EditableStudent
  departments: Option[]
  programs: Option[]
  years: Option[]
  classes: Option[]
  sections: (Option & { class_id: string })[]
}) {
  const { submit, pending, error } = useMemberEdit(
    (input) => updateStudent({ ...input, profile_id: student.profile_id }),
    'Student updated',
  )

  // A section only means something inside its class, so the list narrows with
  // the chosen class. The schema and a database CHECK enforce the same rule.
  const [classId, setClassId] = useState(student.class_id ?? '')
  const available = sections.filter((section) => section.class_id === classId)

  return (
    <form action={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" name="full_name" error={error('full_name')} required>
          <Input id="full_name" name="full_name" defaultValue={student.full_name} required />
        </Field>

        <Field label="Phone" name="phone" error={error('phone')}>
          <Input id="phone" name="phone" type="tel" defaultValue={student.phone ?? ''} />
        </Field>

        <Field
          label="Roll number"
          name="student_code"
          error={error('student_code')}
          hint="Unique within your institution"
          required
        >
          <Input
            id="student_code"
            name="student_code"
            defaultValue={student.student_code}
            required
          />
        </Field>

        <Field label="Admission number" name="admission_number" error={error('admission_number')}>
          <Input
            id="admission_number"
            name="admission_number"
            defaultValue={student.admission_number ?? ''}
          />
        </Field>

        <Field label="Department" name="department_id" error={error('department_id')}>
          <select
            id="department_id"
            name="department_id"
            defaultValue={student.department_id ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            {departments.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Programme" name="program_id" error={error('program_id')}>
          <select
            id="program_id"
            name="program_id"
            defaultValue={student.program_id ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            {programs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Academic year" name="academic_year_id" error={error('academic_year_id')}>
          <select
            id="academic_year_id"
            name="academic_year_id"
            defaultValue={student.academic_year_id ?? ''}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            {years.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Class" name="class_id" error={error('class_id')}>
          <select
            id="class_id"
            name="class_id"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className={SELECT_CLASS}
          >
            <option value="">Not set</option>
            {classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Section"
          name="section_id"
          error={error('section_id')}
          hint={classId ? undefined : 'Choose a class first'}
        >
          <select
            id="section_id"
            name="section_id"
            key={classId}
            defaultValue={available.some((s) => s.id === student.section_id) ? student.section_id! : ''}
            className={SELECT_CLASS}
            disabled={!classId}
          >
            <option value="">Not set</option>
            {available.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Admission date" name="admission_date" error={error('admission_date')}>
          <Input
            id="admission_date"
            name="admission_date"
            type="date"
            defaultValue={student.admission_date ?? ''}
          />
        </Field>
      </div>

      <div className="grid gap-4 border-t pt-5 sm:grid-cols-3">
        <Field label="Guardian name" name="guardian_name" error={error('guardian_name')}>
          <Input
            id="guardian_name"
            name="guardian_name"
            defaultValue={student.guardian_name ?? ''}
          />
        </Field>

        <Field label="Guardian phone" name="guardian_phone" error={error('guardian_phone')}>
          <Input
            id="guardian_phone"
            name="guardian_phone"
            type="tel"
            defaultValue={student.guardian_phone ?? ''}
          />
        </Field>

        <Field label="Guardian email" name="guardian_email" error={error('guardian_email')}>
          <Input
            id="guardian_email"
            name="guardian_email"
            type="email"
            defaultValue={student.guardian_email ?? ''}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
        <p className="text-muted-foreground text-sm">
          Email is not editable here — it is how they sign in.
        </p>
      </div>
    </form>
  )
}
