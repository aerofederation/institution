'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { institutionProfileSchema } from '@/lib/validation/institution'

/**
 * The institution's own record, as it can edit it.
 *
 * `institutionProfileSchema` deliberately omits `slug`, `status`, `approved_at`
 * and `approved_by`. The slug is derived at approval and is a public URL; the
 * rest belong to the HQ review workflow. An institution cannot edit its own
 * standing in the federation, and leaving those fields out of the schema means
 * a request cannot even ask to.
 */

export type InstitutionProfile = {
  id: string
  slug: string
  name: string
  institution_type: string
  category: string
  status: string
  official_email: string
  official_phone: string | null
  website: string | null
  description: string | null
  field_of_work: string | null
  address_line: string | null
  city: string | null
  state: string | null
  country: string
  postal_code: string | null
  registration_number: string | null
  year_established: number | null
  approved_at: string | null
}

export async function getOwnInstitution(): Promise<InstitutionProfile | null> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institutions')
    .select(
      `id, slug, name, institution_type, category, status, official_email, official_phone,
       website, description, field_of_work, address_line, city, state, country, postal_code,
       registration_number, year_established, approved_at`,
    )
    .eq('id', session.institutionId)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as InstitutionProfile | null
}

export async function updateOwnInstitution(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'institution.update' })
    if (!session.institutionId) {
      throw new AppError('TENANT_MISMATCH', 'no institution on this account')
    }

    const parsed = institutionProfileSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'institution profile rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    /*
     * Scoped by the session's own tenant rather than an id from the request.
     * There is no institution id in the payload and none is accepted here, so
     * this statement can only ever reach one row — and RLS would refuse any
     * other in any case.
     */
    const { data, error } = await supabase
      .from('institutions')
      .update(parsed.data)
      .eq('id', session.institutionId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('institution not found')

    await supabase.rpc('write_audit_log', {
      action: 'INSTITUTION_PROFILE_UPDATED',
      entity_type: 'institution',
      entity_id: data.id,
      metadata: {} as never,
    })

    revalidatePath('/institution/settings')
    revalidatePath('/institution')
    return { id: data.id }
  })
}
