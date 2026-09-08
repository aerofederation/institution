import { MessagesScreen } from '@/components/messaging/messages-screen'

export const metadata = { title: 'Messages' }

export default async function TeacherMessagesPage({
  searchParams,
}: PageProps<'/teacher/messages'>) {
  const query = await searchParams
  const requested = typeof query.chat === 'string' ? query.chat : null

  return <MessagesScreen basePath="/teacher/messages" eyebrow="Teaching" requested={requested} />
}
