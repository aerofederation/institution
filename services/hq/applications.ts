'use server'

import { revalidatePath } from 'next/cache'

import { requireHq } from '@/lib/auth/hq'
import { humaniseEnum } from '@/lib/constants/enums'
import { trackingUrl } from '@/lib/email/links'
import { sendEmailBestEffort } from '@/lib/email/send'
import { applicationStatusChanged } from '@/lib/email/templates'
import { AppError, action, conflict, notFound, type ActionResult } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

import { applicationDecisionSchema } from '@/lib/validation/institution'
import { toFieldErrors } from '@/lib/validation/common'

import { inviteAdminForInstitution, inviteInstitutionAdmin } from './institution-admin'

/**
 * HQ decisions on institution applications.
 *
 * These are the platform's highest-impact administrative actions: approving one
 * brings a tenant into existence. Three things are therefore true of every
 * function here.
 *
 * 1. **Authorisation first.** `requireHq(permission)` runs before anything is
 *    read, and the permission is the specific one the action needs — being HQ
 *    is not the same as being allowed to approve.
 *
 * 2. **The database owns the state machine.** Legal transitions are declared in
 *    `private.application_transition_allowed()` and enforced by trigger. This
 *    layer does not re-implement them; an illegal transition raises `23514`
 *    from PostgreSQL and surfaces as a conflict. The status history row is
 *    written by that same trigger, so a decision cannot be recorded untraced.
 *
 * 3. **Approval provisions for real.** It creates the institution, links it to
 *    the application and transitions the status — not a status flip with a
 *    to-do attached.
 */

/** `Delhi Institute of Aeronautics` → `delhi-institute-of-aeronautics`. */
function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
    .slice(0, 70)
}

/**
 * Finds a free slug.
 *
 * The slug is a unique column and a public URL, so a second "Aerospace
 * Institute" must not fail the whole approval. Suffixes are appended until one
 * is free rather than surfacing a constraint violation to the reviewer.
 */
async function availableSlug(base: string): Promise<string> {
  const admin = createAdminClient()
  const root = base || 'institution'

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? root : `${root}-${attempt + 1}`
    const { data, error } = await admin
      .from('institutions')
      .select('id')
      .eq('slug', candidate)
      .maybeSingle()
    if (error) throw error
    if (!data) return candidate
  }

  return `${root}-${Date.now().toString(36)}`
}

/**
 * What the reviewer needs to know afterwards.
 *
 * `adminInvited` and `adminEmailed` are separate on purpose. Provisioning the
 * administrator and delivering their link are different failures with different
 * remedies, and collapsing them would let a silent SMTP problem look like a
 * completed approval.
 */
export type DecisionOutcome = {
  status: string
  institutionId: string | null
  adminInvited: boolean
  adminEmailed: boolean
  adminEmail: string | null
}

export type DecisionInput = {
  application_id: string
  decision: 'UNDER_REVIEW' | 'DOCUMENTS_REQUIRED' | 'RESUBMISSION_REQUIRED' | 'APPROVED' | 'REJECTED'
  comments?: string | null
  required_actions?: string[]
}

export async function decideApplication(
  input: DecisionInput,
): Promise<ActionResult<DecisionOutcome>> {
  return action(async () => {
    const parsed = applicationDecisionSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'application decision rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { application_id, decision, comments, required_actions } = parsed.data

    // Permission is chosen per decision — approving and asking for a document
    // are not the same authority.
    const permission =
      decision === 'APPROVED'
        ? 'institution.approve'
        : decision === 'REJECTED'
          ? 'institution.reject'
          : decision === 'UNDER_REVIEW'
            ? 'application.review'
            : 'application.request_documents'

    const session = await requireHq(permission)
    const supabase = await createClient()

    const { data: application, error: readError } = await supabase
      .from('institution_applications')
      .select('id, status, application_ref, applicant_email, institution_name, institution_type, category, official_email, official_phone, website, description, field_of_work, address_line, city, state, country, postal_code, registration_number, year_established, institution_id, representative_name, representative_email, representative_designation')
      .eq('id', application_id)
      .is('deleted_at', null)
      .maybeSingle()

    if (readError) throw readError
    if (!application) throw notFound('application not found')

    let institutionId = application.institution_id

    // ── Approval provisions the tenant ────────────────────────────────────
    if (decision === 'APPROVED' && !institutionId) {
      /*
       * The service role is required here and only here in this file.
       * `institutions` has no INSERT policy for `authenticated` by design —
       * a tenant comes into existence through this workflow or not at all —
       * so the insert cannot run under the reviewer's own RLS context.
       *
       * Authorisation has already happened above; bypassing RLS is not a
       * licence to skip it. The composite tenant foreign keys and every CHECK
       * constraint still apply to the service role, because they are schema.
       */
      const admin = createAdminClient()
      const slug = await availableSlug(slugify(application.institution_name))

      const { data: institution, error: createError } = await admin
        .from('institutions')
        .insert({
          slug,
          name: application.institution_name,
          institution_type: application.institution_type,
          category: application.category,
          official_email: application.official_email,
          official_phone: application.official_phone,
          website: application.website,
          description: application.description,
          field_of_work: application.field_of_work,
          address_line: application.address_line,
          city: application.city,
          state: application.state,
          country: application.country,
          postal_code: application.postal_code,
          registration_number: application.registration_number,
          year_established: application.year_established,
          source_application_id: application.id,
          status: 'ACTIVE',
          approved_at: new Date().toISOString(),
          approved_by: session.userId,
        })
        .select('id')
        .single()

      if (createError) throw createError
      institutionId = institution.id

      // Link before the transition: `applications_approved_coherent` requires
      // an institution on any APPROVED row, so the order is not cosmetic.
      const { error: linkError } = await admin
        .from('institution_applications')
        .update({ institution_id: institutionId })
        .eq('id', application.id)

      if (linkError) throw linkError

      // Carry the application's documents over to the new tenant so they are
      // reachable from the institution record rather than stranded.
      await admin
        .from('institution_documents')
        .update({ institution_id: institutionId })
        .eq('institution_application_id', application.id)
        .is('institution_id', null)
    }

    // ── The transition itself ─────────────────────────────────────────────
    // `transition_application` is SECURITY INVOKER: RLS still applies, and the
    // BEFORE UPDATE trigger validates legality and writes the history row.
    const note =
      required_actions && required_actions.length > 0
        ? [comments, ...required_actions.map((item) => `• ${item}`)].filter(Boolean).join('\n')
        : (comments ?? null)

    const { error: transitionError } = await supabase.rpc('transition_application', {
      target_id: application.id,
      new_status: decision,
      comments: note,
    })

    if (transitionError) {
      // 23514 is the state-machine trigger refusing an illegal move.
      if (transitionError.code === '23514') {
        throw conflict(
          `transition ${application.status} -> ${decision} is not permitted`,
        )
      }
      throw transitionError
    }

    await supabase.rpc('write_audit_log', {
      action: `APPLICATION_${decision}`,
      entity_type: 'institution_application',
      entity_id: application.id,
      metadata: {
        application_ref: application.institution_name,
        institution_id: institutionId,
      } as never,
    })

    // ── The handoff to the applicant ──────────────────────────────────────
    /*
     * Everything below runs after the decision has committed. A tenant exists
     * and the history row is written; an SMTP outage must not undo that or
     * report a failure for work that succeeded. So these steps report their own
     * outcome rather than throwing.
     */
    let adminInvited = false
    let adminEmailed = false
    let adminEmail: string | null = null

    if (decision === 'APPROVED' && institutionId) {
      /*
       * The authorised representative becomes the first administrator. They are
       * the person who signed the application and corresponded with HQ, and
       * `applicant_email` already follows them. The official address is a
       * fallback only — it is frequently a shared inbox nobody in particular
       * reads, which is a poor place to send the credential that opens a tenant.
       */
      const inviteeEmail =
        application.representative_email ?? application.applicant_email ?? application.official_email
      const inviteeName = application.representative_name ?? 'Institution administrator'

      try {
        const invitation = await inviteInstitutionAdmin({
          institutionId,
          institutionName: application.institution_name,
          email: inviteeEmail,
          fullName: inviteeName,
          designation: application.representative_designation,
          roleLabel: application.representative_designation
            ? `institution administrator (${application.representative_designation})`
            : 'institution administrator',
        })

        adminInvited = true
        adminEmailed = invitation.emailed
        adminEmail = invitation.email
      } catch (error) {
        // The institution is live and approved either way. This is recoverable
        // by reissuing the invitation, so it is surfaced rather than fatal.
        console.error('[afi:approval] administrator could not be provisioned', {
          institutionId,
          applicationRef: application.application_ref,
          reason: error instanceof Error ? error.message : 'unknown',
        })
      }
    }

    /*
     * The applicant is told what happened. APPROVED is excluded: its own
     * activation email is the message that matters, and sending both would
     * arrive as two near-identical notices moments apart.
     */
    if (decision !== 'APPROVED' && application.application_ref) {
      await sendEmailBestEffort({
        to: application.applicant_email,
        document: applicationStatusChanged({
          institutionName: application.institution_name,
          applicationRef: application.application_ref,
          status: decision,
          statusLabel: humaniseEnum(decision),
          comments,
          requiredActions: required_actions,
          trackingUrl: trackingUrl(),
        }),
        context: { applicationRef: application.application_ref, decision },
      })
    }

    revalidatePath('/hq/applications')
    revalidatePath(`/hq/applications/${application.id}`)
    revalidatePath('/hq/institutions')
    revalidatePath('/hq')

    return { status: decision, institutionId, adminInvited, adminEmailed, adminEmail }
  })
}

/** Marks a submitted document verified or rejected. */
export async function reviewDocument(input: {
  document_id: string
  verification_status: 'VERIFIED' | 'REJECTED'
  rejection_reason?: string | null
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await requireHq('document.verify')

    if (input.verification_status === 'REJECTED' && !input.rejection_reason?.trim()) {
      throw new AppError('VALIDATION', 'rejection requires a reason', {
        fieldErrors: { rejection_reason: ['State why the document was rejected'] },
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('institution_documents')
      .update({
        verification_status: input.verification_status,
        rejection_reason: input.rejection_reason?.trim() || null,
        reviewer_id: session.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', input.document_id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('document not found')

    await supabase.rpc('write_audit_log', {
      action: `DOCUMENT_${input.verification_status}`,
      entity_type: 'institution_document',
      entity_id: data.id,
      metadata: {} as never,
    })

    revalidatePath('/hq/documents')
    return { id: data.id }
  })
}

/** Suspends or reactivates an institution federation-wide. */
export async function setInstitutionStatus(input: {
  institution_id: string
  status: 'ACTIVE' | 'SUSPENDED'
  reason?: string | null
}): Promise<ActionResult<{ id: string; status: string }>> {
  return action(async () => {
    const session = await requireHq('institution.suspend')

    if (input.status === 'SUSPENDED' && !input.reason?.trim()) {
      throw new AppError('VALIDATION', 'suspension requires a reason', {
        fieldErrors: { reason: ['State why the institution is being suspended'] },
      })
    }

    const supabase = await createClient()

    /*
     * Suspending is not a cosmetic flag. `private.is_active()` checks the
     * institution as well as the profile, and every tenant RLS predicate calls
     * it — so this single update revokes access for every one of the
     * institution's users immediately, without touching a user row.
     */
    const { data, error } = await supabase
      .from('institutions')
      .update(
        input.status === 'SUSPENDED'
          ? {
              status: 'SUSPENDED',
              suspended_at: new Date().toISOString(),
              suspended_by: session.userId,
              suspension_reason: input.reason?.trim() ?? null,
            }
          : {
              status: 'ACTIVE',
              suspended_at: null,
              suspended_by: null,
              suspension_reason: null,
            },
      )
      .eq('id', input.institution_id)
      .select('id, status')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('institution not found')

    await supabase.rpc('write_audit_log', {
      action: input.status === 'SUSPENDED' ? 'INSTITUTION_SUSPENDED' : 'INSTITUTION_REACTIVATED',
      entity_type: 'institution',
      entity_id: data.id,
      metadata: {} as never,
    })

    revalidatePath('/hq/institutions')
    revalidatePath(`/hq/institutions/${input.institution_id}`)
    return { id: data.id, status: data.status }
  })
}

/**
 * Issues — or reissues — the invitation for an institution's administrator.
 *
 * Activation links expire after 72 hours and are single-use, so an institution
 * whose administrator never opened theirs would otherwise be permanently
 * unreachable, with a live tenant and nobody able to sign in. This is also the
 * repair path for an approval whose email failed at the SMTP layer.
 *
 * The recipient is taken from the institution's originating application rather
 * than accepted as an argument. An HQ reviewer choosing a destination address
 * would make this a way to attach an arbitrary account to any tenant; taking it
 * from the record means the invitation can only ever reach the representative
 * who applied.
 */
export async function reissueAdminInvitation(input: {
  institution_id: string
}): Promise<ActionResult<{ email: string; emailed: boolean }>> {
  return action(async () => {
    await requireHq('institution.approve')

    const supabase = await createClient()
    const { data: institution, error } = await supabase
      .from('institutions')
      .select('id')
      .eq('id', input.institution_id)
      .maybeSingle()

    if (error) throw error
    if (!institution) throw notFound('institution not found')

    const invitation = await inviteAdminForInstitution(institution.id)

    await supabase.rpc('write_audit_log', {
      action: 'INSTITUTION_ADMIN_INVITED',
      entity_type: 'institution',
      entity_id: institution.id,
      metadata: { emailed: invitation.emailed } as never,
    })

    revalidatePath(`/hq/institutions/${institution.id}`)
    return { email: invitation.email, emailed: invitation.emailed }
  })
}
