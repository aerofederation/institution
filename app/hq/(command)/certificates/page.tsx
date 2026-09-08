import { Award } from 'lucide-react'

import { PageHeader } from '@/components/shared/page-header'
import { ComingSoon } from '@/components/shared/states'

export const metadata = { title: 'Certificates' }

/**
 * Certificate oversight.
 *
 * The `certificates` table and the public `/verify/[certificateId]` lookup are
 * introduced in Phase 20. Showing a certificate register with nothing behind it
 * would undermine the one property a verification system needs, which is that
 * what it displays is true.
 */
export default function HqCertificatesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Records"
        title="Certificates"
        description="Certificates issued across the federation and their verification status."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Certificates' }]}
      />

      <ComingSoon
        title="Certificate issuance and verification arrive in Phase 20"
        description="The certificate register, its issuance workflow and the public verification endpoint depend on the certificates table. A verification surface has to be trustworthy from the first day it exists, so nothing is shown until it is backed by real records."
        phase="Phase 20"
        icon={Award}
      />
    </>
  )
}
