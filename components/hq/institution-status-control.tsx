'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { AlertTriangle, Play, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { setInstitutionStatus } from '@/services/hq/applications'

/**
 * Suspend or reactivate an institution.
 *
 * The confirmation copy states the actual blast radius rather than asking a
 * vague "are you sure": suspending sets `institutions.status`, which every
 * tenant RLS predicate consults through `private.is_active()`, so it locks out
 * every one of that institution's administrators, teachers and students the
 * moment it commits.
 */
export function InstitutionStatusControl({
  institutionId,
  institutionName,
  status,
}: {
  institutionId: string
  institutionName: string
  status: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  const suspending = status !== 'SUSPENDED'
  const reasonMissing = suspending && reason.trim().length === 0

  // Only ACTIVE and SUSPENDED are reachable from here; PENDING is a
  // provisioning state and DEACTIVATED is not an HQ action.
  if (status !== 'ACTIVE' && status !== 'SUSPENDED') return null

  const submit = () => {
    if (reasonMissing) return

    startTransition(async () => {
      const result = await setInstitutionStatus({
        institution_id: institutionId,
        status: suspending ? 'SUSPENDED' : 'ACTIVE',
        reason: suspending ? reason.trim() : null,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      toast.success(
        suspending
          ? `${institutionName} suspended — its users are locked out`
          : `${institutionName} reactivated`,
      )
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <>
      <Button
        variant={suspending ? 'outline' : 'default'}
        size="sm"
        onClick={() => setOpen(true)}
        className={suspending ? 'text-destructive hover:text-destructive' : undefined}
      >
        {suspending ? (
          <>
            <ShieldAlert className="size-4" aria-hidden="true" />
            Suspend
          </>
        ) : (
          <>
            <Play className="size-4" aria-hidden="true" />
            Reactivate
          </>
        )}
      </Button>

      <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {suspending ? (
                <AlertTriangle className="text-destructive size-4" aria-hidden="true" />
              ) : null}
              {suspending ? `Suspend ${institutionName}?` : `Reactivate ${institutionName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {suspending ? (
                <>
                  Every administrator, teacher and student at this institution will lose access
                  immediately — the platform checks institution status on every request. Their
                  accounts and data are untouched and access returns the moment you reactivate.
                </>
              ) : (
                <>
                  Access is restored for every user at this institution. The suspension reason is
                  cleared, and this action is recorded in the audit log.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {suspending ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="suspension-reason">
                Reason for suspension
                <span className="text-destructive ml-1" aria-hidden="true">
                  *
                </span>
              </Label>
              <Textarea
                id="suspension-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Verification documents could not be confirmed with the issuing authority."
                rows={3}
                aria-required
                aria-invalid={reasonMissing}
              />
              <p className="text-muted-foreground text-xs">
                Recorded on the institution record and in the audit log.
              </p>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                submit()
              }}
              disabled={pending || reasonMissing}
              className={
                suspending ? 'bg-destructive text-white hover:bg-destructive/90' : undefined
              }
            >
              {pending ? 'Working…' : suspending ? 'Suspend institution' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
