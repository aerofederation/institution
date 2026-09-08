/**
 * Application error taxonomy.
 *
 * Two rules govern everything here:
 *
 *   1. A browser never sees an internal message. `AppError.publicMessage` is
 *      the only thing that crosses the boundary; the original cause stays on
 *      the server for the logs.
 *   2. Authorization failures do not disclose existence. "Not found" and
 *      "not allowed" both surface as the same NOT_FOUND response wherever a
 *      distinction would tell an attacker that a record exists.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TENANT_MISMATCH'
  | 'ACCOUNT_INACTIVE'
  | 'DATABASE'
  | 'STORAGE'
  | 'EMAIL'
  | 'CONFIGURATION'
  | 'INTERNAL'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TENANT_MISMATCH: 403,
  ACCOUNT_INACTIVE: 403,
  DATABASE: 500,
  STORAGE: 500,
  EMAIL: 500,
  CONFIGURATION: 500,
  INTERNAL: 500,
}

/** Safe to show a user. Anything not in this map is replaced wholesale. */
const PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'That record could not be found.',
  VALIDATION: 'Some of the information provided is not valid.',
  CONFLICT: 'That action conflicts with the current state of the record.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  TENANT_MISMATCH: 'That record belongs to another institution.',
  ACCOUNT_INACTIVE: 'This account is not active. Contact your administrator.',
  DATABASE: 'Something went wrong while saving. Please try again.',
  STORAGE: 'The file could not be processed. Please try again.',
  EMAIL: 'The message could not be sent. Please try again shortly.',
  CONFIGURATION: 'The service is not configured correctly. Please contact support.',
  INTERNAL: 'Something went wrong. Please try again.',
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly publicMessage: string
  readonly fieldErrors?: Record<string, string[]>

  constructor(
    code: ErrorCode,
    /** Internal detail. Logged, never returned to a browser. */
    message?: string,
    options?: { cause?: unknown; publicMessage?: string; fieldErrors?: Record<string, string[]> },
  ) {
    super(message ?? PUBLIC_MESSAGE[code], { cause: options?.cause })
    this.name = 'AppError'
    this.code = code
    this.status = STATUS[code]
    this.publicMessage = options?.publicMessage ?? PUBLIC_MESSAGE[code]
    this.fieldErrors = options?.fieldErrors
  }
}

export const unauthenticated = (detail?: string) => new AppError('UNAUTHENTICATED', detail)
export const forbidden = (detail?: string) => new AppError('FORBIDDEN', detail)
export const notFound = (detail?: string) => new AppError('NOT_FOUND', detail)
export const conflict = (detail?: string) => new AppError('CONFLICT', detail)
export const tenantMismatch = (detail?: string) => new AppError('TENANT_MISMATCH', detail)
export const accountInactive = (detail?: string) => new AppError('ACCOUNT_INACTIVE', detail)
export const configurationError = (detail: string) => new AppError('CONFIGURATION', detail)

export function validationError(fieldErrors: Record<string, string[]>, detail?: string) {
  return new AppError('VALIDATION', detail, { fieldErrors })
}

/**
 * Maps a PostgreSQL error onto the taxonomy.
 *
 * The security-relevant cases are the ones the database raises on our behalf:
 * `42501` is what an RLS policy or a privilege-escalation trigger produces, and
 * `23503` is a composite tenant foreign key refusing a cross-institution
 * reference. Both are surfaced as an authorization failure, never as a
 * database error that hints at the schema.
 */
export function fromPostgresError(error: unknown): AppError {
  const pg = error as { code?: string; message?: string; details?: string; constraint?: string }
  const detail = [pg?.message, pg?.details, pg?.constraint].filter(Boolean).join(' | ')

  switch (pg?.code) {
    case '42501': // insufficient_privilege — RLS or an immutability trigger
      return new AppError('FORBIDDEN', detail, { cause: error })
    case '23503': // foreign_key_violation — includes composite tenant keys
      return new AppError('TENANT_MISMATCH', detail, { cause: error })
    case '23505': // unique_violation
      return new AppError('CONFLICT', detail, {
        cause: error,
        publicMessage: 'A record with those details already exists.',
      })
    case '23514': // check_violation — includes illegal workflow transitions
      return new AppError('CONFLICT', detail, {
        cause: error,
        publicMessage: 'That change is not allowed in the current state.',
      })
    case '23502': // not_null_violation
    case '22P02': // invalid_text_representation
    case '22023': // invalid_parameter_value
      return new AppError('VALIDATION', detail, { cause: error })
    case 'PGRST116': // PostgREST: no rows where exactly one was expected
      return new AppError('NOT_FOUND', detail, { cause: error })
    default:
      return new AppError('DATABASE', detail || 'Unknown database error', { cause: error })
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return fromPostgresError(error)
  }
  return new AppError('INTERNAL', error instanceof Error ? error.message : String(error), {
    cause: error,
  })
}

// ---------------------------------------------------------------------------
// Server Action results
// ---------------------------------------------------------------------------

export type ActionSuccess<T> = { ok: true; data: T }
export type ActionFailure = {
  ok: false
  code: ErrorCode
  message: string
  fieldErrors?: Record<string, string[]>
}
export type ActionResult<T> = ActionSuccess<T> | ActionFailure

export const ok = <T>(data: T): ActionSuccess<T> => ({ ok: true, data })

/**
 * Converts a thrown error into the shape a Server Action returns.
 *
 * The full error is logged server-side; only `publicMessage` travels to the
 * client. Stack traces and PostgreSQL detail never leave the server.
 */
export function fail(error: unknown): ActionFailure {
  const appError = toAppError(error)

  if (appError.status >= 500) {
    console.error('[afi]', appError.code, appError.message, appError.cause ?? '')
  } else {
    console.warn('[afi]', appError.code, appError.message)
  }

  return {
    ok: false,
    code: appError.code,
    message: appError.publicMessage,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
  }
}

/** Wraps a Server Action body so no unhandled error can leak out of it. */
export async function action<T>(run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await run())
  } catch (error) {
    return fail(error)
  }
}
