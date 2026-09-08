'use server'

import { createHash, randomInt } from 'node:crypto'

import { AppError, action, type ActionResult } from '@/lib/errors'
import { publicEnv } from '@/lib/env/public'
import { sendEmailBestEffort } from '@/lib/email/send'
import { applicationTrackingCode } from '@/lib/email/templates'
import { createClient } from '@/lib/supabase/server'
import { applicationLookupSchema, applicationOtpSchema } from '@/lib/validation/institution'
import { toFieldErrors } from '@/lib/validation/common'

/**
 * Application tracking.
 *
 * Knowing an application reference is deliberately not sufficient to read an
 * application — it carries contact details, documents and review
 * correspondence. The reference must be presented with the email address on
 * file, and a one-time code is then sent to that address.
 *
 * Two properties are load-bearing and are implemented here rather than left to
 * the UI:
 *
 *   * **Uniform responses.** Requesting a code reports success whether or not
 *     the reference and email match. Any difference — a message, a status code,
 *     a timing gap — would turn this into an oracle for discovering which
 *     institutions have applied to the federation.
 *
 *   * **Codes are hashed.** Only the SHA-256 reaches the database. The database
 *     counts attempts and refuses after five, so a six-digit code cannot be
 *     brute-forced inside its fifteen-minute life.
 */

const CODE_TTL_MINUTES = 15

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

/**
 * Six digits from a cryptographically secure source.
 *
 * `Math.random()` is predictable enough to be guessable when it gates access to
 * an institution's correspondence.
 */
function generateCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function requestTrackingCode(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<{ applicationRef: string }>> {
  return action(async () => {
    const parsed = applicationLookupSchema.safeParse({
      application_ref: formData.get('application_ref'),
      email: formData.get('email'),
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'tracking lookup rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const { application_ref, email } = parsed.data
    const code = generateCode()
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('public_request_application_access', {
      application_ref,
      applicant_email: email,
      code_hash: sha256(code),
      ttl_minutes: CODE_TTL_MINUTES,
    })

    if (error) {
      // Logged for operators; the caller still sees the uniform response.
      console.warn('[afi:tracking] code request failed', error.message)
    }

    // `data` is the application id on a match and null otherwise. The email is
    // sent only on a match — but the response below is identical either way.
    if (data) {
      await sendEmailBestEffort({
        to: email,
        document: applicationTrackingCode({
          applicationRef: application_ref,
          code,
          expiresInMinutes: CODE_TTL_MINUTES,
        }),
        context: { applicationRef: application_ref },
      })
    }

    return { applicationRef: application_ref }
  })
}

export type TrackedApplication = {
  application_ref: string
  institution_name: string
  institution_type: string
  status: string
  submitted_at: string | null
  created_at: string
  updated_at: string
  city: string | null
  state: string | null
  history: {
    to_status: string
    from_status: string | null
    comments: string | null
    actor_kind: string
    created_at: string
  }[]
  documents: {
    document_type: string
    file_name: string
    verification_status: string
    rejection_reason: string | null
  }[]
}

export async function verifyTrackingCode(
  _previous: unknown,
  formData: FormData,
): Promise<ActionResult<TrackedApplication>> {
  return action(async () => {
    const parsed = applicationOtpSchema.safeParse({
      application_ref: formData.get('application_ref'),
      code: formData.get('code'),
    })

    if (!parsed.success) {
      throw new AppError('VALIDATION', 'code rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('public_verify_application_access', {
      application_ref: parsed.data.application_ref,
      code_hash: sha256(parsed.data.code),
    })

    if (error) throw error

    if (!data) {
      // Expired, already used, wrong, or too many attempts — all the same
      // message, so the response says nothing about which.
      throw new AppError('UNAUTHENTICATED', 'tracking code rejected', {
        publicMessage: 'That code is not valid. Request a new one and try again.',
      })
    }

    return data as unknown as TrackedApplication
  })
}

/** The tracking page URL, for emails that link back to it. */
export async function trackingUrl(): Promise<string> {
  try {
    return `${publicEnv().NEXT_PUBLIC_APP_URL}/application-status`
  } catch {
    return '/application-status'
  }
}
