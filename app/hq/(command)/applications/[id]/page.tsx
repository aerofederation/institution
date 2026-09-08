import { notFound } from 'next/navigation'
import Link from 'next/link'

import { Building2, FileText, Mail, MapPin, Phone } from 'lucide-react'

import { ApplicationReview } from '@/components/hq/application-review'
import { formatDate, humaniseAction } from '@/components/hq/activity-timeline'
import { PageHeader, Section } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { humaniseEnum } from '@/lib/constants/enums'
import { getApplication, getApplicationHistory, listDocuments } from '@/services/hq/directory'

export const metadata = { title: 'Application review' }

export default async function HqApplicationDetailPage({
  params,
}: PageProps<'/hq/applications/[id]'>) {
  const { id } = await params

  const application = await getApplication(id)
  if (!application) notFound()

  const [history, documents] = await Promise.all([
    getApplicationHistory(id),
    listDocuments({ applicationId: id, page: 1 }),
  ])

  return (
    <>
      <PageHeader
        eyebrow={application.application_ref}
        title={application.institution_name}
        description={`${humaniseEnum(application.institution_type)} · ${humaniseEnum(application.category)}`}
        breadcrumbs={[
          { label: 'HQ', href: '/hq' },
          { label: 'Applications', href: '/hq/applications' },
          { label: application.application_ref },
        ]}
        actions={
          application.institution_id ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/hq/institutions/${application.institution_id}`}>
                <Building2 className="size-4" aria-hidden="true" />
                View institution
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={application.status} />
        <span className="text-sm text-muted-foreground">
          Submitted {formatDate(application.submitted_at ?? application.created_at)}
        </span>
      </div>

      <Section
        title="Decision"
        description="Transitions are validated by the database state machine; every decision is recorded in the application history."
      >
        <div className="rounded-lg border bg-card p-5">
          <ApplicationReview
            applicationId={application.id}
            currentStatus={application.status}
            institutionName={application.institution_name}
          />
        </div>
      </Section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-8">
          <Section title="Organisation">
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
              <Field label="Official email" value={application.official_email} icon={Mail} />
              <Field label="Official phone" value={application.official_phone} icon={Phone} />
              <Field label="Website" value={application.website} href={application.website} />
              <Field
                label="Year established"
                value={application.year_established?.toString() ?? null}
              />
              <Field label="Registration number" value={application.registration_number} />
              <Field label="Field of work" value={application.field_of_work} />
              <Field
                label="Address"
                icon={MapPin}
                value={
                  [
                    application.address_line,
                    application.city,
                    application.state,
                    application.postal_code,
                    application.country,
                  ]
                    .filter(Boolean)
                    .join(', ') || null
                }
                span
              />
              {application.description ? (
                <Field label="Description" value={application.description} span />
              ) : null}
            </dl>
          </Section>

          <Section title="Authorised representative">
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
              <Field label="Name" value={application.representative_name} />
              <Field label="Designation" value={application.representative_designation} />
              <Field label="Email" value={application.representative_email} icon={Mail} />
              <Field label="Phone" value={application.representative_phone} icon={Phone} />
              <Field label="Tracking address" value={application.applicant_email} span />
            </dl>
          </Section>

          <Section title="Institution detail">
            <dl className="grid gap-px overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
              <Field
                label="Estimated students"
                value={application.estimated_student_count?.toLocaleString('en-IN') ?? null}
              />
              <Field
                label="Estimated teachers"
                value={application.estimated_teacher_count?.toLocaleString('en-IN') ?? null}
              />
              <Field label="Departments" value={application.departments?.join(', ') || null} span />
              <Field label="Programmes" value={application.programs?.join(', ') || null} span />
              <Field
                label="Specialisations"
                value={application.specializations?.join(', ') || null}
                span
              />
              {application.aerospace_relevance ? (
                <Field label="Relevance to the federation" value={application.aerospace_relevance} span />
              ) : null}
            </dl>
          </Section>

          <Section
            title="Documents"
            description="Verification documents submitted with this application."
          >
            {documents.rows.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No documents attached"
                description="The applicant has not uploaded any verification documents for this application."
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border bg-card">
                {documents.rows.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center gap-3 p-4">
                    <FileText
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium">{document.file_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {humaniseEnum(document.document_type)} ·{' '}
                        {(document.file_size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                    <StatusBadge status={document.verification_status} size="sm" />
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/hq/documents?q=${encodeURIComponent(document.file_name)}`}>
                        Open
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <Section title="Review history" description="Written by the database on every transition.">
          <div className="rounded-lg border bg-card p-5">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No transitions recorded yet.</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {history.map((entry, index) => (
                  <li key={entry.id} className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={entry.to_status} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        {entry.from_status
                          ? `from ${humaniseAction(entry.from_status).toLowerCase()}`
                          : 'created'}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString('en-IN')} ·{' '}
                      {entry.actor_kind.toLowerCase()}
                    </span>
                    {entry.comments ? (
                      <p className="mt-1 text-sm whitespace-pre-line text-foreground/90">
                        {entry.comments}
                      </p>
                    ) : null}
                    {index < history.length - 1 ? <Separator className="mt-3" /> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Section>
      </div>
    </>
  )
}

function Field({
  label,
  value,
  icon: Icon,
  href,
  span,
}: {
  label: string
  value: string | null | undefined
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  href?: string | null
  span?: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 bg-card p-4 ${span ? 'sm:col-span-2' : ''}`}>
      <dt className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3" aria-hidden={true} /> : null}
        {label}
      </dt>
      <dd className="text-sm break-words">
        {value ? (
          href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-primary underline-offset-4 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </dd>
    </div>
  )
}
