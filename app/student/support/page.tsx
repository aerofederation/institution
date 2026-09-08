import { SupportScreen } from '@/components/support/support-screen'

export const metadata = { title: 'Support' }

export default async function StudentSupportPage({
  searchParams,
}: PageProps<'/student/support'>) {
  const query = await searchParams
  const openTicketId = typeof query.ticket === 'string' ? query.ticket : null

  return <SupportScreen eyebrow="Learning" homeHref="/student" openTicketId={openTicketId} />
}
