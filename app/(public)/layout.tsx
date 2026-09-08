import { SiteFooter } from '@/components/public/site-footer'
import { SiteHeaderSlot } from '@/components/public/site-header-slot'

/**
 * Public site shell.
 *
 * The header decides its own transparent-over-hero treatment from the current
 * route, which keeps this layout a Server Component and the footer entirely
 * static.
 */
export default function PublicLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SiteHeaderSlot />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter />
    </>
  )
}
