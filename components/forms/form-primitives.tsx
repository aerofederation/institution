'use client'

import { useFormStatus } from 'react-dom'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Shared form pieces used by every Server Action form.
 *
 * These exist so that error presentation, disabled states and the association
 * between a field and its message are decided once. A form that renders its own
 * ad-hoc error paragraph tends to forget `aria-describedby`, and then the error
 * is invisible to anyone using a screen reader.
 */

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2.5 text-sm"
    >
      {message}
    </div>
  )
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null
  return (
    <div
      role="status"
      className="border-primary/30 bg-primary/5 text-foreground rounded-md border px-3 py-2.5 text-sm"
    >
      {message}
    </div>
  )
}

/**
 * Submit button wired to the parent form's pending state, so the disabled and
 * busy states cannot drift out of sync with the action.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: React.ReactNode
  pendingLabel?: string
  className?: string
}) {
  const { pending } = useFormStatus()

  return (
    <Button type="submit" className={cn('w-full', className)} disabled={pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? 'Working…') : children}
    </Button>
  )
}
