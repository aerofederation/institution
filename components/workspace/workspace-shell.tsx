import Link from 'next/link'

import { AlertTriangle, Bell, ShieldAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { WorkspaceSidebar } from '@/components/workspace/workspace-sidebar'
import type { WorkspaceKey } from '@/components/workspace/nav-registry'
import type { SessionContext } from '@/lib/auth/session'
import { ROLE_LABEL, type PermissionCode } from '@/lib/permissions/definitions'

/**
 * Chrome for a tenant workspace: sidebar, top bar, content column.
 */
export function WorkspaceShell({
  session,
  navKey,
  homeHref,
  title,
  subtitle,
  /**
   * Where the bell goes. Omitted for a workspace that has no notification
   * surface yet, in which case no bell is drawn — a bell leading nowhere is
   * worse than none.
   */
  notificationsHref,
  unreadNotifications = 0,
  children,
}: {
  session: SessionContext
  navKey: WorkspaceKey
  homeHref: string
  title: string
  subtitle: string
  notificationsHref?: string
  unreadNotifications?: number
  children: React.ReactNode
}) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      {/*
       * The collapsed sidebar renders each item's label as a tooltip, and Radix
       * requires a provider above every Tooltip. This version of the shadcn
       * SidebarProvider does not include one, so without this every page in the
       * workspace throws on render — a failure the build cannot see, because
       * these routes are server-rendered on demand.
       */}
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <WorkspaceSidebar
            navKey={navKey}
            homeHref={homeHref}
            title={title}
            subtitle={subtitle}
            permissions={[...session.permissions] as PermissionCode[]}
            fullName={session.fullName}
            email={session.email}
            roleLabel={ROLE_LABEL[session.role]}
          />

          <SidebarInset className="min-w-0">
            <header className="bg-background/85 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-md">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 h-5" />

              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {session.institutionName}
              </span>

              {notificationsHref ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className="relative shrink-0"
                  aria-label={
                    unreadNotifications > 0
                      ? `Notifications, ${unreadNotifications} unread`
                      : 'Notifications'
                  }
                >
                  <Link href={notificationsHref}>
                    <Bell className="size-4" aria-hidden="true" />
                    {unreadNotifications > 0 ? (
                      <span className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium tabular-nums">
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    ) : null}
                  </Link>
                </Button>
              ) : null}

              {session.institutionStatus === 'SUSPENDED' ? (
                <span className="border-destructive/40 bg-destructive/10 text-destructive inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase">
                  <AlertTriangle className="size-3" aria-hidden="true" />
                  Suspended
                </span>
              ) : (
                <span className="border-primary/30 bg-primary/10 text-primary hidden shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase sm:inline-flex">
                  {ROLE_LABEL[session.role]}
                </span>
              )}
            </header>

            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

/**
 * Shown to a signed-in user who reached the wrong workspace.
 *
 * They are told what happened rather than bounced silently to their own: they
 * followed a link, something moved, and a redirect with no explanation is the
 * least useful response. Nothing tenant-scoped is fetched to render this, so
 * nothing is disclosed by showing it.
 */
export function WorkspaceAccessDenied({
  session,
  audience,
}: {
  session: SessionContext | null
  audience: string
}) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="border-destructive/30 bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-xl border">
        <ShieldAlert className="size-6" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          This workspace is for {audience}
        </h1>
        <p className="text-muted-foreground text-sm text-pretty">
          {session
            ? `You are signed in as ${session.email}, which is a ${ROLE_LABEL[session.role]} account.`
            : 'Sign in with the account issued to you to continue.'}
        </p>
        {session && session.status === 'INVITED' ? (
          <p className="text-muted-foreground text-sm text-pretty">
            This account has not been activated. Use the link that was emailed to you to set a
            password first.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/">Back to afi.in</Link>
        </Button>
        <Button asChild size="sm">
          <Link href="/login">{session ? 'Switch account' : 'Sign in'}</Link>
        </Button>
      </div>
    </div>
  )
}
