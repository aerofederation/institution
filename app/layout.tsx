import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Noto_Sans_Devanagari, Raleway } from 'next/font/google'

import { Toaster } from '@/components/ui/sonner'
import { publicEnv } from '@/lib/env/public'

import './globals.css'

/**
 * Raleway for everything structural, IBM Plex Mono for anything numeric or
 * technical — identifiers, metrics, status codes, timestamps.
 *
 * Raleway is the face aerofederation.org uses. Matching it is the single
 * biggest thing that makes this platform read as the same organisation as the
 * public site rather than as separate software wearing the same logo.
 *
 * Plex Mono stays: a marketing site has no dashboards, and readouts still need
 * tabular alignment and a face that marks a technical value as technical.
 */
const raleway = Raleway({
  variable: '--font-archivo',
  subsets: ['latin'],
  display: 'swap',
})

/**
 * Devanagari, for the Hindi half of the official lockup.
 *
 * Loaded only for that: the wordmark is the one place the platform sets
 * Devanagari, so the subset is deliberately narrow rather than a second body
 * face nobody uses.
 */
const devanagari = Noto_Sans_Devanagari({
  variable: '--font-devanagari',
  subsets: ['devanagari'],
  weight: ['500', '600'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
})

function siteUrl() {
  try {
    return new URL(publicEnv().NEXT_PUBLIC_APP_URL)
  } catch {
    // Metadata must never be the thing that breaks a build when an optional
    // variable is absent.
    return new URL('http://localhost:3000')
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: {
    default: 'INSTITUTION | AEROFEDERATION',
    template: '%s | AEROFEDERATION',
  },
  icons: {
    icon: [
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  description:
    'The AERO FEDERATION OF INDIA connects educational institutions, educators and students through a single digital ecosystem for every department they teach, powered by AI.',
  applicationName: 'AERO FEDERATION OF INDIA',
  keywords: [
    'AERO FEDERATION OF INDIA',
    'higher education',
    'AI classroom',
    'institution network',
    'aviation education',
    'digital learning platform',
  ],
  openGraph: {
    type: 'website',
    siteName: 'AERO FEDERATION OF INDIA',
    title: 'INSTITUTION | AEROFEDERATION',
    description:
      'A national network connecting institutions, educators and students across every discipline, with AI-assisted learning.',
    locale: 'en_IN',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AERO FEDERATION OF INDIA',
    description:
      'A national network connecting institutions, educators and students across every discipline, with AI-assisted learning.',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1524' },
  ],
  colorScheme: 'light dark',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${raleway.variable} ${devanagari.variable} ${plexMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        {/* First stop for keyboard and screen-reader users on every page. */}
        <a
          href="#main"
          className="sr-only rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:not-sr-only focus-visible:absolute focus-visible:top-3 focus-visible:left-3 focus-visible:z-100"
        >
          Skip to content
        </a>
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  )
}
