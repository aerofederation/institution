'use client'

import { useActionState, useEffect } from 'react'

import { useRouter } from 'next/navigation'

import { Fingerprint, Lock } from 'lucide-react'

import { hqLogin, type HqLoginResult } from './actions'
import { FieldError, FormError, SubmitButton } from '@/components/forms/form-primitives'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function HqLoginForm({ next }: { next?: string }) {
  const router = useRouter()
  const [state, formAction] = useActionState<HqLoginResult | null, FormData>(hqLogin, null)

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
        <Label htmlFor="email" className="text-xs tracking-wide uppercase">
          Administrator email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={Boolean(fieldErrors?.email)}
          aria-describedby={fieldErrors?.email ? 'hq-email-error' : undefined}
          className="h-11 font-mono text-sm"
        />
        <FieldError id="hq-email-error" messages={fieldErrors?.email} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-xs tracking-wide uppercase">
          Passphrase
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={Boolean(fieldErrors?.password)}
          aria-describedby={fieldErrors?.password ? 'hq-password-error' : undefined}
          className="h-11 font-mono text-sm"
        />
        <FieldError id="hq-password-error" messages={fieldErrors?.password} />
      </div>

      <SubmitButton pendingLabel="Verifying authorisation…" className="h-11">
        <Lock className="size-4" aria-hidden="true" />
        Secure HQ access
      </SubmitButton>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Fingerprint className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        Every attempt is recorded. HQ authorisation is verified against the account record after
        authentication — it cannot be requested, selected, or self-assigned.
      </p>
    </form>
  )
}
