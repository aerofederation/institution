import Link from 'next/link'

import { AfiLogo } from '@/components/brand/afi-logo'

/**
 * Shell for the secondary auth routes — forgot password, reset, activate.
 *
 * `/login` deliberately does not use this centred shell: it owns a full-bleed
 * split composition of its own. This layout only has to be quiet and let a
 * single task finish.
 */
export default function AuthLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-muted/30">

      <header className="relative px-6 py-6 sm:px-10">
        <AfiLogo />
      </header>

      <main id="main" className="relative flex flex-1 items-start justify-center px-6 pb-16">
        <div className="w-full max-w-sm rounded-xl border bg-card p-7 shadow-sm sm:p-8">
          {children}
        </div>
      </main>

      <footer className="relative px-6 py-6 text-xs text-muted-foreground sm:px-10">
        Accounts on this platform are issued by an institution — there is no public sign-up.{' '}
        <Link href="/apply" className="underline underline-offset-4">
          Register an institution
        </Link>
      </footer>
    </div>
  )
}
