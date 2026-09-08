import 'server-only'

import { AppError } from '@/lib/errors'
import type { EmailDocument } from '@/lib/email/render'

import { getFromAddress, getTransporter } from './transporter'

/**
 * The single seam every outgoing message passes through.
 *
 * Phase 2 delivers straight to SMTP. The intended end state is an
 * `email_outbox` table with a worker draining it, so that an SMTP outage cannot
 * fail an institution approval or hang a user-facing action — that table
 * arrives with the notification workflows in a later phase. Keeping every
 * caller behind this one function is what makes that change a one-file edit
 * instead of a hunt through the codebase.
 *
 * Callers pass a rendered `EmailDocument` from `lib/email/templates`. There is
 * deliberately no way to pass raw HTML through this function: templates are
 * reviewed, escape their inputs, and always carry a plain-text alternative.
 */

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string }

export type SendOptions = {
  to: string | string[]
  document: EmailDocument
  /** Reply target for messages a human should be able to answer. */
  replyTo?: string
  /** Correlates the message with the action that caused it, for the logs. */
  context?: Record<string, string | number>
}

export async function sendEmail(options: SendOptions): Promise<SendResult> {
  const { to, document, replyTo, context } = options
  const recipients = Array.isArray(to) ? to : [to]

  if (recipients.length === 0) {
    return { ok: false, reason: 'No recipients' }
  }

  try {
    const info = await getTransporter().sendMail({
      from: getFromAddress(),
      to: recipients.join(', '),
      subject: document.subject,
      html: document.html,
      text: document.text,
      ...(replyTo ? { replyTo } : {}),
      headers: {
        // Transactional mail: keep it out of bulk-mail heuristics and stop
        // auto-responders from replying to the platform.
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'All',
      },
    })

    return { ok: true, messageId: info.messageId }
  } catch (error) {
    const reason =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Unknown SMTP failure'

    // Recipients are logged; message bodies and credentials are not.
    console.error('[afi:email] delivery failed', {
      subject: document.subject,
      recipients: recipients.length,
      ...context,
      reason,
    })

    return { ok: false, reason }
  }
}

/**
 * Sends without letting a delivery failure propagate.
 *
 * Used where email is a side effect of a successful action — an account has
 * been provisioned, an application has been approved — and the database change
 * has already committed. Failing the user's request at that point would report
 * a failure for work that actually succeeded. The failure is logged and, once
 * the outbox lands, becomes a retry instead.
 */
export async function sendEmailBestEffort(options: SendOptions): Promise<void> {
  const result = await sendEmail(options)
  if (!result.ok) {
    console.warn('[afi:email] non-blocking delivery failure', {
      subject: options.document.subject,
      ...options.context,
      reason: result.reason,
    })
  }
}
