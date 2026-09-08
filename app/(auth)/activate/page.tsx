import type { Metadata } from 'next'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/server'

import { SetPasswordForm } from '../reset-password/set-password-form'

export const metadata: Metadata = { title: 'Activate your account' }

/**
 * First-time activation for a provisioned user.
 *
 * The invitation link is exchanged for a session in /auth/callback before this
 * page renders, so the account being activated is fixed by the link and cannot
 * be influenced by anything on this screen. Setting the password completes
 * activation through activate_own_account(), which only ever moves an INVITED
 * account to ACTIVE.
 */
export default async function ActivatePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">This invitation has expired</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Activation links can be used once and expire after 72 hours. Ask your institution
          administrator to send a new invitation.
        </p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, status, institutions!profiles_institution_id_fkey ( name )')
    .eq('id', user.id)
    .maybeSingle()

  const institution = profile?.institutions as { name: string } | null

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile?.full_name ? `, ${profile.full_name}` : ''}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {institution?.name
            ? `Choose a password to activate your account at ${institution.name}.`
            : 'Choose a password to activate your account.'}
        </p>
      </div>

      <SetPasswordForm submitLabel="Activate account" />
    </div>
  )
}
