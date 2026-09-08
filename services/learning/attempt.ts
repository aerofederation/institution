'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { attemptAnswerSchema, integrityEventSchema } from '@/lib/validation/assessment'

/**
 * Sitting a paper, from the student's side.
 *
 * Every function here is a thin wrapper over a SECURITY DEFINER routine. That is
 * the design, not laziness: the answer key, the clock and the score have to be
 * decided somewhere a browser cannot reach, and a Server Action is not that
 * place — it is code the client asks to run.
 *
 * So this layer authorises, validates the shape, and passes the request on. It
 * computes nothing about correctness or timing.
 */

export type PaperQuestion = {
  id: string
  position: number
  section_id: string | null
  question_type: string
  prompt: string
  passage: string | null
  media_path: string | null
  marks: number
  negative_marks: number
  blank_count: number
  allowed_mime_types: string[]
  max_file_bytes: number | null
  options: { id: string; label: string; media_path: string | null }[]
  match_targets: string[]
  answer: {
    selected_option_ids: string[]
    text_answer: string | null
    answer_payload: Record<string, unknown>
    file_name: string | null
  } | null
}

export type Paper = {
  attempt_id: string
  assessment_id: string
  title: string
  kind: string
  instructions: string | null
  duration_minutes: number | null
  expires_at: string | null
  /** The database's clock at the moment the paper was served. */
  server_now: string
  /** Set while the attempt is paused; the countdown is frozen. */
  paused_at: string | null
  allow_pause: boolean
  status: string
  attempt_no: number
  total_marks: number
  marked_for_review: string[]
  sections: { id: string; title: string; instructions: string | null }[]
  questions: PaperQuestion[]
}

export async function startAttempt(input: {
  assessment_id: string
}): Promise<ActionResult<{ attemptId: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_start_attempt', {
      target_assessment_id: input.assessment_id,
    })

    if (error) {
      /*
       * 22023 is the function declining on a rule the student can understand —
       * not open yet, closed, out of attempts, no questions. Its message is
       * written to be read, so it is passed through rather than replaced.
       */
      if (error.code === '22023') {
        throw new AppError('CONFLICT', error.message, { publicMessage: error.message })
      }
      throw error
    }

    return { attemptId: data as unknown as string }
  })
}

/** The paper as this student may see it. Contains no answer key. */
export async function getPaper(attemptId: string): Promise<Paper | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('student_get_paper', {
    target_attempt_id: attemptId,
  })

  if (error) throw error
  return (data ?? null) as unknown as Paper | null
}

export async function saveAttemptAnswer(
  input: unknown,
): Promise<ActionResult<{ saved: boolean; reason?: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })

    const parsed = attemptAnswerSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'answer rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('student_answer_question', {
      target_attempt_id: parsed.data.attempt_id,
      target_question_id: parsed.data.question_id,
      option_ids: parsed.data.option_ids,
      answer_text: parsed.data.text_answer ?? null,
      payload: (parsed.data.payload ?? {}) as never,
    })

    if (error) throw error

    /*
     * The function reports *why* it declined rather than merely failing:
     * `expired`, `not_active`, `not_in_paper`. The UI can then say something
     * true instead of "save failed".
     */
    const outcome = data as unknown as { saved: boolean; reason?: string }
    return { saved: outcome.saved === true, reason: outcome.reason }
  })
}

export async function markForReview(input: {
  attempt_id: string
  question_ids: string[]
}): Promise<ActionResult<{ saved: boolean }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_mark_for_review', {
      target_attempt_id: input.attempt_id,
      question_ids: input.question_ids,
    })

    if (error) throw error
    return { saved: data === true }
  })
}

export async function submitAttempt(input: {
  attempt_id: string
}): Promise<ActionResult<{
  score: number
  maxScore: number
  percentage: number
  awaitingMarking: boolean
  released: boolean
  alreadySubmitted: boolean
}>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_submit_attempt', {
      target_attempt_id: input.attempt_id,
      expired: false,
    })

    if (error) throw error

    const result = data as unknown as {
      score: number
      max_score: number
      percentage: number
      awaiting_marking: boolean
      released: boolean
      already_submitted: boolean
    }

    revalidatePath('/student/assessments')

    return {
      score: result.score,
      maxScore: result.max_score,
      percentage: result.percentage,
      awaitingMarking: result.awaiting_marking,
      released: result.released,
      alreadySubmitted: result.already_submitted,
    }
  })
}

/**
 * Records one integrity signal.
 *
 * Best-effort and deliberately quiet: a failure here must never interrupt
 * somebody sitting an exam. What is stored is the event and its time — nothing
 * about the device, the network or the content of the tab.
 */
export async function recordIntegrityEvent(input: unknown): Promise<void> {
  const parsed = integrityEventSchema.safeParse(input)
  if (!parsed.success) return

  try {
    const session = await requireTenant()
    const supabase = await createClient()

    await supabase.from('assessment_integrity_events').insert({
      institution_id: session.institutionId,
      attempt_id: parsed.data.attempt_id,
      event: parsed.data.event,
    })
  } catch {
    // Swallowed on purpose. An integrity note is not worth a broken exam.
  }
}

export type AttemptResult = {
  attempt_id: string
  title: string
  kind: string
  status: string
  released: boolean
  awaiting_marking?: boolean
  release_policy?: string
  score?: number
  max_score?: number
  percentage?: number
  passed?: boolean | null
  pass_marks?: number | null
  is_late?: boolean
  penalty_applied?: number
  submitted_at: string | null
  reveal_answers?: boolean
  questions?: {
    id: string
    prompt: string
    question_type: string
    marks: number
    explanation: string | null
    is_correct: boolean | null
    marks_awarded: number
    feedback: string | null
    text_answer: string | null
    selected_option_ids: string[]
    options: { id: string; label: string; is_correct: boolean }[]
  }[]
}

export async function getAttemptResult(attemptId: string): Promise<AttemptResult | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('student_get_result', {
    target_attempt_id: attemptId,
  })

  if (error) {
    // 22023 means the attempt is still in progress, which is not an error worth
    // surfacing — the caller renders the paper instead.
    if (error.code === '22023') return null
    throw error
  }

  return (data ?? null) as unknown as AttemptResult | null
}

// ── File upload answers ─────────────────────────────────────────────────────

export type UploadTicket = {
  uploadUrl: string
  token: string
  path: string
}

/**
 * Mints a one-object signed upload URL for a FILE_UPLOAD answer.
 *
 * The service role is needed to sign, and only to sign. It does not decide
 * whether the upload is legitimate — `student_attach_file` does that when the
 * metadata is recorded, re-checking the attempt, the clock, the question and
 * the path against the database's own state.
 *
 * The path is fixed here rather than accepted from the client, and is confined
 * to this attempt's own prefix, so the URL cannot be pointed at somebody else's
 * object.
 */
export async function requestAnswerUpload(input: {
  attempt_id: string
  question_id: string
  file_name: string
}): Promise<ActionResult<UploadTicket>> {
  return action(async () => {
    const session = await authorize({ permission: 'assessment.attempt' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    // Readable only if it is this student's own live attempt.
    const { data: attempt } = await supabase
      .from('assessment_attempts')
      .select('id, student_id, status')
      .eq('id', input.attempt_id)
      .maybeSingle()

    if (!attempt || attempt.student_id !== session.userId || attempt.status !== 'IN_PROGRESS') {
      throw new AppError('FORBIDDEN', 'not your live attempt', {
        publicMessage: 'This attempt is not open.',
      })
    }

    const extension = input.file_name.includes('.')
      ? input.file_name.split('.').pop()!.toLowerCase()
      : 'bin'
    const safe = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin'
    const path = `${session.institutionId}/attempts/${input.attempt_id}/${randomBytes(16).toString('hex')}.${safe}`

    const { data: signed, error } = await createAdminClient()
      .storage.from('assignment-submissions')
      .createSignedUploadUrl(path)

    if (error || !signed) {
      throw new AppError('STORAGE', error?.message ?? 'could not prepare the upload')
    }

    return { uploadUrl: signed.signedUrl, token: signed.token, path }
  })
}

/** Records an uploaded file against a question, once the object is in place. */
export async function attachAnswerFile(input: {
  attempt_id: string
  question_id: string
  path: string
  file_name: string
  file_size: number
  mime_type: string
}): Promise<ActionResult<{ saved: boolean; reason?: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_attach_file', {
      target_attempt_id: input.attempt_id,
      target_question_id: input.question_id,
      path: input.path,
      original_name: input.file_name,
      size_bytes: input.file_size,
      content_type: input.mime_type,
    })

    if (error) throw error

    const outcome = data as unknown as { saved: boolean; reason?: string }
    return { saved: outcome.saved === true, reason: outcome.reason }
  })
}

/**
 * A short-lived link to an uploaded answer.
 *
 * The path comes from `assessment_answer_file()`, which returns one only to the
 * student who wrote it or the teacher who owns the paper. The bucket is private
 * and the URL expires in five minutes, so nothing here is a durable link.
 */
export async function getAnswerFileUrl(answerId: string): Promise<ActionResult<{ url: string }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    const { data: path, error } = await supabase.rpc('assessment_answer_file', {
      target_answer_id: answerId,
    })

    if (error) throw error
    if (!path) throw new AppError('NOT_FOUND', 'no file on that answer')

    const { data: signed, error: signError } = await createAdminClient()
      .storage.from('assignment-submissions')
      .createSignedUrl(path as unknown as string, 300)

    if (signError || !signed) {
      throw new AppError('STORAGE', signError?.message ?? 'could not prepare the download')
    }

    return { url: signed.signedUrl }
  })
}


// ── Pausing ─────────────────────────────────────────────────────────────────

/**
 * Stops the clock, if the paper allows it.
 *
 * Everything about the arithmetic happens in the database — how long was spent
 * paused, how much of that converts into extra time, and the ceiling imposed by
 * the paper's own closing time. This layer only asks.
 *
 * While paused, `student_answer_question` refuses saves. Without that, pausing
 * would mean "stop the clock and keep working".
 */
export async function pauseAttempt(input: {
  attempt_id: string
}): Promise<ActionResult<{ paused: boolean; reason?: string }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_pause_attempt', {
      target_attempt_id: input.attempt_id,
    })

    if (error) throw error
    const outcome = data as unknown as { paused: boolean; reason?: string }
    return { paused: outcome.paused === true, reason: outcome.reason }
  })
}

export async function resumeAttempt(input: {
  attempt_id: string
}): Promise<ActionResult<{ resumed: boolean; expiresAt: string | null }>> {
  return action(async () => {
    await authorize({ permission: 'assessment.attempt' })
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('student_resume_attempt', {
      target_attempt_id: input.attempt_id,
    })

    if (error) throw error
    const outcome = data as unknown as { resumed: boolean; expires_at: string | null }
    return { resumed: outcome.resumed === true, expiresAt: outcome.expires_at }
  })
}
