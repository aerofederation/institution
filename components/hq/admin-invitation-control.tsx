'use client'

import { useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Send } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { reissueAdminInvitation } from '@/services/hq/applications'

/**
 * Sends the institution's administrator their activation link.
 *
 * Two situations reach this button. An institution approved before the handoff
 * existed has a live tenant and no administrator at all; and an invitation is
 * single-use and expires after 72 hours, so one that was never opened leaves
 * the institution unable to sign in with no way back.
 *
 * The destination address is not offered as a choice — it is read server-side
 * from the originating application, so this cannot be used to point an
 * institution's administrator account at an arbitrary address.
 */
export function AdminInvitationControl({
  institutionId,
  label = 'Send administrator invitation',
}: {
  institutionId: string
  label?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const submit = () => {
    startTransition(async () => {
      const result = await reissueAdminInvitation({ institution_id: institutionId })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      // Provisioning and delivery are reported separately: the account exists
      // either way, and a reviewer who is told "sent" when SMTP refused it has
      // no reason to look again.
      if (result.data.emailed) {
        toast.success(`Activation link sent to ${result.data.email}`)
      } else {
        toast.warning(
          `The administrator account is ready, but the email to ${result.data.email} could not be delivered. Check the mail configuration and try again.`,
        )
      }

      router.refresh()
    })
  }

  return (
    <Button size="sm" variant="outline" onClick={submit} disabled={pending}>
      <Send className="size-4" aria-hidden="true" />
      {pending ? 'Sending…' : label}
    </Button>
  )
}
