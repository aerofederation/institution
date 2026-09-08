import { Badge } from '@/components/ui/badge'
import { requireSession } from '@/lib/auth/session'
import { ROLE_LABEL } from '@/lib/permissions/definitions'

import { SignOutButton } from './sign-out-button'

/**
 * Renders the resolved session for a signed-in user.
 *
 * This is the Phase 2 stand-in for the four role workspaces, and it is
 * deliberately a report rather than a dashboard: everything on it is read from
 * the database through `getSessionContext()`, so it demonstrates that
 * authentication, the profile link, role resolution, tenant binding and the
 * permission set all work end to end. There are no metrics on it because there
 * is nothing real to count yet, and inventing numbers would defeat the purpose.
 *
 * The HQ command centre, institution operations centre, teacher workspace and
 * student learning environment replace this in their own phases.
 */
export async function SessionPanel({ heading, blurb }: { heading: string; blurb: string }) {
  const session = await requireSession()
  const permissions = [...session.permissions].sort()

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="text-muted-foreground text-[10px] font-medium tracking-[0.2em] uppercase">
            Aero Federation of India
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{heading}</h1>
          <p className="text-muted-foreground max-w-prose text-sm text-pretty">{blurb}</p>
        </div>
        <SignOutButton />
      </header>

      <section aria-labelledby="account-heading" className="flex flex-col gap-3">
        <h2 id="account-heading" className="text-sm font-medium">
          Account
        </h2>
        <dl className="grid gap-px overflow-hidden rounded-lg border sm:grid-cols-2">
          <Detail label="Name" value={session.fullName} />
          <Detail label="Email" value={session.email} />
          <Detail label="Role" value={ROLE_LABEL[session.role]} />
          <Detail label="Status" value={session.status} />
          <Detail
            label="Institution"
            value={session.institutionName ?? 'Federation level — no institution'}
          />
          <Detail
            label="Institution status"
            value={session.institutionStatus ?? 'Not applicable'}
          />
        </dl>
      </section>

      <section aria-labelledby="permissions-heading" className="flex flex-col gap-3">
        <h2 id="permissions-heading" className="text-sm font-medium">
          Permissions granted by this role
          <span className="text-muted-foreground ml-2 font-normal">({permissions.length})</span>
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm text-pretty">
          Read from <code className="text-xs">role_permissions</code> in the database, not from
          anything in the browser. Every screen and server action asks whether a permission is
          present, never which role is held.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {permissions.map((permission) => (
            <li key={permission}>
              <Badge variant="secondary" className="font-mono text-[11px] font-normal">
                {permission}
              </Badge>
            </li>
          ))}
        </ul>
      </section>

      <section className="text-muted-foreground border-t pt-6 text-sm">
        <p className="max-w-prose text-pretty">
          Phase 2 delivers the database, authentication and security foundation. This workspace is
          built in a later phase — nothing here is a placeholder for functionality that silently
          does nothing.
        </p>
      </section>
    </main>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background flex flex-col gap-1 p-4 outline outline-transparent">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-[0.08em] uppercase">
        {label}
      </dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}
