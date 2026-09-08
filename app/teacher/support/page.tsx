import { SupportScreen } from '@/components/support/support-screen'

export const metadata = { title: 'Support' }

export default async function TeacherSupportPage({
  searchParams,
}: PageProps<'/teacher/support'>) {
  const query = await searchParams
  const openTicketId = typeof query.ticket === 'string' ? query.ticket : null

  return <SupportScreen eyebrow="Teaching" homeHref="/teacher" openTicketId={openTicketId} />
}
