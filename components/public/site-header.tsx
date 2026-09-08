'use client'

import { useState } from 'react'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Menu, X } from 'lucide-react'

import { AfiLockup } from '@/components/brand/afi-lockup'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/careers', label: 'Careers' },
  { href: '/department', label: 'Departments' },
  { href: '/notices', label: 'Notices' },
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
    <header className="sticky top-3 sm:top-4 z-50 w-full px-4 sm:px-6 pointer-events-none">
      <div className="mx-auto flex h-14 sm:h-16 w-full max-w-6xl items-center justify-between rounded-full bg-white/80 dark:bg-navy-900/80 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] px-4 sm:px-6 transition-all duration-300 pointer-events-auto">
        {/* Left: Brand Lockup */}
        <AfiLockup size={34} className="shrink-0" />

        {/* Center: Nav links */}
        <nav aria-label="Primary" className="hidden md:flex flex-1 justify-center">
          <ul className="flex items-center gap-8">
            {NAV.map((item) => {
              const active =
                item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'text-sm font-medium transition-colors',
                      active
                        ? 'text-foreground font-semibold'
                        : 'text-slate-700 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white',
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
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center justify-center rounded-full bg-white dark:bg-white/10 px-5 py-2 text-sm font-medium text-slate-800 dark:text-white shadow-xs border border-slate-200/80 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/15 transition-all"
          >
            Candidate login
          </Link>

          <Link
            href="/partner/login"
            className="inline-flex items-center justify-center rounded-full bg-[#ff5e14] px-5 py-2 text-sm font-semibold text-white shadow-md shadow-orange-500/25 hover:bg-[#f04f05] hover:shadow-orange-500/35 transition-all"
          >
            Partner login
          </Link>

          {/* ── Mobile Menu Trigger ───────────────────────────────────── */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden rounded-full h-9 w-9 text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10"
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

              <nav aria-label="Mobile" className="flex flex-col p-4 gap-1">
                {NAV.map((item) => {
                  const active =
                    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'rounded-xl px-4 py-2.5 text-sm font-medium transition-colors',
                        active
                          ? 'bg-slate-100 dark:bg-white/10 text-foreground font-semibold'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </nav>

              <div className="flex flex-col gap-2.5 border-t p-5">
                <Link
                  href="/partner/login"
                  className="flex items-center justify-center rounded-full bg-[#ff5e14] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-500/25 hover:bg-[#f04f05] transition-all text-center"
                >
                  Partner login
                </Link>
                <Link
                  href="/login"
                  className="flex items-center justify-center rounded-full bg-white dark:bg-white/10 px-5 py-2.5 text-sm font-medium text-slate-800 dark:text-white shadow-xs border border-slate-200/80 dark:border-white/15 hover:bg-slate-50 dark:hover:bg-white/15 transition-all text-center"
                >
                  Candidate login
                </Link>
                <Button asChild variant="ghost" size="sm" className="rounded-full mt-1">
                  <Link href="/dashboard">Track my application</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
