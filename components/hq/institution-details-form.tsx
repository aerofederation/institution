'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { humaniseEnum } from '@/lib/constants/enums'
import { INSTITUTION_CATEGORIES, INSTITUTION_TYPES } from '@/lib/validation/institution'
import { updateInstitutionDetails } from '@/services/hq/institution-profile'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

export type EditableInstitution = {
  id: string
  name: string
  official_email: string
  official_phone: string | null
  website: string | null
  description: string | null
  field_of_work: string | null
  registration_number: string | null
  year_established: number | null
  address_line: string | null
  city: string | null
  state: string | null
  country: string
  postal_code: string | null
  institution_type: string
  category: string
}

/**
 * HQ correcting the federation's record of an institution.
 *
 * Two fields appear here that the institution's own form does not offer:
 * `institution_type` and `category`. Those were verified by HQ at approval, so
 * HQ is who fixes them when they are wrong.
 *
 * Status is deliberately not on this form. Suspending an institution revokes
 * access for every one of its users at once, and it belongs behind its own
 * control with its own reason — not next to a postcode where it could be
 * changed while fixing something else.
 */
export function InstitutionDetailsForm({ institution }: { institution: EditableInstitution }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await updateInstitutionDetails({
        ...Object.fromEntries(formData.entries()),
        institution_id: institution.id,
      })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success('Institution details updated')
      router.refresh()
    })
  }

  const error = (name: string) => errors[name]?.[0]

  return (
    <form action={submit} className="flex flex-col gap-6">
      <div className="bg-card grid gap-4 rounded-lg border p-5 sm:grid-cols-2">
        <Field label="Name" name="name" error={error('name')} required className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={institution.name} required />
        </Field>

        <Field
          label="Type"
          name="institution_type"
          error={error('institution_type')}
          hint="Verified at approval"
          required
        >
          <select
            id="institution_type"
            name="institution_type"
            defaultValue={institution.institution_type}
            className={SELECT_CLASS}
            required
          >
            {INSTITUTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {humaniseEnum(type)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" name="category" error={error('category')} required>
          <select
            id="category"
            name="category"
            defaultValue={institution.category}
            className={SELECT_CLASS}
            required
          >
            {INSTITUTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {humaniseEnum(category)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Official email" name="official_email" error={error('official_email')} required>
          <Input
            id="official_email"
            name="official_email"
            type="email"
            defaultValue={institution.official_email}
            required
          />
        </Field>

        <Field label="Official phone" name="official_phone" error={error('official_phone')}>
          <Input
            id="official_phone"
            name="official_phone"
            type="tel"
            defaultValue={institution.official_phone ?? ''}
          />
        </Field>

        <Field label="Website" name="website" error={error('website')}>
          <Input id="website" name="website" defaultValue={institution.website ?? ''} />
        </Field>

        <Field label="Field of work" name="field_of_work" error={error('field_of_work')}>
          <Input
            id="field_of_work"
            name="field_of_work"
            defaultValue={institution.field_of_work ?? ''}
          />
        </Field>

        <Field
          label="Registration number"
          name="registration_number"
          error={error('registration_number')}
        >
          <Input
            id="registration_number"
            name="registration_number"
            defaultValue={institution.registration_number ?? ''}
          />
        </Field>

        <Field label="Year established" name="year_established" error={error('year_established')}>
          <Input
            id="year_established"
            name="year_established"
            type="number"
            min={1800}
            max={new Date().getFullYear()}
            defaultValue={institution.year_established ?? ''}
          />
        </Field>

        <Field
          label="Description"
          name="description"
          error={error('description')}
          className="sm:col-span-2"
        >
          <Textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={institution.description ?? ''}
          />
        </Field>
      </div>

      <div className="bg-card grid gap-4 rounded-lg border p-5 sm:grid-cols-2">
        <Field
          label="Address"
          name="address_line"
          error={error('address_line')}
          className="sm:col-span-2"
        >
          <Input
            id="address_line"
            name="address_line"
            defaultValue={institution.address_line ?? ''}
          />
        </Field>

        <Field label="City" name="city" error={error('city')}>
          <Input id="city" name="city" defaultValue={institution.city ?? ''} />
        </Field>

        <Field label="State" name="state" error={error('state')}>
          <Input id="state" name="state" defaultValue={institution.state ?? ''} />
        </Field>

        <Field label="Country" name="country" error={error('country')} required>
          <Input id="country" name="country" defaultValue={institution.country} required />
        </Field>

        <Field label="Postal code" name="postal_code" error={error('postal_code')}>
          <Input id="postal_code" name="postal_code" defaultValue={institution.postal_code ?? ''} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save details'}
        </Button>
        <p className="text-muted-foreground text-sm">
          Recorded in the audit log. Suspending or reactivating is a separate action.
        </p>
      </div>
    </form>
  )
}
