'use client'

import { useState } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Menu, X } from 'lucide-react'

import { AfiLockup } from '@/components/brand/afi-lockup'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

/**
 * The institution platform's own navigation.
 *
 * Every entry is a route that exists in `app/(public)`. This header previously
 * carried the career portal's navigation — Careers, Departments, Notices,
 * Candidate and Partner login — none of which are pages in this application,
 * so all but About led to a 404. The career portal is a separate site; its
 * links do not belong here.
 */
const NAV = [
  { href: '/institutions', label: 'Institutions' },
  { href: '/education', label: 'Education' },
  { href: '/ai-classroom', label: 'AI Classroom' },
  { href: '/events', label: 'Events' },
  { href: '/announcements', label: 'Announcements' },
  { href: '/about', label: 'About' },
]

export function SiteHeader({ overHero = false }: { overHero?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Close the drawer on navigation
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  return (
    <header
      data-over-hero={overHero || undefined}
      className="pointer-events-none sticky top-3 z-50 w-full px-4 sm:top-4 sm:px-6"
    >
      <div className="pointer-events-auto mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-full border border-white/60 bg-white/80 px-4 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-xl transition-all duration-300 sm:h-16 sm:px-6 dark:border-white/10 dark:bg-navy-900/80 dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)]">
        {/* Left: Brand Lockup */}
        <AfiLockup size={34} className="shrink-0" />

        {/* Center: Nav links */}
        <nav aria-label="Primary" className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-6 xl:gap-8">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'text-sm font-medium whitespace-nowrap transition-colors',
                      active
                        ? 'font-semibold text-foreground'
                        : 'text-slate-700 hover:text-slate-950 dark:text-slate-200 dark:hover:text-white',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Right: Pill Action Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          {/* Administrators, teachers and students all sign in here. */}
          <Link
            href="/login"
            className="hidden items-center justify-center rounded-full border border-slate-200/80 bg-white px-5 py-2 text-sm font-medium whitespace-nowrap text-slate-800 shadow-xs transition-all hover:bg-slate-50 sm:inline-flex dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
          >
            Portal login
          </Link>

          {/* Below sm the lockup and this pill overflow a phone; the drawer carries it there. */}
          <Link
            href="/apply"
            className="hidden items-center justify-center rounded-full bg-[#ff5e14] px-5 py-2 text-sm font-semibold whitespace-nowrap text-white shadow-md shadow-orange-500/25 transition-all hover:bg-[#f04f05] hover:shadow-orange-500/35 sm:inline-flex"
          >
            Register institution
          </Link>

          {/* ── Mobile Menu Trigger ───────────────────────────────────── */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-slate-700 hover:bg-slate-100 lg:hidden dark:text-white dark:hover:bg-white/10"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full max-w-xs p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>

              <div className="flex items-center justify-between border-b px-5 py-4">
                <AfiLockup href={null} size={32} />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label="Close navigation menu"
                >
                  <X className="size-5" aria-hidden="true" />
                </Button>
              </div>

              <nav aria-label="Mobile" className="flex flex-col gap-1 p-4">
                {NAV.map((item) => {
                  const active = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-slate-100 font-semibold text-foreground dark:bg-white/10'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-foreground dark:text-slate-300 dark:hover:bg-white/5',
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex flex-col gap-2.5 border-t p-5">
                <Link
                  href="/apply"
                  className="flex items-center justify-center rounded-full bg-[#ff5e14] px-5 py-2.5 text-center text-sm font-semibold text-white shadow-md shadow-orange-500/25 transition-all hover:bg-[#f04f05]"
                >
                  Register institution
                </Link>
                <Link
                  href="/login"
                  className="flex items-center justify-center rounded-full border border-slate-200/80 bg-white px-5 py-2.5 text-center text-sm font-medium text-slate-800 shadow-xs transition-all hover:bg-slate-50 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
                >
                  Portal login
                </Link>
                <Button asChild variant="ghost" size="sm" className="mt-1 rounded-full">
                  <Link href="/application-status">Track your application</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
