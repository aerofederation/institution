'use client'

import { useMemo, useState, useTransition } from 'react'

import Link from 'next/link'

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  Loader2,
  MapPin,
  Send,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import { DocumentUploader } from '@/app/apply/document-uploader'
import { FieldError, FormError } from '@/components/forms/form-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  INSTITUTION_CATEGORIES,
  INSTITUTION_TYPES,
  humaniseEnum,
} from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import {
  saveApplicationStep,
  startApplication,
  submitApplication,
  type AttachedDocument,
} from '@/services/public/application'

type Draft = Record<string, unknown> | null

const STEPS = [
  { id: 'organization', label: 'Organisation', icon: Building2 },
  { id: 'address', label: 'Address', icon: MapPin },
  { id: 'representative', label: 'Representative', icon: UserCheck },
  { id: 'detail', label: 'Institution detail', icon: ClipboardList },
  { id: 'documents', label: 'Documents', icon: FileCheck2 },
  { id: 'review', label: 'Review & submit', icon: Send },
] as const

type StepId = (typeof STEPS)[number]['id']

/**
 * The institution application.
 *
 * State lives on the server, not in this component. Every step persists through
 * a Server Action before advancing, so closing the tab at step 4 loses nothing
 * — the draft is reloaded from the database on the next visit through an
 * httpOnly cookie holding the draft secret.
 *
 * Field errors always come back from the server. The same zod schemas run in
 * both places, so client validation is immediate feedback and the server-side
 * parse is what actually decides.
 */
export function ApplicationWizard({
  initialDraft,
  initialDocuments,
}: {
  initialDraft: Draft
  initialDocuments: AttachedDocument[]
}) {
  const [draft, setDraft] = useState<Draft>(initialDraft)
  const [documents, setDocuments] = useState(initialDocuments)
  const [step, setStep] = useState<StepId>(() => (initialDraft ? 'address' : 'organization'))
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [receipt, setReceipt] = useState<{
    applicationRef: string
    institutionName: string
    applicantEmail: string
  } | null>(null)

  const stepIndex = STEPS.findIndex((entry) => entry.id === step)
  const value = (key: string) => (draft?.[key] as string | number | null | undefined) ?? ''

  const advance = () => {
    const next = STEPS[stepIndex + 1]
    if (next) setStep(next.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const back = () => {
    const previous = STEPS[stepIndex - 1]
    if (previous) setStep(previous.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /** Persists a step, then advances only if the server accepted it. */
  const persist = (formData: FormData, stepId: Exclude<StepId, 'documents' | 'review'>) => {
    setErrors({})
    setFormError(null)

    const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>

    // Free-text list fields arrive comma-separated.
    for (const key of ['departments', 'programs', 'specializations']) {
      if (key in payload) {
        payload[key] = String(payload[key] ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      }
    }

    startTransition(async () => {
      const result =
        stepId === 'organization' && !draft
          ? await startApplication(payload)
          : await saveApplicationStep(stepId, payload)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        if (!result.fieldErrors) setFormError(result.message)
        toast.error(result.message)
        return
      }

      setDraft((current) => ({ ...(current ?? {}), ...payload }) as Draft)
      advance()
    })
  }

  const submit = () => {
    setFormError(null)
    startTransition(async () => {
      const result = await submitApplication()
      if (!result.ok) {
        setFormError(result.message)
        toast.error(result.message)
        return
      }
      setReceipt(result.data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  if (receipt) return <SubmittedReceipt receipt={receipt} />

  return (
    <div className="flex flex-col gap-10">
      <StepIndicator current={stepIndex} />

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="afi-eyebrow">
            Step {stepIndex + 1} of {STEPS.length}
          </span>
          <h2 className="font-heading text-2xl font-semibold tracking-tight">
            {STEPS[stepIndex].label}
          </h2>
        </div>

        <FormError message={formError ?? undefined} />

        {step === 'organization' ? (
          <StepForm onSubmit={(data) => persist(data, 'organization')} pending={pending} first>
            <Field name="institution_name" label="Institution name" required errors={errors}>
              <Input
                id="institution_name"
                name="institution_name"
                defaultValue={String(value('institution_name'))}
                required
              />
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="institution_type" label="Institution type" required errors={errors}>
                <EnumSelect
                  name="institution_type"
                  options={INSTITUTION_TYPES}
                  defaultValue={String(value('institution_type')) || undefined}
                />
              </Field>
              <Field name="category" label="Category" required errors={errors}>
                <EnumSelect
                  name="category"
                  options={INSTITUTION_CATEGORIES}
                  defaultValue={String(value('category')) || undefined}
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="official_email" label="Official email" required errors={errors}>
                <Input
                  id="official_email"
                  name="official_email"
                  type="email"
                  defaultValue={String(value('official_email'))}
                  required
                />
              </Field>
              <Field name="official_phone" label="Official phone" errors={errors}>
                <Input
                  id="official_phone"
                  name="official_phone"
                  defaultValue={String(value('official_phone'))}
                  placeholder="+91…"
                />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="website" label="Website" errors={errors}>
                <Input
                  id="website"
                  name="website"
                  defaultValue={String(value('website'))}
                  placeholder="https://"
                />
              </Field>
              <Field name="year_established" label="Year established" errors={errors}>
                <Input
                  id="year_established"
                  name="year_established"
                  inputMode="numeric"
                  defaultValue={String(value('year_established'))}
                />
              </Field>
            </div>

            <Field name="registration_number" label="Registration number" errors={errors}>
              <Input
                id="registration_number"
                name="registration_number"
                defaultValue={String(value('registration_number'))}
              />
            </Field>

            <Field name="field_of_work" label="Field of work" errors={errors}>
              <Input
                id="field_of_work"
                name="field_of_work"
                defaultValue={String(value('field_of_work'))}
                placeholder="e.g. Engineering and applied sciences"
              />
            </Field>

            <Field name="description" label="Description" errors={errors}>
              <Textarea
                id="description"
                name="description"
                rows={4}
                defaultValue={String(value('description'))}
              />
            </Field>
          </StepForm>
        ) : null}

        {step === 'address' ? (
          <StepForm onSubmit={(data) => persist(data, 'address')} pending={pending} onBack={back}>
            <Field name="address_line" label="Address" errors={errors}>
              <Input
                id="address_line"
                name="address_line"
                defaultValue={String(value('address_line'))}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="city" label="City" required errors={errors}>
                <Input id="city" name="city" defaultValue={String(value('city'))} required />
              </Field>
              <Field name="state" label="State" required errors={errors}>
                <Input id="state" name="state" defaultValue={String(value('state'))} required />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="country" label="Country" errors={errors}>
                <Input
                  id="country"
                  name="country"
                  defaultValue={String(value('country')) || 'India'}
                />
              </Field>
              <Field name="postal_code" label="Postal code" errors={errors}>
                <Input
                  id="postal_code"
                  name="postal_code"
                  defaultValue={String(value('postal_code'))}
                />
              </Field>
            </div>
          </StepForm>
        ) : null}

        {step === 'representative' ? (
          <StepForm
            onSubmit={(data) => persist(data, 'representative')}
            pending={pending}
            onBack={back}
          >
            <p className="text-muted-foreground text-sm">
              The person authorised to apply on behalf of the institution. AFI headquarters
              corresponds with this address during review.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="representative_name" label="Full name" required errors={errors}>
                <Input
                  id="representative_name"
                  name="representative_name"
                  defaultValue={String(value('representative_name'))}
                  required
                />
              </Field>
              <Field
                name="representative_designation"
                label="Designation"
                required
                errors={errors}
              >
                <Input
                  id="representative_designation"
                  name="representative_designation"
                  defaultValue={String(value('representative_designation'))}
                  placeholder="e.g. Principal"
                  required
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field name="representative_email" label="Email" required errors={errors}>
                <Input
                  id="representative_email"
                  name="representative_email"
                  type="email"
                  defaultValue={String(value('representative_email'))}
                  required
                />
              </Field>
              <Field name="representative_phone" label="Phone" required errors={errors}>
                <Input
                  id="representative_phone"
                  name="representative_phone"
                  defaultValue={String(value('representative_phone'))}
                  placeholder="+91…"
                  required
                />
              </Field>
            </div>
          </StepForm>
        ) : null}

        {step === 'detail' ? (
          <StepForm onSubmit={(data) => persist(data, 'detail')} pending={pending} onBack={back}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                name="estimated_student_count"
                label="Approximate students"
                errors={errors}
              >
                <Input
                  id="estimated_student_count"
                  name="estimated_student_count"
                  inputMode="numeric"
                  defaultValue={String(value('estimated_student_count'))}
                />
              </Field>
              <Field
                name="estimated_teacher_count"
                label="Approximate teachers"
                errors={errors}
              >
                <Input
                  id="estimated_teacher_count"
                  name="estimated_teacher_count"
                  inputMode="numeric"
                  defaultValue={String(value('estimated_teacher_count'))}
                />
              </Field>
            </div>

            <Field name="departments" label="Departments" hint="Separate with commas" errors={errors}>
              <Input
                id="departments"
                name="departments"
                defaultValue={joinList(draft?.departments)}
                placeholder="Mechanical Engineering, Computer Science"
              />
            </Field>

            <Field name="programs" label="Programmes" hint="Separate with commas" errors={errors}>
              <Input
                id="programs"
                name="programs"
                defaultValue={joinList(draft?.programs)}
                placeholder="B.Tech Mechanical, M.Sc Physics"
              />
            </Field>

            <Field
              name="specializations"
              label="Areas of specialisation"
              hint="Separate with commas"
              errors={errors}
            >
              <Input
                id="specializations"
                name="specializations"
                defaultValue={joinList(draft?.specializations)}
                placeholder="Avionics, UAV systems"
              />
            </Field>

            {/*
              The column behind this is still `aerospace_relevance`. Renaming it
              is a migration plus a data move, and the label is what an
              applicant reads — so the wording is broadened here and the column
              left alone rather than half-done.
            */}
            <Field
              name="aerospace_relevance"
              label="Relevance to the federation"
              hint="How the institution's work relates to AFI's mission, in any department"
              errors={errors}
            >
              <Textarea
                id="aerospace_relevance"
                name="aerospace_relevance"
                rows={4}
                defaultValue={String(value('aerospace_relevance'))}
              />
            </Field>
          </StepForm>
        ) : null}

        {step === 'documents' ? (
          <div className="flex flex-col gap-6">
            <DocumentUploader documents={documents} onChange={setDocuments} />
            <div className="flex flex-wrap justify-between gap-3 border-t pt-6">
              <Button type="button" variant="ghost" onClick={back}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </Button>
              <Button type="button" onClick={advance}>
                Continue to review
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <ReviewStep
            draft={draft}
            documents={documents}
            pending={pending}
            onBack={back}
            onSubmit={submit}
            onEdit={(target) => setStep(target)}
          />
        ) : null}
      </div>
    </div>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Application progress">
      {STEPS.map((entry, index) => {
        const done = index < current
        const active = index === current
        return (
          <li key={entry.id} className="flex items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary',
                !done && !active && 'text-muted-foreground/60',
              )}
              aria-hidden="true"
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'text-xs',
                active ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {entry.label}
              {active ? <span className="sr-only"> (current step)</span> : null}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="bg-border hidden h-px w-6 sm:block" aria-hidden="true" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function StepForm({
  children,
  onSubmit,
  pending,
  onBack,
  first,
}: {
  children: React.ReactNode
  onSubmit: (data: FormData) => void
  pending: boolean
  onBack?: () => void
  first?: boolean
}) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit(new FormData(event.currentTarget))
      }}
      className="flex flex-col gap-6"
    >
      {children}

      <div className="flex flex-wrap justify-between gap-3 border-t pt-6">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" asChild>
            <Link href="/">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Cancel
            </Link>
          </Button>
        )}

        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            <>
              {first ? 'Start application' : 'Save and continue'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </form>
  )
}

function Field({
  name,
  label,
  children,
  errors,
  required,
  hint,
}: {
  name: string
  label: string
  children: React.ReactNode
  errors: Record<string, string[]>
  required?: boolean
  hint?: string
}) {
  const messages = errors[name]
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>
        {label}
        {required ? (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      <FieldError id={`${name}-error`} messages={messages} />
    </div>
  )
}

/**
 * A native select is used for enum fields rather than the Radix component: it
 * participates in `FormData` automatically, works without JavaScript, and gets
 * the platform's own mobile picker.
 */
function EnumSelect({
  name,
  options,
  defaultValue,
}: {
  name: string
  options: readonly string[]
  defaultValue?: string
}) {
  return (
    <select
      id={name}
      name={name}
      defaultValue={defaultValue ?? ''}
      required
      className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
    >
      <option value="" disabled>
        Select…
      </option>
      {options.map((option) => (
        <option key={option} value={option}>
          {humaniseEnum(option)}
        </option>
      ))}
    </select>
  )
}

function joinList(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : ''
}

function ReviewStep({
  draft,
  documents,
  pending,
  onBack,
  onSubmit,
  onEdit,
}: {
  draft: Draft
  documents: AttachedDocument[]
  pending: boolean
  onBack: () => void
  onSubmit: () => void
  onEdit: (step: StepId) => void
}) {
  const get = (key: string) => {
    const raw = draft?.[key]
    if (raw === null || raw === undefined || raw === '') return null
    if (Array.isArray(raw)) return raw.length ? raw.join(', ') : null
    return String(raw)
  }

  // Mirrors what public_submit_application() enforces, so the applicant is told
  // what is missing before the server refuses it.
  const missing = useMemo(() => {
    const required: [string, string][] = [
      ['institution_name', 'Institution name'],
      ['institution_type', 'Institution type'],
      ['official_email', 'Official email'],
      ['city', 'City'],
      ['state', 'State'],
      ['representative_name', 'Representative name'],
      ['representative_designation', 'Representative designation'],
      ['representative_email', 'Representative email'],
      ['representative_phone', 'Representative phone'],
    ]
    return required.filter(([key]) => !get(key)).map(([, label]) => label)
  }, [draft]) // eslint-disable-line react-hooks/exhaustive-deps

  const sections: { step: StepId; title: string; rows: [string, string | null][] }[] = [
    {
      step: 'organization',
      title: 'Organisation',
      rows: [
        ['Institution name', get('institution_name')],
        ['Type', get('institution_type') ? humaniseEnum(get('institution_type')!) : null],
        ['Category', get('category') ? humaniseEnum(get('category')!) : null],
        ['Official email', get('official_email')],
        ['Official phone', get('official_phone')],
        ['Website', get('website')],
        ['Year established', get('year_established')],
        ['Registration number', get('registration_number')],
        ['Field of work', get('field_of_work')],
      ],
    },
    {
      step: 'address',
      title: 'Address',
      rows: [
        ['Address', get('address_line')],
        ['City', get('city')],
        ['State', get('state')],
        ['Country', get('country')],
        ['Postal code', get('postal_code')],
      ],
    },
    {
      step: 'representative',
      title: 'Authorised representative',
      rows: [
        ['Name', get('representative_name')],
        ['Designation', get('representative_designation')],
        ['Email', get('representative_email')],
        ['Phone', get('representative_phone')],
      ],
    },
    {
      step: 'detail',
      title: 'Institution detail',
      rows: [
        ['Students', get('estimated_student_count')],
        ['Teachers', get('estimated_teacher_count')],
        ['Departments', get('departments')],
        ['Programmes', get('programs')],
        ['Specialisations', get('specializations')],
      ],
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {missing.length ? (
        <div
          role="alert"
          className="border-warning/40 bg-warning/10 flex flex-col gap-1.5 rounded-lg border p-4"
        >
          <p className="text-sm font-medium">Some required information is still missing</p>
          <p className="text-muted-foreground text-sm">{missing.join(', ')}</p>
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.step} className="bg-card rounded-lg border">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h3 className="font-heading text-sm font-semibold">{section.title}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(section.step)}>
              Edit
            </Button>
          </div>
          <dl className="grid gap-px sm:grid-cols-2">
            {section.rows.map(([label, content]) => (
              <div key={label} className="flex flex-col gap-1 p-4">
                <dt className="text-muted-foreground text-[11px] tracking-wide uppercase">
                  {label}
                </dt>
                <dd className="text-sm break-words">
                  {content ?? <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="bg-card rounded-lg border">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-heading text-sm font-semibold">
            Documents ({documents.length})
          </h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => onEdit('documents')}>
            Edit
          </Button>
        </div>
        {documents.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">
            No documents attached. AFI headquarters may request them during review.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {documents.map((document) => (
              <li key={document.id} className="flex items-center gap-3 p-4 text-sm">
                <FileCheck2 className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{document.file_name}</span>
                <span className="text-muted-foreground text-xs">
                  {humaniseEnum(document.document_type)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap justify-between gap-3 border-t pt-6">
        <Button type="button" variant="ghost" onClick={onBack} disabled={pending}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={onSubmit}
          disabled={pending || missing.length > 0}
          aria-busy={pending}
        >
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            <>
              Submit application
              <Send className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function SubmittedReceipt({
  receipt,
}: {
  receipt: { applicationRef: string; institutionName: string; applicantEmail: string }
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <span className="bg-success/10 text-success flex size-16 items-center justify-center rounded-full">
        <CheckCircle2 className="size-8" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight">
          Application submitted
        </h2>
        <p className="text-muted-foreground max-w-lg">
          {receipt.institutionName} has been submitted to AFI headquarters for review.
        </p>
      </div>

      <div className="bg-muted/40 flex flex-col items-center gap-2 rounded-lg border px-8 py-6">
        <span className="afi-eyebrow">Your application reference</span>
        <p className="afi-metric text-2xl font-semibold tracking-wider">
          {receipt.applicationRef}
        </p>
      </div>

      <p className="text-muted-foreground max-w-lg text-sm">
        Keep this reference. You can track progress at any time using it together with{' '}
        <span className="text-foreground font-medium">{receipt.applicantEmail}</span> — a one-time
        code is sent to that address to confirm it is you.
      </p>

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/application-status">Track this application</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Return to afi.in</Link>
        </Button>
      </div>
    </div>
  )
}
