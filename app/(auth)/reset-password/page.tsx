import type { Metadata } from 'next'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import { SetPasswordForm } from './set-password-form'

export const metadata: Metadata = { title: 'Choose a new password' }

export default async function ResetPasswordPage() {
  // Reaching this page means the recovery link was already exchanged for a
  // session in /auth/callback. Without one there is nothing to reset.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">This link has expired</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Password links can be used once and are valid for a limited time. Request a new one to
          continue.
        </p>
        <Link href="/forgot-password" className="text-sm underline underline-offset-4">
          Request a new link
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Setting a new password for {user.email}.
        </p>
      </div>

      <SetPasswordForm submitLabel="Save new password" />
    </div>
  )
}
