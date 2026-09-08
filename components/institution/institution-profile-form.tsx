'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { InstitutionProfile } from '@/services/institution/profile'
import { updateOwnInstitution } from '@/services/institution/profile'

/**
 * Editing the institution's own record.
 *
 * The fields absent from this form are as deliberate as the ones present. Type,
 * category, slug and status are not editable here: the first two were verified
 * by HQ at approval, the slug is a public URL derived from the name at that
 * point, and status is the institution's standing in the federation. Changing
 * any of them is an HQ action, and the schema behind this form does not accept
 * them.
 */
export function InstitutionProfileForm({ institution }: { institution: InstitutionProfile }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const submit = (formData: FormData) => {
    setErrors({})

    startTransition(async () => {
      const result = await updateOwnInstitution(Object.fromEntries(formData.entries()))

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success('Institution profile updated')
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

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
