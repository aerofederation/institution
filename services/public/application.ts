'use server'

import { createHash, randomBytes } from 'node:crypto'

import { cookies } from 'next/headers'

import { trackingUrl } from '@/lib/email/links'
import { sendEmailBestEffort } from '@/lib/email/send'
import { applicationReceived } from '@/lib/email/templates'
import { AppError, action, conflict, notFound, type ActionResult } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  applicationAddressSchema,
  applicationDetailSchema,
  applicationDocumentSchema,
  applicationOrganizationSchema,
  applicationRepresentativeSchema,
} from '@/lib/validation/institution'
import { toFieldErrors } from '@/lib/validation/common'

/**
 * The public institution application.
 *
 * Used by people with no account, so none of this can rely on a session. A
 * draft is bound instead to a 256-bit secret held in an httpOnly cookie:
 *
 *   * the raw token lives only in the cookie, never in the database;
 *   * only its SHA-256 is stored, so a database read does not let anyone resume
 *     somebody else's application;
 *   * every mutation presents the hash, so knowing an application id is not
 *     enough to read or write a draft.
 *
 * Uploads never touch the browser's credentials. `anon` has no write grant on
 * any storage bucket; the server mints a signed upload URL bound to one object
 * under the application's own prefix, and the database rejects a metadata row
 * whose path falls outside that prefix.
 */

const DRAFT_COOKIE = 'afi_application'
const TOKEN_TTL_DAYS = 30

/** 25 MiB, matching both the bucket limit and the CHECK on file_size. */
const MAX_UPLOAD_BYTES = 26_214_400

const ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

type DraftRef = { applicationId: string; token: string }

async function readDraftCookie(): Promise<DraftRef | null> {
  const store = await cookies()
  const raw = store.get(DRAFT_COOKIE)?.value
  if (!raw) return null

  const [applicationId, token] = raw.split(':')
  if (!applicationId || !token) return null
  return { applicationId, token }
}

async function writeDraftCookie(ref: DraftRef) {
  const store = await cookies()
  store.set(DRAFT_COOKIE, `${ref.applicationId}:${ref.token}`, {
    httpOnly: true,
    sameSite: 'lax',
    // Secure in production; a localhost dev server is not served over TLS.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60,
  })
}

async function clearDraftCookie() {
  const store = await cookies()
  store.delete(DRAFT_COOKIE)
}

/** The draft the current visitor holds, or null. */
export async function getCurrentDraft(): Promise<ActionResult<Record<string, unknown> | null>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) return null

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_get_application', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
    })

    if (error) throw error
    // A stale cookie (deleted draft, rotated token) resolves to nothing rather
    // than an error the applicant cannot act on.
    return (data as Record<string, unknown> | null) ?? null
  })
}

export async function startApplication(
  input: unknown,
): Promise<ActionResult<{ applicationId: string }>> {
  return action(async () => {
    const parsed = applicationOrganizationSchema.safeParse(input)

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'application step 1 rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    /*
     * The tracking address starts as the institution's official email, because
     * that is the only address available at step 1 and the column is NOT NULL.
     *
     * It is re-pointed at the authorised representative when step 3 saves —
     * see `saveApplicationStep`. A generic office@ inbox is often not reachable
     * by the person actually filling the form, and being unable to receive your
     * own tracking code is a dead end.
     */
    const applicantEmail = parsed.data.official_email

    // An existing draft is updated rather than duplicated, so a refresh on
    // step 1 does not leave two applications behind.
    const existing = await readDraftCookie()
    if (existing) {
      const saved = await saveApplicationStep('organization', input)
      if (saved.ok) return { applicationId: existing.applicationId }
    }

    const token = randomBytes(32).toString('hex')
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('public_start_application', {
      token_hash: sha256(token),
      institution_name: parsed.data.institution_name,
      institution_type: parsed.data.institution_type,
      category: parsed.data.category,
      official_email: parsed.data.official_email,
      applicant_email: applicantEmail,
    })

    if (error) throw error
    const applicationId = data as unknown as string

    await writeDraftCookie({ applicationId, token })

    // Everything beyond the four required columns goes in as a patch.
    await saveApplicationStep('organization', input)

    return { applicationId }
  })
}

const STEP_SCHEMAS = {
  organization: applicationOrganizationSchema,
  address: applicationAddressSchema,
  representative: applicationRepresentativeSchema,
  detail: applicationDetailSchema,
} as const

export type ApplicationStep = keyof typeof STEP_SCHEMAS

export async function saveApplicationStep(
  step: ApplicationStep,
  input: unknown,
): Promise<ActionResult<{ saved: true }>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) throw notFound('no application in progress')

    const schema = STEP_SCHEMAS[step]
    if (!schema) throw new AppError('VALIDATION', `unknown step ${step}`)

    const parsed = schema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', `application step ${step} rejected`, {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    // Undefined keys are dropped so a partially-filled step cannot blank out a
    // field the applicant already completed in an earlier pass.
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    )

    /*
     * The tracking address follows the authorised representative.
     *
     * It starts as the institution's official email because that is all step 1
     * has, but that is frequently a shared office@ inbox the person filling the
     * form cannot read — and the confirmation and every tracking code go there.
     * The representative is by definition the person corresponding with HQ, so
     * once step 3 is saved their address becomes the tracking address.
     */
    if (step === 'representative' && 'representative_email' in patch) {
      patch.applicant_email = patch.representative_email
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_save_application', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
      patch: patch as never,
    })

    if (error) throw error
    if (data !== true) {
      throw conflict('this application can no longer be edited')
    }

    return { saved: true as const }
  })
}

// ── Documents ───────────────────────────────────────────────────────────────

export type UploadTicket = {
  documentId: string
  uploadUrl: string
  token: string
  path: string
}

/**
 * Mints a one-object signed upload URL and records the metadata.
 *
 * The service role is required because `anon` has no write grant on any bucket
 * — which is the point. Rather than opening the bucket to the public, the
 * server checks the draft token, validates the declared type and size, and
 * issues a URL that is good for exactly one path under this application's own
 * prefix.
 */
export async function requestDocumentUpload(input: {
  document_type: string
  file_name: string
  mime_type: string
  file_size: number
}): Promise<ActionResult<UploadTicket>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) throw notFound('no application in progress')

    const parsed = applicationDocumentSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'document rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { document_type, file_name, mime_type, file_size } = parsed.data

    // Re-checked here as well as in the schema: this is the boundary the
    // browser cannot reach past.
    if (!ALLOWED_MIME.has(mime_type)) {
      throw new AppError('VALIDATION', `rejected mime type ${mime_type}`, {
        publicMessage: 'That file type is not accepted. Use PDF, JPEG, PNG, WebP or Word.',
      })
    }
    if (file_size > MAX_UPLOAD_BYTES) {
      throw new AppError('VALIDATION', `file too large: ${file_size}`, {
        publicMessage: 'Files must be 25 MB or smaller.',
      })
    }

    const extension = file_name.includes('.') ? file_name.split('.').pop()!.toLowerCase() : 'bin'
    const safeExtension = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin'
    const path = `applications/${ref.applicationId}/${randomBytes(16).toString('hex')}.${safeExtension}`

    const admin = createAdminClient()
    const { data: signed, error: signError } = await admin.storage
      .from('institution-documents')
      .createSignedUploadUrl(path)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the upload')
    }

    const supabase = await createClient()
    const { data: documentId, error } = await supabase.rpc('public_attach_document', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
      document_type,
      file_name,
      storage_path: path,
      mime_type,
      file_size,
    })

    if (error) {
      // Do not leave an object behind that no row points at.
      await admin.storage.from('institution-documents').remove([path])
      throw error
    }

    return {
      documentId: documentId as unknown as string,
      uploadUrl: signed.signedUrl,
      token: signed.token,
      path,
    }
  })
}

export type AttachedDocument = {
  id: string
  document_type: string
  file_name: string
  file_size: number
  verification_status: string
  rejection_reason: string | null
  created_at: string
}

export async function listApplicationDocuments(): Promise<ActionResult<AttachedDocument[]>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) return []

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_list_documents', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
    })

    if (error) throw error
    return (data ?? []) as AttachedDocument[]
  })
}

export async function removeApplicationDocument(
  documentId: string,
): Promise<ActionResult<{ removed: true }>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) throw notFound('no application in progress')

    const supabase = await createClient()
    const { data: path, error } = await supabase.rpc('public_remove_document', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
      document_id: documentId,
    })

    if (error) throw error
    if (!path) throw notFound('document not found')

    // The row is authoritative; a failed object delete leaves an orphan for the
    // reaper rather than blocking the applicant.
    await createAdminClient()
      .storage.from('institution-documents')
      .remove([path as unknown as string])

    return { removed: true as const }
  })
}

// ── Submission ──────────────────────────────────────────────────────────────

export type SubmissionReceipt = {
  applicationRef: string
  institutionName: string
  submittedAt: string
  applicantEmail: string
}

export async function submitApplication(): Promise<ActionResult<SubmissionReceipt>> {
  return action(async () => {
    const ref = await readDraftCookie()
    if (!ref) throw notFound('no application in progress')

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_submit_application', {
      application_id: ref.applicationId,
      token_hash: sha256(ref.token),
    })

    if (error) {
      if (error.code === '23514') {
        throw conflict(error.message)
      }
      throw error
    }

    const receipt = data as unknown as {
      application_ref: string
      institution_name: string
      submitted_at: string
      applicant_email: string
    }

    // The draft secret has done its job; holding it after submission only
    // widens the window in which a shared machine could reopen the form.
    await clearDraftCookie()

    /*
     * The reference is the only way back into the application, and the screen
     * that shows it is one refresh away from being gone. Best-effort: the
     * submission has committed, and the applicant can still recover the
     * reference through tracking if this message never arrives.
     */
    await sendEmailBestEffort({
      to: receipt.applicant_email,
      document: applicationReceived({
        institutionName: receipt.institution_name,
        applicationRef: receipt.application_ref,
        submittedAt: new Date(receipt.submitted_at).toUTCString(),
        trackingUrl: trackingUrl(),
      }),
      context: { applicationRef: receipt.application_ref },
    })

    return {
      applicationRef: receipt.application_ref,
      institutionName: receipt.institution_name,
      submittedAt: receipt.submitted_at,
      applicantEmail: receipt.applicant_email,
    }
  })
}
