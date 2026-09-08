import Link from 'next/link'

import { Bell, ShieldAlert } from 'lucide-react'

import { AfiMark } from '@/components/brand/afi-logo'
import { HqCommandSearch } from '@/components/hq/hq-command-search'
import { HqSidebar } from '@/components/hq/hq-sidebar'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { SessionContext } from '@/lib/auth/session'
import type { PermissionCode } from '@/lib/permissions/definitions'

/**
 * The HQ chrome: sidebar, top bar, content column.
 *
 * HQ is on the light palette, like the rest of the platform and like the
 * marketing site's own body. It used to scope a `dark` class to this subtree to
 * read as a separate operations surface; the orange brand carries that
 * distinction well enough on white, and one palette across HQ, the institution
 * workspace and the public site means a component cannot look right in one and
 * wrong in another.
 *
 * The HQ sign-in screen is still dark. It matches the marketing hero, which is
 * also dark, and a sign-in gate is a different kind of page from a dashboard.
 */
export function HqShell({
  session,
  unreadNotifications,
  children,
}: {
  session: SessionContext
  unreadNotifications: number
  children: React.ReactNode
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/*
       * The collapsed sidebar shows each item's label as a tooltip, and Radix
       * requires a provider above every Tooltip. This version of the shadcn
       * SidebarProvider does not include one, so without this every HQ page
       * throws on render — a failure the build cannot see, because these routes
       * are server-rendered on demand.
       */}
      <TooltipProvider delayDuration={200}>
        <SidebarProvider>
          <HqSidebar
            permissions={[...session.permissions] as PermissionCode[]}
            fullName={session.fullName}
            email={session.email}
          />

          <SidebarInset className="min-w-0">
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-md">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-1 h-5" />

              <div className="min-w-0 flex-1">
                <HqCommandSearch />
              </div>

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
                <Link href="/hq/notifications">
                  <Bell className="size-4" aria-hidden="true" />
                  {unreadNotifications > 0 ? (
                    <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-primary font-mono text-[9px] font-semibold text-primary-foreground">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  ) : null}
                </Link>
              </Button>

              <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-primary uppercase sm:inline-flex">
                HQ Admin
              </span>
            </header>

            <main id="main" className="flex min-w-0 flex-1 flex-col gap-8 p-4 sm:p-6 lg:p-8">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </div>
  )
}

/**
 * Shown to a signed-in user who is not HQ.
 *
 * A redirect would be wrong here: they are already authenticated, so bouncing
 * them to a login page implies the fix is to sign in again. This tells them
 * plainly what happened and offers the way back to their own workspace.
 *
 * No federation data is fetched to render it.
 */
export function HqAccessDenied({ session }: { session: SessionContext | null }) {
  const home =
    session?.role === 'INSTITUTION_ADMIN'
      ? '/institution'
      : session?.role === 'TEACHER'
        ? '/teacher'
        : session?.role === 'STUDENT'
          ? '/student'
          : '/'

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">

      <main
        id="main"
        className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center"
      >
        <AfiMark className="size-10" />

        <div className="flex size-14 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="afi-eyebrow">Error 403 · Access denied</span>
          <h1 className="font-heading text-2xl font-semibold">HQ Command Centre is restricted</h1>
          <p className="text-sm text-muted-foreground">
            This area is limited to Aero Federation of India headquarters administrators.
            {session ? (
              <>
                {' '}
                You are signed in as{' '}
                <span className="font-medium text-foreground">{session.email}</span>, which does not
                hold that authorisation.
              </>
            ) : (
              <> Your account does not hold that authorisation.</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href={home}>Go to your workspace</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Return to afi.in</Link>
          </Button>
        </div>

        <p className="max-w-sm text-xs text-muted-foreground/70">
          This attempt was recorded. If you believe you should have HQ access, contact the
          federation administrator — HQ authorisation is granted only through a controlled database
          procedure.
        </p>
      </main>
    </div>
  )
}
