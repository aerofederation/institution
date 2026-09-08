'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { MoreHorizontal, Play, Send, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { resendMemberInvitation } from '@/services/institution/invitations'
import { setStudentStatus } from '@/services/students'
import { setTeacherStatus } from '@/services/teachers'

/**
 * Per-member actions: reissue an invitation, suspend, reactivate.
 *
 * The suspend confirmation states the actual effect rather than asking a vague
 * "are you sure". Suspending sets `profiles.status`, which `private.is_active()`
 * reads and every tenant RLS predicate consults — so it locks the account out
 * of every screen and every query the moment it commits, not merely hides them
 * from a list.
 */
export function MemberActions({
  profileId,
  name,
  kind,
  status,
}: {
  profileId: string
  name: string
  kind: 'teacher' | 'student'
  status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')

  const setStatus = kind === 'teacher' ? setTeacherStatus : setStudentStatus
  const suspended = status === 'SUSPENDED'
  const awaitingActivation = status === 'INVITED'

  const resend = () =>
    startTransition(async () => {
      const result = await resendMemberInvitation({ profile_id: profileId })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      // Provisioning and delivery are reported separately: an administrator
      // told "sent" when SMTP refused has no reason to look again.
      if (result.data.emailed) {
        toast.success(`New activation link sent to ${result.data.email}`)
      } else {
        toast.warning(`The link could not be delivered to ${result.data.email}.`)
      }

      router.refresh()
    })

  const applyStatus = (next: 'ACTIVE' | 'SUSPENDED') =>
    startTransition(async () => {
      const result = await setStatus({
        profile_id: profileId,
        status: next,
        reason: next === 'SUSPENDED' ? reason.trim() : null,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(
        next === 'SUSPENDED' ? `${name} suspended — signed out of the platform` : `${name} reactivated`,
      )
      setConfirming(false)
      setReason('')
      router.refresh()
    })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          {/* Reissuing is offered only while the invitation is still the way in. */}
          {awaitingActivation ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                resend()
              }}
              disabled={pending}
            >
              <Send className="size-4" aria-hidden="true" />
              Resend invitation
            </DropdownMenuItem>
          ) : null}

          {suspended ? (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                applyStatus('ACTIVE')
              }}
              disabled={pending}
            >
              <Play className="size-4" aria-hidden="true" />
              Reactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setConfirming(true)
              }}
              disabled={pending}
              variant="destructive"
            >
              <ShieldAlert className="size-4" aria-hidden="true" />
              Suspend
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirming} onOpenChange={(next) => !pending && setConfirming(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access immediately — the platform checks account status on every request.
              Their record and data are untouched, and access returns the moment you reactivate.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suspend-reason" className="text-xs font-medium">
              Reason<span className="text-destructive ml-0.5">*</span>
            </Label>
            <Textarea
              id="suspend-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="Recorded in the audit log"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length === 0}
              onClick={() => applyStatus('SUSPENDED')}
            >
              {pending ? 'Suspending…' : 'Suspend'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
