'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { UserPlus } from 'lucide-react'
import { toast } from 'sonner'

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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createTeacher } from '@/services/teachers'

/**
 * Adding a teacher.
 *
 * No password field, by design. The account is created without one and the
 * teacher receives a single-use link to choose their own — so a staff number
 * and an email address is the whole of what an administrator needs to type, and
 * nobody but the teacher ever knows their password.
 *
 * Field errors come back from the server keyed by field name and are rendered
 * against the inputs. The client does not re-implement the validation rules:
 * the schema on the server is the single definition, and duplicating it here
 * would mean two definitions that can disagree.
 */
export function TeacherForm({
  departments,
}: {
  departments: { id: string; name: string; code: string }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const values = Object.fromEntries(formData.entries())
      const result = await createTeacher(values)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      /*
       * Provisioning and delivery are reported separately. The account exists
       * either way, and telling an administrator the invitation was sent when
       * SMTP refused it leaves them with no reason to look again.
       */
      if (result.data.emailed) {
        toast.success(
          `${result.data.employeeId} created — activation link sent to ${result.data.email}`,
        )
      } else {
        toast.warning(
          `${result.data.employeeId} created, but the invitation to ${result.data.email} could not be delivered. Use "Resend invitation" once mail is working.`,
        )
      }

      setOpen(false)
      router.refresh()
    })
  }

  const fieldError = (name: string) => errors[name]?.[0]

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" aria-hidden="true" />
          Add teacher
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a teacher</DialogTitle>
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
              label="Staff number"
              name="employee_id"
              error={fieldError('employee_id')}
              hint="Unique within your institution"
              required
            >
              <Input id="employee_id" name="employee_id" placeholder="T-001" required />
            </Field>

            <Field label="Phone" name="phone" error={fieldError('phone')}>
              <Input id="phone" name="phone" type="tel" autoComplete="off" />
            </Field>

            <Field label="Department" name="department_id" error={fieldError('department_id')}>
              <select
                id="department_id"
                name="department_id"
                defaultValue=""
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none"
              >
                <option value="">Not assigned</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name} ({department.code})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Joining date" name="joining_date" error={fieldError('joining_date')}>
              <Input id="joining_date" name="joining_date" type="date" />
            </Field>

            <Field label="Qualification" name="qualification" error={fieldError('qualification')}>
              <Input id="qualification" name="qualification" placeholder="M.Tech, Ph.D" />
            </Field>

            <Field
              label="Specialisation"
              name="specialization"
              error={fieldError('specialization')}
            >
              <Input id="specialization" name="specialization" placeholder="Propulsion systems" />
            </Field>

            <Field
              label="Experience (years)"
              name="experience_years"
              error={fieldError('experience_years')}
              className="sm:col-span-1"
            >
              <Input
                id="experience_years"
                name="experience_years"
                type="number"
                min={0}
                max={70}
                step="0.5"
              />
            </Field>
          </div>

          <Field label="Notes" name="bio" error={fieldError('bio')}>
            <Textarea id="bio" name="bio" rows={3} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creating…' : 'Create and invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function Field({
  label,
  name,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string
  name: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={name} className="text-xs font-medium">
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  )
}
