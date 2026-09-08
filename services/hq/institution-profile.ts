'use server'

import { revalidatePath } from 'next/cache'

import { requireHq } from '@/lib/auth/hq'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { hqInstitutionUpdateSchema } from '@/lib/validation/institution'

/**
 * HQ correcting the federation's record of an institution.
 *
 * The capability is narrow on purpose. HQ can fix what the federation holds
 * about an institution — its name, its contact details, its address, and the
 * type and category it was classified as at approval. HQ cannot change its
 * standing: `status`, `suspended_at`, `suspension_reason`, `approved_at` and
 * `approved_by` are not in the schema, so a request cannot express them.
 * Suspension is `setInstitutionStatus`, which demands a reason and writes its
 * own audit entry.
 *
 * `slug` is likewise absent. It is derived from the name at approval and is a
 * public URL; silently changing it would break every link anybody holds.
 *
 * The audit entry records which fields changed rather than their values. An
 * administrator reviewing the log needs to know that somebody edited an
 * institution's registered address; copying the address into the log would put
 * a second copy of it somewhere with different retention.
 */
export async function updateInstitutionDetails(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    await requireHq('institution.update_all')

    const parsed = hqInstitutionUpdateSchema.safeParse(input)

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'institution details rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { institution_id, ...fields } = parsed.data
    const supabase = await createClient()

    const { data: before, error: readError } = await supabase
      .from('institutions')
      .select(
        'id, name, official_email, official_phone, website, description, field_of_work, registration_number, year_established, address_line, city, state, country, postal_code, institution_type, category',
      )
      .eq('id', institution_id)
      .maybeSingle()

    if (readError) throw readError
    if (!before) throw notFound('institution not found')

    const changed = Object.keys(fields).filter((key) => {
      const next = (fields as Record<string, unknown>)[key] ?? null
      const current = (before as Record<string, unknown>)[key] ?? null
      return String(next) !== String(current)
    })

    if (changed.length === 0) return { id: before.id }

    const { data, error } = await supabase
      .from('institutions')
      .update(fields)
      .eq('id', institution_id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('institution not found')

    await supabase.rpc('write_audit_log', {
      action: 'INSTITUTION_DETAILS_EDITED_BY_HQ',
      entity_type: 'institution',
      entity_id: data.id,
      // Field names, not values.
      metadata: { fields: changed } as never,
    })

    revalidatePath('/hq/institutions')
    revalidatePath(`/hq/institutions/${institution_id}`)
    return { id: data.id }
  })
}
