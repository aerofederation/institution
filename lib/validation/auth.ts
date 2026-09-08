import { z } from 'zod'

import { emailField, passwordField } from './common'

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
  // Relative path only. An absolute URL here would make the login form an open
  // redirect, so anything that is not a same-site path is discarded.
  next: z
    .string()
    .regex(/^\/(?!\/)[A-Za-z0-9/_?&=.%-]*$/, 'Invalid redirect')
    .optional(),
})
export type LoginInput = z.infer<typeof loginSchema>

export const passwordResetRequestSchema = z.object({
  email: emailField,
})
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>

export const setPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
export type SetPasswordInput = z.infer<typeof setPasswordSchema>

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password: passwordField,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((values) => values.password !== values.currentPassword, {
    message: 'Choose a password you have not used here before',
    path: ['password'],
  })
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/**
 * Activation: a provisioned user setting their first password.
 *
 * There is no email field. The address is fixed by the invitation the link
 * carries — letting the form supply one would let a recipient activate an
 * account that was never issued to them.
 */
export const activateAccountSchema = setPasswordSchema
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>

export const updateOwnProfileSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter at least 2 characters').max(150),
  phone: z
    .union([z.string().trim().regex(/^\+?[0-9][0-9 ()-]{6,19}$/, 'Enter a valid phone number'), z.literal('')])
    .transform((value) => (value === '' ? null : value)),
  locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default('en-IN'),
  timezone: z.string().min(1).max(64).default('Asia/Kolkata'),
})
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>

/*
 * Deliberately absent: any schema that accepts `role`, `institution_id`,
 * `status` or `email` from a user-submitted form.
 *
 * Those four columns are assigned by provisioning and are immutable to the
 * account holder — the database enforces that with a trigger. Not having a
 * schema for them means no Server Action can accidentally grow the ability to
 * write them.
 */
