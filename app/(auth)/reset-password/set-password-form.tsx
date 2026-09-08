'use client'

import { useActionState, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import { FieldError, FormError, SubmitButton } from '@/components/forms/form-primitives'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPassword, type AuthActionResult } from '../actions'

/**
 * Shared by password reset and first-time activation.
 *
 * Both flows are the same operation: a session already exists because a
 * single-use link was exchanged for one, and the user is choosing a secret.
 * There is no email field — supplying one would let whoever holds the link set
 * the password on a different account.
 */
export function SetPasswordForm({ submitLabel = 'Set password' }: { submitLabel?: string }) {
  const router = useRouter()
  const [state, formAction] = useActionState<AuthActionResult | null, FormData>(setPassword, null)

  useEffect(() => {
    if (state?.ok) {
      router.replace(state.data.redirectTo)
      router.refresh()
    }
  }, [state, router])

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined
  const formError = state && !state.ok && !state.fieldErrors ? state.message : undefined

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          aria-invalid={Boolean(fieldErrors?.password)}
          aria-describedby="password-hint password-error"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          At least 12 characters, including upper case, lower case and a number.
        </p>
        <FieldError id="password-error" messages={fieldErrors?.password} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors?.confirmPassword)}
          aria-describedby={fieldErrors?.confirmPassword ? 'confirm-error' : undefined}
        />
        <FieldError id="confirm-error" messages={fieldErrors?.confirmPassword} />
      </div>

      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  )
}
