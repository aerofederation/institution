import { KeyRound, Settings2, ShieldCheck, UserCog } from 'lucide-react'

import { PageHeader, Section } from '@/components/shared/page-header'
import { StatusBadge } from '@/components/shared/status-badge'
import { Button } from '@/components/ui/button'
import { requireHq } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABEL } from '@/lib/permissions/definitions'

export const metadata = { title: 'Settings' }

/**
 * HQ settings.
 *
 * Read-mostly by design. Platform configuration lives in `system_settings`,
 * which carries a CHECK constraint rejecting credential-shaped keys, and the
 * genuinely dangerous levers — role assignment, RLS policy, storage
 * configuration, connection secrets — are deliberately not reachable from a
 * browser at all. HQ authorisation itself is granted only by a controlled
 * database procedure.
 */
export default async function HqSettingsPage() {
  const session = await requireHq()
  const supabase = await createClient()

  const { data: settings, error } = await supabase
    .from('system_settings')
    .select('key, value, description, is_public, updated_at')
    .order('key')

  if (error) throw error

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Settings"
        description="Your account, session security and platform configuration."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Settings' }]}
      />

      <Section title="Profile">
        <dl className="grid gap-px overflow-hidden rounded-lg border bg-card sm:grid-cols-2">
          <Row label="Name" value={session.fullName} icon={UserCog} />
          <Row label="Email" value={session.email} />
          <Row label="Role" value={ROLE_LABEL[session.role]} />
          <Row label="Scope" value="Federation-wide (no institution)" />
        </dl>
        <p className="text-xs text-muted-foreground">
          Name and contact details are edited from your account profile. Role and scope are not
          editable from any interface — they are set by a controlled database procedure.
        </p>
      </Section>

      <Section id="security" title="Security">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border bg-card p-5">
            <ShieldCheck className="size-4 text-success" aria-hidden="true" />
            <h3 className="font-heading text-sm font-semibold">Account status</h3>
            <div>
              <StatusBadge status={session.status} size="sm" />
            </div>
            <p className="text-sm text-muted-foreground">
              Row Level Security is enforced on every query this session makes. Authorisation is
              re-derived from your profile on each request rather than trusted from the browser.
            </p>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border bg-card p-5">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
            <h3 className="font-heading text-sm font-semibold">Password</h3>
            <p className="text-sm text-muted-foreground">
              Passwords are held by Supabase Auth and never stored by this platform. Changing one
              goes through the verified reset flow.
            </p>
            <Button asChild variant="outline" size="sm" className="self-start">
              <a href="/forgot-password">Change password</a>
            </Button>
          </div>
        </div>
      </Section>

      <Section
        title="System configuration"
        description="Operational settings. Credentials live in the server environment and never here — the database rejects credential-shaped keys in this table."
      >
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Platform system settings</caption>
            <thead className="bg-muted/40">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Key
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Value
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase lg:table-cell"
                >
                  Description
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-left text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  Visibility
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(settings ?? []).map((setting) => (
                <tr key={setting.key}>
                  <td className="px-4 py-3 font-mono text-xs">{setting.key}</td>
                  <td className="afi-metric px-4 py-3 text-xs">{JSON.stringify(setting.value)}</td>
                  <td className="hidden px-4 py-3 text-xs text-muted-foreground lg:table-cell">
                    {setting.description}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {setting.is_public ? 'Public' : 'Internal'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          <Settings2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Editing these values from the interface is intentionally not enabled yet. Each one
            changes platform-wide behaviour, so the edit path is built alongside the confirmation
            and audit workflow it needs rather than shipped as a bare input.
          </p>
        </div>
      </Section>
    </>
  )
}

function Row({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
}) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="flex items-center gap-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">
        {Icon ? <Icon className="size-3" aria-hidden={true} /> : null}
        {label}
      </dt>
      <dd className="text-sm break-words">{value}</dd>
    </div>
  )
}
