import type { Metadata } from 'next'
import Link from 'next/link'

import { Activity, Database, Lock, ShieldCheck } from 'lucide-react'

import { AfiLockup } from '@/components/brand/afi-lockup'

import { HqLoginForm } from './hq-login-form'

export const metadata: Metadata = {
  title: 'HQ Command Centre access',
  description:
    'Restricted authentication for Aero Federation of India headquarters administrators.',
  robots: { index: false, follow: false },
}

/**
 * HQ sign-in.
 *
 * Visually distinct from the portal sign-in on purpose: reaching this page
 * should feel like arriving somewhere restricted. Dark operational surface,
 * technical grid, orbital geometry, live system readouts — the language of an
 * operations room rather than a marketing page.
 *
 * There is deliberately no "create HQ account", no role selector and no link to
 * request access. HQ authorisation is granted only by a controlled database
 * procedure, so offering any of those on this page would be a lie about how the
 * platform works.
 */
export default async function HqLoginPage({ searchParams }: PageProps<'/hq/login'>) {
  const params = await searchParams
  const requested = typeof params.next === 'string' ? params.next : undefined
  // Only same-site paths inside /hq survive.
  const next = requested && /^\/hq(\/[A-Za-z0-9/_?&=.-]*)?$/.test(requested) ? requested : undefined

  return (
    <div className="dark relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* ── Environment ──────────────────────────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent"
        aria-hidden="true"
      />
      {/* Orbital arcs, anchored off-canvas so only the sweep is visible. */}
      <svg
        className="pointer-events-none absolute -top-1/3 -right-1/4 size-[52rem] opacity-[0.18]"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="200" cy="200" r="190" stroke="currentColor" strokeWidth="0.5" />
        <circle
          cx="200"
          cy="200"
          r="150"
          stroke="currentColor"
          strokeWidth="0.5"
          strokeDasharray="4 8"
        />
        <circle cx="200" cy="200" r="110" stroke="currentColor" strokeWidth="0.5" />
        <g className="afi-orbit" style={{ transformOrigin: '200px 200px' }}>
          <circle cx="390" cy="200" r="4" className="fill-primary" />
        </g>
      </svg>

      <div className="relative grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* ── Identity panel ─────────────────────────────────────────────── */}
        <section className="hidden flex-col justify-between border-r p-10 lg:flex xl:p-14">
          <AfiLockup
            href="/"
            tone="inverted"
            size={38}
            descriptor="Headquarters"
          />

          <div className="flex max-w-lg flex-col gap-6">
            <span className="afi-eyebrow">Restricted access</span>
            <h1 className="font-heading text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl">
              HQ Command Centre
            </h1>
            <p className="text-base text-muted-foreground">
              Federation-wide oversight of institutions, applications, educators and learners across
              the AFI network. Access is limited to headquarters administrators.
            </p>

            <div className="afi-hairline" />

            <ul className="flex flex-col gap-3">
              {[
                {
                  icon: ShieldCheck,
                  label: 'Row Level Security enforced on every query',
                },
                { icon: Database, label: 'Authorisation re-derived from the account record' },
                { icon: Activity, label: 'All access recorded in an append-only audit log' },
              ].map((item) => (
                <li
                  key={item.label}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <item.icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <dl className="grid max-w-lg grid-cols-3 gap-4 border-t pt-6">
            {[
              { label: 'Surface', value: 'HQ' },
              { label: 'Channel', value: 'TLS 1.3' },
              { label: 'Session', value: 'Cookie · refreshed' },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <dt className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground uppercase">
                  {item.label}
                </dt>
                <dd className="font-mono text-xs">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Authentication panel ───────────────────────────────────────── */}
        <section className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 lg:hidden">
              <AfiLockup href="/" tone="inverted" size={32} />
            </div>

            <div className="flex flex-col gap-7 rounded-xl border bg-card/70 p-7 backdrop-blur-sm sm:p-8">
              <div className="flex flex-col gap-2">
                <span className="flex w-fit items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
                  <Lock className="size-3" aria-hidden="true" />
                  Authorised personnel
                </span>
                <h2 className="font-heading text-xl font-semibold">Secure HQ access</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with your headquarters administrator credentials.
                </p>
              </div>

              <HqLoginForm next={next} />
            </div>

            <div className="mt-6 flex flex-col gap-2 text-xs text-muted-foreground">
              <p>
                Institution, educator or student?{' '}
                <Link href="/login" className="text-foreground underline underline-offset-4">
                  Use the AFI portal sign-in
                </Link>
                .
              </p>
              <p>
                <Link href="/forgot-password" className="underline underline-offset-4">
                  Forgot your passphrase?
                </Link>
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
