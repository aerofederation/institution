import type { Metadata } from 'next'
import Link from 'next/link'

import { ArrowRight, Building2, GraduationCap, Users } from 'lucide-react'

import { AfiLockup } from '@/components/brand/afi-lockup'

import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Sign in',
  description:
    'Access the Aero Federation of India portal as an institution administrator, educator or student.',
}

/**
 * The AFI portal sign-in.
 *
 * A split composition rather than a card floating on a plain background: the
 * left panel carries the brand and the federation's visual language, the right
 * does the work. It shares its type, spacing and palette with the public site,
 * so arriving here from the homepage does not feel like leaving the product.
 */
export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const requested = typeof params.next === 'string' ? params.next : undefined
  const error = typeof params.error === 'string' ? params.error : undefined

  // Same-site paths only; anything else is discarded rather than followed.
  const next = requested && /^\/(?!\/)[A-Za-z0-9/_?&=.%-]*$/.test(requested) ? requested : undefined

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* ── Brand panel ──────────────────────────────────────────────────── */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-navy-950 p-10 text-white lg:flex xl:p-14">
        <svg
          className="pointer-events-none absolute -right-32 -bottom-40 size-[46rem] text-white opacity-[0.14]"
          viewBox="0 0 400 400"
          fill="none"
          aria-hidden="true"
        >
          <circle cx="200" cy="200" r="180" stroke="currentColor" strokeWidth="0.6" />
          <circle
            cx="200"
            cy="200"
            r="132"
            stroke="currentColor"
            strokeWidth="0.6"
            strokeDasharray="5 9"
          />
          <circle cx="200" cy="200" r="84" stroke="currentColor" strokeWidth="0.6" />
          <g className="afi-orbit" style={{ transformOrigin: '200px 200px' }}>
            <circle cx="380" cy="200" r="5" fill="currentColor" />
          </g>
        </svg>

        <AfiLockup
          href="/"
          tone="inverted"
          size={38}
          descriptor="Institution Portal"
          className="relative"
        />

        <div className="relative flex max-w-lg flex-col gap-6">
          <h1 className="font-heading text-4xl leading-[1.1] font-semibold tracking-tight xl:text-5xl">
            One network for every department.
          </h1>
          <p className="text-base text-white/65">
            Institutions, educators and learners work in a single connected ecosystem — academic
            structure, learning, assessment and analytics in one place.
          </p>

          <ul className="mt-2 flex flex-col gap-3">
            {[
              { icon: Building2, label: 'Institutions manage their academic network' },
              { icon: Users, label: 'Educators teach, assess and track progress' },
              { icon: GraduationCap, label: 'Students learn with AI-assisted support' },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-3 text-sm text-white/70">
                <item.icon className="size-4 shrink-0 text-white/45" aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[10px] tracking-[0.14em] text-white/35 uppercase">
          Accounts are issued by your institution
        </p>
      </section>

      {/* ── Form panel ───────────────────────────────────────────────────── */}
      <section className="flex items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <AfiLockup href="/" tone="default" size={32} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="afi-eyebrow">Secure portal access</span>
            <h2 className="font-heading text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">
              Use the account issued to you by your institution.
            </p>
          </div>

          {error === 'link_invalid' ? (
            <p
              role="alert"
              className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              That link is no longer valid. It may have expired or already been used — request a new
              one below.
            </p>
          ) : null}

          <div className="mt-8">
            <LoginForm next={next} />
          </div>

          <div className="mt-8 flex flex-col gap-4 border-t pt-6">
            <p className="text-sm text-muted-foreground">
              Need an institution account?{' '}
              <Link
                href="/apply"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Register your institution
                <ArrowRight className="ml-0.5 inline size-3.5" aria-hidden="true" />
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              Already applied?{' '}
              <Link href="/application-status" className="underline underline-offset-4">
                Track your application
              </Link>
            </p>
            <p className="text-xs text-muted-foreground/80">
              Headquarters administrator?{' '}
              <Link href="/hq/login" className="underline underline-offset-4">
                HQ access
              </Link>
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
