'use client'

import { useActionState } from 'react'

import { FieldError, FormError, FormNotice, SubmitButton } from '@/components/forms/form-primitives'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/errors'
import { requestPasswordReset } from '../actions'

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<ActionResult<{ sent: true }> | null, FormData>(
    requestPasswordReset,
    null,
  )

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined
  const formError = state && !state.ok && !state.fieldErrors ? state.message : undefined

  /*
   * Success is reported the same way whether or not an account exists. Saying
   * "no account with that address" would let anyone test which institutions and
   * individuals are on the platform.
   */
  if (state?.ok) {
    return (
      <FormNotice message="If that address has an account, a reset link is on its way. The link expires in 60 minutes." />
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          aria-invalid={Boolean(fieldErrors?.email)}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" messages={fieldErrors?.email} />
      </div>

      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  )
}
