import 'server-only'

import nodemailer, { type Transporter } from 'nodemailer'

import { serverEnv } from '@/lib/env/server'
import { AppError, configurationError } from '@/lib/errors'

/**
 * Nodemailer transport.
 *
 * Pooled and cached for the lifetime of the process: SMTP connection setup and
 * TLS negotiation are expensive, and transactional volume on this platform is
 * bursty (an institution approval fans out to a batch of activation emails).
 *
 * Credentials are read through `serverEnv()`, which imports `server-only`, so
 * importing this module from a Client Component is a build error rather than a
 * leak. Nothing in this file ever logs, returns or serialises a credential —
 * `describeTransport()` exists precisely so that diagnostics have something
 * safe to print.
 */

let cached: Transporter | null = null

export function getTransporter(): Transporter {
  if (cached) return cached

  const env = serverEnv()

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    // Implicit TLS on 465; STARTTLS is negotiated on 587 and 25.
    secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  return cached
}

export function getFromAddress(): string {
  const env = serverEnv()
  return `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM}>`
}

/**
 * A redacted description of the mail configuration, safe to log or surface in
 * an operator health check. Host and port identify a misconfiguration; the
 * username is reduced to a shape, and the password is never touched at all.
 */
export function describeTransport(): {
  configured: boolean
  host?: string
  port?: number
  secure?: boolean
  user?: string
  from?: string
  missing?: string[]
} {
  try {
    const env = serverEnv()
    return {
      configured: true,
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE || env.SMTP_PORT === 465,
      user: maskUser(env.SMTP_USER),
      from: env.SMTP_FROM,
    }
  } catch (error) {
    return {
      configured: false,
      missing: extractMissingKeys(error),
    }
  }
}

function maskUser(user: string): string {
  const [local, domain] = user.split('@')
  if (!domain) return `${local.slice(0, 2)}***`
  return `${local.slice(0, 2)}***@${domain}`
}

/**
 * Pulls variable names out of the serverEnv() validation error.
 *
 * zod's `prettifyError` reports each problem as a message line followed by
 * `→ at SMTP_HOST`, so the path marker is what identifies the variable. The
 * second pattern is a fallback for any plainer formatting.
 */
function extractMissingKeys(error: unknown): string[] {
  const message = error instanceof Error ? error.message : String(error)

  const fromPaths = [...message.matchAll(/→\s*at\s+([A-Z][A-Z0-9_]*)/g)].map((m) => m[1])
  if (fromPaths.length) return [...new Set(fromPaths)]

  const fromLines = [...message.matchAll(/^\s*([A-Z][A-Z0-9_]{2,})/gm)].map((m) => m[1])
  return [...new Set(fromLines)]
}

/**
 * Opens a connection and runs the SMTP handshake without sending anything.
 *
 * Used by the operator health check so a broken mail configuration is found
 * deliberately rather than discovered when an institution approval silently
 * fails to notify anyone.
 */
export async function verifyTransport(): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await getTransporter().verify()
    return { ok: true }
  } catch (error) {
    if (error instanceof AppError) return { ok: false, reason: error.publicMessage }
    // Nodemailer error messages describe the host and failure mode, not the
    // credential, so this is safe to return to an authenticated operator.
    return { ok: false, reason: error instanceof Error ? error.message : 'Unknown SMTP failure' }
  }
}

export function assertMailConfigured(): void {
  const description = describeTransport()
  if (!description.configured) {
    throw configurationError(
      `SMTP is not configured: missing ${description.missing?.join(', ') || 'environment variables'}`,
    )
  }
}

/** Test seam: drops the cached transport so a new configuration is picked up. */
export function resetTransporter(): void {
  cached?.close?.()
  cached = null
}
