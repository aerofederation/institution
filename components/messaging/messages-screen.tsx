import { Messenger } from '@/components/messaging/messenger'
import { PageHeader } from '@/components/shared/page-header'
import { requireTenant } from '@/lib/auth/session'
import { listConversations, listMessageContacts, listMessages } from '@/services/messaging'

/**
 * The messaging screen, shared by both workspaces.
 *
 * A teacher and a student see the same thing, because the difference between
 * them is decided in the database rather than here: `my_conversations()`
 * returns whichever side of each pair the caller is on, and
 * `my_message_contacts()` returns their students or their teachers. Two copies
 * of this file would be two places for that to drift.
 */
export async function MessagesScreen({
  basePath,
  eyebrow,
  requested,
}: {
  basePath: string
  eyebrow: string
  requested: string | null
}) {
  const session = await requireTenant()

  const [conversations, contacts] = await Promise.all([
    listConversations(),
    listMessageContacts(),
  ])

  /*
   * A conversation id from the query string is honoured only if it appears in
   * the caller's own list. The database would refuse the messages anyway —
   * `messages_select` calls `private.in_conversation()` — but resolving it here
   * means an unrecognised id opens the empty state rather than an empty thread
   * with somebody else's name on it.
   */
  const active = requested && conversations.some((item) => item.id === requested) ? requested : null
  const messages = active ? await listMessages(active) : []
  const counterpart = conversations.find((item) => item.id === active)?.counterpart_name ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={eyebrow}
        title="Messages"
        description="Private conversations. Only you and the person you are writing to can read them."
      />

      <Messenger
        me={session.userId}
        basePath={basePath}
        conversations={conversations}
        contacts={contacts}
        activeId={active}
        initialMessages={messages}
        counterpartName={counterpart}
      />
    </div>
  )
}
