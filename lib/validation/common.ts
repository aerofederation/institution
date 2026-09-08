import { z } from 'zod'

/**
 * Shared field schemas.
 *
 * Every schema in this directory is used on BOTH sides of the wire: the browser
 * runs it for immediate feedback, and the Server Action runs the identical
 * schema before anything reaches the database. Client validation is a courtesy;
 * the server-side parse is the one that counts.
 *
 * Constraints here mirror the database CHECK constraints, so a value that
 * passes validation cannot then be rejected by Postgres — and a value that
 * somehow bypasses validation is still rejected by Postgres.
 */

/** Normalised to lowercase, matching the `public.email_address` domain. */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address'))
  .refine((value) => value.length <= 320, 'Email address is too long')

export const uuidField = z.uuid('Invalid identifier')

export const phoneField = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Enter a valid phone number')

export const optionalPhoneField = z
  .union([phoneField, z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullish()

export const websiteField = z
  .string()
  .trim()
  .regex(/^https?:\/\//i, 'Include http:// or https://')
  .pipe(z.url('Enter a valid website address'))

export const optionalWebsiteField = z
  .union([websiteField, z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullish()

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Too short')
  .max(80, 'Too long')
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')

export const nameField = z
  .string()
  .trim()
  .min(2, 'Enter at least 2 characters')
  .max(150, 'Keep this under 150 characters')

export const codeField = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(32, 'Keep this under 32 characters')
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'Use letters, numbers, dots, dashes or slashes')

export const postalCodeField = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{2,15}$/, 'Enter a valid postal code')

/**
 * Password policy, applied at activation and at reset.
 *
 * Length is weighted over character-class gymnastics because length is what
 * actually resists guessing. The composition rule below is a floor, not the
 * point. The database never sees any of this: Supabase Auth stores the hash.
 */
export const passwordField = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128, 'Keep this under 128 characters')
  .refine((value) => /[a-z]/.test(value), 'Include a lowercase letter')
  .refine((value) => /[A-Z]/.test(value), 'Include an uppercase letter')
  .refine((value) => /[0-9]/.test(value), 'Include a number')
  .refine(
    (value) => !/^(.)\1+$/.test(value),
    'Choose something less predictable',
  )

export const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max, `Keep this under ${max} characters`), z.literal('')])
    .transform((value) => (value === '' ? null : value))
    .nullish()

/**
 * An optional value that survives an HTML form.
 *
 * An untouched `<select>`, `<input type="date">` or number field does not submit
 * `undefined` — it submits an empty string. `z.uuid().nullish()` accepts null and
 * undefined but rejects `""`, so every form with an optional dropdown fails
 * validation the moment somebody leaves it alone, which is the normal case.
 *
 * `z.coerce.number()` is worse than a rejection: it turns `""` into `0` and
 * stores it. A blank "years of experience" would have been recorded as zero
 * years rather than as unknown.
 *
 * The empty-string branch is checked first, before any coercion can see it.
 */
export const optionalFrom = <T extends z.ZodType>(schema: T) =>
  z
    .union([z.literal(''), schema])
    .transform((value) => (value === '' ? null : value))
    .nullish()

/** An optional foreign key from a `<select>`. */
export const optionalUuid = optionalFrom(z.uuid('Choose a valid option'))

/** An optional `<input type="date">`. */
export const optionalDate = optionalFrom(z.iso.date('Enter a valid date'))

/** An optional `<input type="number">`. */
export const optionalNumber = (options: { min: number; max: number; int?: boolean }) => {
  const base = options.int ? z.coerce.number().int() : z.coerce.number()
  return optionalFrom(base.min(options.min).max(options.max))
}

/**
 * A boolean that survives an HTML form.
 *
 * A checkbox does not submit `true` — it submits its `value` (or "on") when
 * ticked, and nothing at all when it is not. A plain `z.boolean()` therefore
 * rejects every checked box and treats every unchecked one as missing, which is
 * the wrong answer in both directions.
 */
export const checkboxField = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => value === true || value === 'true' || value === 'on')

/** The public application reference: AFI-YYYY-XXXXXXXX, Crockford base32. */
export const applicationRefField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^AFI-\d{4}-[0-9A-HJ-NP-TV-Z]{8}$/, 'Enter a valid application reference')

/**
 * Turns a ZodError into the `fieldErrors` shape a Server Action returns.
 * Nested paths are flattened with dots so a form can address them directly.
 */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_form'
    ;(result[key] ??= []).push(issue.message)
  }
  return result
}
