'use client'

import { useActionState, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import { FieldError, FormError, SubmitButton } from '@/components/forms/form-primitives'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login, type AuthActionResult } from '@/app/(auth)/actions'

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [state, formAction] = useActionState<AuthActionResult | null, FormData>(login, null)

  /*
   * The action returns a destination rather than calling redirect(). Next's
   * redirect() signals by throwing, and the shared action() wrapper would catch
   * that throw and report a failure for a sign-in that actually worked.
   *
   * refresh() after replace() is what forces middleware to re-run against the
   * newly-set session cookie.
   */
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
      {next ? <input type="hidden" name="next" value={next} /> : null}

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors?.password)}
          aria-describedby={fieldErrors?.password ? 'password-error' : undefined}
        />
        <FieldError id="password-error" messages={fieldErrors?.password} />
      </div>

      <SubmitButton pendingLabel="Signing in…">Sign in</SubmitButton>
    </form>
  )
}
