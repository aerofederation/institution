import type { Metadata } from 'next'
import Link from 'next/link'

import { ForgotPasswordForm } from './forgot-password-form'

export const metadata: Metadata = { title: 'Reset your password' }

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Enter the email address on your account and we will send a link to set a new password.
        </p>
      </div>

      <ForgotPasswordForm />

      <Link
        href="/login"
        className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Back to sign in
      </Link>
    </div>
  )
}
