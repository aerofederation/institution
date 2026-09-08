'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { AlertTriangle, Check, FileWarning, RotateCcw, X } from 'lucide-react'
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
import { decideApplication, type DecisionInput } from '@/services/hq/applications'

type Decision = DecisionInput['decision']

const DECISIONS: Record<
  Decision,
  {
    label: string
    icon: typeof Check
    variant: 'default' | 'outline' | 'destructive'
    /** Copy for the confirmation step. */
    confirmTitle: string
    confirmBody: string
    /** Whether a written reason is mandatory. */
    requiresNote: boolean
    noteLabel: string
    notePlaceholder: string
    destructive?: boolean
  }
> = {
  UNDER_REVIEW: {
    label: 'Take under review',
    icon: RotateCcw,
    variant: 'default',
    confirmTitle: 'Take this application under review?',
    confirmBody:
      'You will be recorded as the reviewer and the applicant will see that review has begun.',
    requiresNote: false,
    noteLabel: 'Internal note (optional)',
    notePlaceholder: 'Anything the next reviewer should know…',
  },
  DOCUMENTS_REQUIRED: {
    label: 'Request documents',
    icon: FileWarning,
    variant: 'outline',
    confirmTitle: 'Request further documents?',
    confirmBody:
      'The application returns to the applicant. Everything you write below is shown to them, so be specific about what is missing.',
    requiresNote: true,
    noteLabel: 'What the applicant must provide',
    notePlaceholder: 'e.g. A current AICTE approval letter, and proof of the registered address.',
  },
  RESUBMISSION_REQUIRED: {
    label: 'Request resubmission',
    icon: RotateCcw,
    variant: 'outline',
    confirmTitle: 'Ask the applicant to resubmit?',
    confirmBody:
      'The application returns to the applicant for correction. Your note is shown to them.',
    requiresNote: true,
    noteLabel: 'What must be corrected',
    notePlaceholder: 'e.g. The registration number does not match the certificate provided.',
  },
  APPROVED: {
    label: 'Approve institution',
    icon: Check,
    variant: 'default',
    confirmTitle: 'Approve and provision this institution?',
    confirmBody:
      'This creates the institution as a live tenant in the federation, transfers its documents, and makes it eligible to onboard administrators, teachers and students. It is not easily undone.',
    requiresNote: false,
    noteLabel: 'Approval note (optional)',
    notePlaceholder: 'Recorded in the application history.',
  },
  REJECTED: {
    label: 'Reject application',
    icon: X,
    variant: 'destructive',
    confirmTitle: 'Reject this application?',
    confirmBody:
      'Rejection is final — the database treats it as a terminal state and the application cannot be reopened. The reason you give is shown to the applicant.',
    requiresNote: true,
    noteLabel: 'Reason for rejection',
    notePlaceholder: 'State plainly why the application cannot proceed.',
    destructive: true,
  },
}

/**
 * The HQ decision panel.
 *
 * Only decisions the database will actually accept from the current status are
 * offered — the legal transitions live in
 * `private.application_transition_allowed()` and are mirrored here so a reviewer
 * is never shown a button that would fail. The database remains the authority;
 * this is a courtesy, not the check.
 *
 * Every decision passes through a confirmation step, and the two that cannot be
 * walked back — approval, which provisions a tenant, and rejection, which is
 * terminal — say so in that step rather than after the fact.
 */
const ALLOWED_FROM: Record<string, Decision[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['DOCUMENTS_REQUIRED', 'RESUBMISSION_REQUIRED', 'APPROVED', 'REJECTED'],
  DOCUMENTS_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  RESUBMISSION_REQUIRED: ['UNDER_REVIEW', 'REJECTED'],
  DRAFT: [],
  APPROVED: [],
  REJECTED: [],
  SUSPENDED: [],
}

export function ApplicationReview({
  applicationId,
  currentStatus,
  institutionName,
}: {
  applicationId: string
  currentStatus: string
  institutionName: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [active, setActive] = useState<Decision | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const available = ALLOWED_FROM[currentStatus] ?? []

  if (available.length === 0) {
    return (
      <div className="text-muted-foreground bg-muted/30 rounded-lg border p-5 text-sm">
        {currentStatus === 'APPROVED' ? (
          <>
            This application has been approved and the institution is live in the federation. No
            further decisions are available.
          </>
        ) : currentStatus === 'REJECTED' ? (
          <>
            This application was rejected. Rejection is terminal in the database state machine, so
            it cannot be reopened — the applicant would need to submit a new application.
          </>
        ) : currentStatus === 'DRAFT' ? (
          <>
            This application is still a draft. It becomes reviewable once the applicant submits it.
          </>
        ) : (
          <>No decisions are available from the current state.</>
        )}
      </div>
    )
  }

  const config = active ? DECISIONS[active] : null
  const noteMissing = Boolean(config?.requiresNote && note.trim().length === 0)

  const submit = () => {
    if (!active || noteMissing) return
    setError(null)

    startTransition(async () => {
      const result = await decideApplication({
        application_id: applicationId,
        decision: active,
        comments: note.trim() || null,
        // The service splits these out for the applicant-facing summary.
        required_actions:
          active === 'DOCUMENTS_REQUIRED' || active === 'RESUBMISSION_REQUIRED'
            ? note
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
            : [],
      })

      if (!result.ok) {
        setError(result.message)
        toast.error(result.message)
        return
      }

      toast.success(
        active === 'APPROVED'
          ? `${institutionName} approved and provisioned`
          : `Application moved to ${DECISIONS[active].label.toLowerCase()}`,
      )
      setActive(null)
      setNote('')
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {available.map((decision) => {
          const entry = DECISIONS[decision]
          const Icon = entry.icon
          return (
            <Button
              key={decision}
              variant={entry.variant}
              size="sm"
              disabled={pending}
              onClick={() => {
                setActive(decision)
                setNote('')
                setError(null)
              }}
            >
              <Icon className="size-4" aria-hidden="true" />
              {entry.label}
            </Button>
          )
        })}
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <AlertDialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setActive(null)
            setError(null)
          }
        }}
      >
        {/* `dark` repeated: the dialog portals outside the HQ shell's subtree. */}
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {config?.destructive ? (
                <AlertTriangle className="text-destructive size-4" aria-hidden="true" />
              ) : null}
              {config?.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>{config?.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="decision-note">
              {config?.noteLabel}
              {config?.requiresNote ? (
                <span className="text-destructive ml-1" aria-hidden="true">
                  *
                </span>
              ) : null}
            </Label>
            <Textarea
              id="decision-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={config?.notePlaceholder}
              rows={4}
              aria-required={config?.requiresNote}
              aria-invalid={noteMissing}
            />
            {config?.requiresNote ? (
              <p className="text-muted-foreground text-xs">
                {active === 'DOCUMENTS_REQUIRED' || active === 'RESUBMISSION_REQUIRED'
                  ? 'One item per line. Each line is listed for the applicant as a required action.'
                  : 'Shown to the applicant and recorded permanently in the application history.'}
              </p>
            ) : null}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                submit()
              }}
              disabled={pending || noteMissing}
              className={
                config?.destructive
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              }
            >
              {pending ? 'Working…' : (config?.label ?? 'Confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
