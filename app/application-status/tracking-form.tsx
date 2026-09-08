'use client'

import { useActionState, useState } from 'react'

import Link from 'next/link'

import { ArrowLeft, CheckCircle2, FileText, Mail, RotateCcw } from 'lucide-react'

import { FieldError, FormError, SubmitButton } from '@/components/forms/form-primitives'
import { StatusBadge, statusLabel } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { humaniseEnum } from '@/lib/constants/enums'
import type { ActionResult } from '@/lib/errors'
import {
  requestTrackingCode,
  verifyTrackingCode,
  type TrackedApplication,
} from '@/services/public/tracking'

/**
 * The tracking flow: reference + email → one-time code → status.
 *
 * The "code sent" confirmation is shown whether or not the pair matched. That
 * is not a UI shortcut — the server returns the same result either way, so this
 * component genuinely does not know, and cannot leak, whether an application
 * exists.
 */
export function TrackingForm() {
  const [reference, setReference] = useState('')
  const [application, setApplication] = useState<TrackedApplication | null>(null)

  const [requestState, requestAction] = useActionState<
    ActionResult<{ applicationRef: string }> | null,
    FormData
  >(requestTrackingCode, null)

  const [verifyState, verifyAction] = useActionState<
    ActionResult<TrackedApplication> | null,
    FormData
  >(async (previous, formData) => {
    const result = await verifyTrackingCode(previous, formData)
    if (result.ok) setApplication(result.data)
    return result
  }, null)

  if (application) {
    return <ApplicationStatus application={application} onReset={() => setApplication(null)} />
  }

  const codeSent = requestState?.ok === true
  const activeRef = codeSent ? requestState.data.applicationRef : reference

  // ── Step 2 · code ─────────────────────────────────────────────────────────
  if (codeSent) {
    const fieldErrors = verifyState && !verifyState.ok ? verifyState.fieldErrors : undefined
    const formError =
      verifyState && !verifyState.ok && !verifyState.fieldErrors ? verifyState.message : undefined

    return (
      <div className="flex flex-col gap-6">
        <div className="border-primary/25 bg-primary/[0.04] flex items-start gap-3 rounded-lg border p-4">
          <Mail className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Check your email</p>
            <p className="text-muted-foreground text-sm">
              If <span className="font-mono">{activeRef}</span> matches an application, a six-digit
              code has been sent to the address on it. The code expires in 15 minutes.
            </p>
          </div>
        </div>

        <form action={verifyAction} className="flex flex-col gap-5" noValidate>
          <FormError message={formError} />
          <input type="hidden" name="application_ref" value={activeRef} />

          <div className="flex flex-col gap-2">
            <Label htmlFor="code">Six-digit code</Label>
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              autoFocus
              placeholder="000000"
              className="afi-metric h-11 max-w-[12rem] text-lg tracking-[0.3em]"
              aria-invalid={Boolean(fieldErrors?.code)}
              aria-describedby={fieldErrors?.code ? 'code-error' : undefined}
            />
            <FieldError id="code-error" messages={fieldErrors?.code} />
          </div>

          <SubmitButton pendingLabel="Checking…" className="sm:w-fit">
            View application status
          </SubmitButton>
        </form>

        <p className="text-muted-foreground text-sm">
          Did not receive it?{' '}
          <Link href="/application-status" className="underline underline-offset-4">
            Start again
          </Link>
        </p>
      </div>
    )
  }

  // ── Step 1 · reference + email ────────────────────────────────────────────
  const fieldErrors = requestState && !requestState.ok ? requestState.fieldErrors : undefined
  const formError =
    requestState && !requestState.ok && !requestState.fieldErrors ? requestState.message : undefined

  return (
    <form action={requestAction} className="flex flex-col gap-5" noValidate>
      <FormError message={formError} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="application_ref">Application reference</Label>
        <Input
          id="application_ref"
          name="application_ref"
          required
          placeholder="AFI-2026-XXXXXXXX"
          value={reference}
          onChange={(event) => setReference(event.target.value.toUpperCase())}
          className="font-mono"
          aria-invalid={Boolean(fieldErrors?.application_ref)}
          aria-describedby={fieldErrors?.application_ref ? 'ref-error' : undefined}
        />
        <FieldError id="ref-error" messages={fieldErrors?.application_ref} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email on the application</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          aria-invalid={Boolean(fieldErrors?.email)}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
        />
        <FieldError id="email-error" messages={fieldErrors?.email} />
        <p className="text-muted-foreground text-xs">
          Both must match. A one-time code is sent to this address to confirm it is you.
        </p>
      </div>

      <SubmitButton pendingLabel="Sending code…" className="sm:w-fit">
        Send me a code
      </SubmitButton>
    </form>
  )
}

function ApplicationStatus({
  application,
  onReset,
}: {
  application: TrackedApplication
  onReset: () => void
}) {
  const location = [application.city, application.state].filter(Boolean).join(', ')

  // The most recent transition carries anything HQ asked the applicant to do.
  const latest = application.history[application.history.length - 1]
  const awaitingApplicant =
    application.status === 'DOCUMENTS_REQUIRED' || application.status === 'RESUBMISSION_REQUIRED'

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={application.status} />
          <span className="text-muted-foreground font-mono text-sm">
            {application.application_ref}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {application.institution_name}
          </h2>
          <p className="text-muted-foreground text-sm">
            {humaniseEnum(application.institution_type)}
            {location ? ` · ${location}` : ''}
          </p>
        </div>
      </div>

      {awaitingApplicant && latest?.comments ? (
        <div
          role="alert"
          className="border-warning/40 bg-warning/10 flex flex-col gap-2 rounded-lg border p-5"
        >
          <p className="text-sm font-medium">AFI headquarters needs something from you</p>
          <p className="text-foreground/90 text-sm whitespace-pre-line">{latest.comments}</p>
          <Button asChild size="sm" className="mt-1 w-fit">
            <Link href="/apply">Update your application</Link>
          </Button>
        </div>
      ) : null}

      {application.status === 'APPROVED' ? (
        <div className="border-success/40 bg-success/10 flex items-start gap-3 rounded-lg border p-5">
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">Approved</p>
            <p className="text-muted-foreground text-sm">
              Your institution has been admitted to the AFI network. A single-use activation link
              goes to the authorised representative named on this application, so they can set a
              password and sign in. It expires after 72 hours — if it has lapsed or never arrived,
              ask AFI headquarters to reissue it.
            </p>
          </div>
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-sm font-semibold">Review history</h3>
        <ol className="divide-border bg-card divide-y rounded-lg border">
          {[...application.history].reverse().map((entry, index) => (
            <li key={`${entry.created_at}-${index}`} className="flex flex-col gap-1.5 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={entry.to_status} size="sm" />
                <time
                  dateTime={entry.created_at}
                  className="text-muted-foreground font-mono text-[11px]"
                >
                  {new Date(entry.created_at).toLocaleString('en-IN')}
                </time>
              </div>
              {entry.comments ? (
                <p className="text-foreground/90 text-sm whitespace-pre-line">{entry.comments}</p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {entry.from_status
                    ? `Moved from ${statusLabel(entry.from_status).toLowerCase()}`
                    : 'Application created'}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="font-heading text-sm font-semibold">
          Documents ({application.documents.length})
        </h3>
        {application.documents.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            No documents attached to this application.
          </p>
        ) : (
          <ul className="divide-border bg-card divide-y rounded-lg border">
            {application.documents.map((document, index) => (
              <li key={`${document.file_name}-${index}`} className="flex flex-col gap-1 p-4">
                <div className="flex items-center gap-3">
                  <FileText
                    className="text-muted-foreground size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {document.file_name}
                  </span>
                  <StatusBadge status={document.verification_status} size="sm" />
                </div>
                <p className="text-muted-foreground pl-7 text-xs">
                  {humaniseEnum(document.document_type)}
                </p>
                {document.rejection_reason ? (
                  <p className="text-destructive pl-7 text-sm">{document.rejection_reason}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3 border-t pt-6">
        <Button variant="outline" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Track another application
        </Button>
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Return to afi.in
          </Link>
        </Button>
      </div>
    </div>
  )
}
