import { notFound } from 'next/navigation'

import { InstitutionProfileForm } from '@/components/institution/institution-profile-form'
import { PageHeader, Section } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { humaniseEnum } from '@/lib/constants/enums'
import { getSessionContext } from '@/lib/auth/session'
import { getOwnInstitution } from '@/services/institution/profile'

export const metadata = { title: 'Settings' }

export default async function InstitutionSettingsPage() {
  const [institution, session] = await Promise.all([getOwnInstitution(), getSessionContext()])
  if (!institution) notFound()

  const editable = session?.permissions.has('institution.update') ?? false

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Institution settings"
        description="Your institution's public profile and contact details."
        breadcrumbs={[{ label: 'Institution', href: '/institution' }, { label: 'Settings' }]}
        actions={<StatusBadge status={institution.status} />}
      />

      <Section
        title="Federation record"
        description="Set by AFI headquarters when your institution was admitted. These are not editable here."
      >
        <dl className="bg-muted/40 grid gap-x-8 gap-y-5 rounded-lg border p-5 sm:grid-cols-3">
          <Detail label="Type">{humaniseEnum(institution.institution_type)}</Detail>
          <Detail label="Category">{humaniseEnum(institution.category)}</Detail>
          <Detail label="Public URL">
            <span className="font-mono text-xs">/institutions/{institution.slug}</span>
          </Detail>
          <Detail label="Registration number">{institution.registration_number ?? '—'}</Detail>
          <Detail label="Established">{institution.year_established ?? '—'}</Detail>
          <Detail label="Admitted">
            {institution.approved_at
              ? new Date(institution.approved_at).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })
              : '—'}
          </Detail>
        </dl>
      </Section>

      <Section
        title="Profile"
        description={
          editable
            ? 'Shown on your public institution page in the AFI directory.'
            : 'Shown on your public institution page. Your role cannot edit it.'
        }
      >
        {editable ? (
          <InstitutionProfileForm institution={institution} />
        ) : (
          <dl className="bg-card grid gap-x-8 gap-y-5 rounded-lg border p-5 sm:grid-cols-2">
            <Detail label="Email">{institution.official_email}</Detail>
            <Detail label="Phone">{institution.official_phone ?? '—'}</Detail>
            <Detail label="Website">{institution.website ?? '—'}</Detail>
            <Detail label="City">{institution.city ?? '—'}</Detail>
          </dl>
        )}
      </Section>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
        {label}
      </dt>
      <dd className="truncate text-sm">{children}</dd>
    </div>
  )
}
