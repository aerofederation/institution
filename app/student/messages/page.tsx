import { MessagesScreen } from '@/components/messaging/messages-screen'

export const metadata = { title: 'Messages' }

export default async function StudentMessagesPage({
  searchParams,
}: PageProps<'/student/messages'>) {
  const query = await searchParams
  const requested = typeof query.chat === 'string' ? query.chat : null

  return <MessagesScreen basePath="/student/messages" eyebrow="Learning" requested={requested} />
}
