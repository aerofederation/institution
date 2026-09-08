'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Loader2, MessageSquare, Paperclip, Plus, Send, X } from 'lucide-react'
import { toast } from 'sonner'

import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { RealtimeChannel } from '@supabase/supabase-js'

import { createClient, createLiveClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { MESSAGE_FILE_LIMIT, MESSAGE_MIME_TYPES } from '@/lib/validation/messaging'
import {
  getAttachmentUrl,
  markConversationRead,
  openConversation,
  requestAttachmentUpload,
  sendMessage,
  type ChatMessage,
  type ConversationSummary,
  type MessageContact,
} from '@/services/messaging'

/**
 * One teacher, one student, one thread.
 *
 * New messages arrive over Realtime rather than by polling or refreshing.
 * Realtime re-runs `messages_select` for each subscriber before forwarding a
 * row, so the `conversation_id` filter below is a convenience and the policy is
 * the boundary — a subscription aimed at somebody else's thread receives
 * nothing. That is asserted in `verify:messaging`, where a third teacher
 * subscribes to the same filter and gets no events.
 */

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

function formatDay(iso: string) {
  const date = new Date(iso)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()
  if (sameDay) return 'Today'

  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function Messenger({
  me,
  basePath,
  conversations,
  contacts,
  activeId,
  initialMessages,
  counterpartName,
}: {
  me: string
  /** `/teacher/messages` or `/student/messages`. */
  basePath: string
  conversations: ConversationSummary[]
  contacts: MessageContact[]
  activeId: string | null
  initialMessages: ChatMessage[]
  counterpartName: string | null
}) {
  const router = useRouter()

  /*
   * The thread list. Unfiltered, because RLS already limits these rows to the
   * caller's own conversations — a message to somebody else never arrives here
   * to trigger a refresh.
   */
  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    void (async () => {
      // The socket needs the token before it subscribes — see `createLiveClient`.
      await createLiveClient()
      if (cancelled) return

      channel = supabase
        .channel('conversation-list')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations' },
          () => router.refresh(),
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [router])

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[320px_1fr]">
      <ConversationColumn
        basePath={basePath}
        conversations={conversations}
        contacts={contacts}
        activeId={activeId}
        me={me}
      />

      <section
        className="bg-card flex min-h-[32rem] min-w-0 flex-col rounded-lg border"
        aria-label="Conversation"
      >
        {activeId ? (
          /*
           * Keyed by the conversation, so opening another thread mounts a fresh
           * one rather than syncing new props into old state. That sync used to
           * be an effect, which cascaded a render on every navigation and left
           * a window where the previous thread's messages sat under the new
           * name.
           */
          <Thread
            key={activeId}
            me={me}
            conversationId={activeId}
            initialMessages={initialMessages}
            counterpartName={counterpartName}
          />
        ) : (
          <div className="m-auto p-8">
            <EmptyState
              icon={MessageSquare}
              title="No conversation open"
              description={
                conversations.length > 0
                  ? 'Choose somebody on the left to see your messages.'
                  : 'Start a conversation with one of your contacts.'
              }
            />
          </div>
        )}
      </section>
    </div>
  )
}

function Thread({
  me,
  conversationId,
  initialMessages,
  counterpartName,
}: {
  me: string
  conversationId: string
  initialMessages: ChatMessage[]
  counterpartName: string | null
}) {
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const bottomRef = useRef<HTMLDivElement>(null)

  const append = useCallback((incoming: ChatMessage) => {
    setMessages((current) =>
      // Realtime and the send both deliver the same row. Keyed by id so the
      // sender does not see their own message twice.
      current.some((message) => message.id === incoming.id) ? current : [...current, incoming],
    )
  }, [])

  // ── Live delivery ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    void (async () => {
      // Without the token this subscribes anonymously and receives nothing at
      // all, silently. See `createLiveClient`.
      await createLiveClient()
      if (cancelled) return

      channel = supabase
        .channel(`conversation:${conversationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => append(payload.new as ChatMessage),
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const updated = payload.new as ChatMessage
            setMessages((current) =>
              current.map((message) => (message.id === updated.id ? updated : message)),
            )
          },
        )
        .subscribe()
    })()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [conversationId, append])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  // Anything the other person sent is read the moment it is on screen.
  useEffect(() => {
    const unread = messages.some((message) => message.sender_id !== me && !message.read_at)
    if (!unread) return

    void markConversationRead({ conversation_id: conversationId }).then((result) => {
      if (result.ok && result.data.marked > 0) router.refresh()
    })
  }, [conversationId, messages, me, router])

  return (
    <>
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <span className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
          {(counterpartName ?? '?').slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{counterpartName}</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <p className="text-muted-foreground m-auto text-sm">No messages yet. Say hello.</p>
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              mine={message.sender_id === me}
              showDay={
                index === 0 ||
                formatDay(messages[index - 1].created_at) !== formatDay(message.created_at)
              }
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <Composer conversationId={conversationId} me={me} onSent={append} />
    </>
  )
}

function ConversationColumn({
  basePath,
  conversations,
  contacts,
  activeId,
  me,
}: {
  basePath: string
  conversations: ConversationSummary[]
  contacts: MessageContact[]
  activeId: string | null
  me: string
}) {
  return (
    <aside className="bg-card flex min-w-0 flex-col rounded-lg border" aria-label="Conversations">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="flex-1 text-sm font-medium">Chats</span>
        <NewChatDialog basePath={basePath} contacts={contacts} conversations={conversations} />
      </div>

      {conversations.length === 0 ? (
        <p className="text-muted-foreground p-5 text-sm">
          No conversations yet. Use New chat to start one.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <Link
                href={`${basePath}?chat=${conversation.id}`}
                className={cn(
                  'hover:bg-muted/60 flex items-start gap-3 border-b px-4 py-3 transition-colors',
                  conversation.id === activeId && 'bg-muted',
                )}
                aria-current={conversation.id === activeId ? 'true' : undefined}
              >
                <span className="bg-primary/10 text-primary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {conversation.counterpart_name.slice(0, 1).toUpperCase()}
                </span>

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {conversation.counterpart_name}
                    </span>
                    {conversation.last_message_at ? (
                      <span className="text-muted-foreground shrink-0 text-[10px]">
                        {formatTime(conversation.last_message_at)}
                      </span>
                    ) : null}
                  </span>

                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                      {conversation.last_sender_id === me ? 'You: ' : ''}
                      {conversation.last_message_preview ?? 'No messages yet'}
                    </span>
                    {conversation.unread_count > 0 ? (
                      <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-medium tabular-nums">
                        {conversation.unread_count > 9 ? '9+' : conversation.unread_count}
                      </span>
                    ) : null}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

function NewChatDialog({
  basePath,
  contacts,
  conversations,
}: {
  basePath: string
  contacts: MessageContact[]
  conversations: ConversationSummary[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [pending, startTransition] = useTransition()

  const existing = new Set(conversations.map((conversation) => conversation.counterpart_id))
  const visible = contacts.filter((contact) =>
    contact.full_name.toLowerCase().includes(filter.trim().toLowerCase()),
  )

  const start = (contactId: string) =>
    startTransition(async () => {
      const result = await openConversation({ counterpart_id: contactId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setOpen(false)
      setFilter('')
      router.push(`${basePath}?chat=${result.data.id}`)
      router.refresh()
    })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={contacts.length === 0}>
          <Plus className="size-4" aria-hidden="true" />
          New chat
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a conversation</DialogTitle>
          <DialogDescription>
            {/*
              The list comes from `my_message_contacts()`, which uses the same
              pairing rule as the INSERT policy — so every name here is one the
              database will actually accept.
            */}
            Only the people you are paired with through a class appear here.
          </DialogDescription>
        </DialogHeader>

        {contacts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You are not paired with anybody yet. Once a class assignment is in place, your contacts
            appear here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search by name"
              aria-label="Search contacts"
            />

            <ul className="divide-border max-h-72 divide-y overflow-y-auto rounded-md border">
              {visible.length === 0 ? (
                <li className="text-muted-foreground p-4 text-sm">Nobody matches that.</li>
              ) : (
                visible.map((contact) => (
                  <li
                    key={contact.profile_id}
                    className="flex items-center gap-3 p-3"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">{contact.full_name}</span>
                      {contact.subtitle ? (
                        <span className="text-muted-foreground truncate text-xs">
                          {contact.subtitle}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      size="sm"
                      variant={existing.has(contact.profile_id) ? 'ghost' : 'outline'}
                      disabled={pending}
                      onClick={() => start(contact.profile_id)}
                    >
                      {existing.has(contact.profile_id) ? 'Open' : 'Message'}
                    </Button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Composer({
  conversationId,
  me,
  onSent,
}: {
  conversationId: string
  me: string
  onSent: (message: ChatMessage) => void
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setBody('')
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const chooseFile = (chosen: File | null) => {
    if (!chosen) {
      setFile(null)
      return
    }
    // Checked here for a civil message; the bucket enforces both again.
    if (chosen.size > MESSAGE_FILE_LIMIT) {
      toast.error('That file is larger than 25 MB.')
      return
    }
    if (!(MESSAGE_MIME_TYPES as readonly string[]).includes(chosen.type)) {
      toast.error('That file type cannot be sent.')
      return
    }
    setFile(chosen)
  }

  const submit = async () => {
    const text = body.trim()
    if (!text && !file) return

    setBusy(true)
    try {
      let attachment: Record<string, unknown> = {}

      if (file) {
        const ticket = await requestAttachmentUpload({
          conversation_id: conversationId,
          file_name: file.name,
        })
        if (!ticket.ok) {
          toast.error(ticket.message)
          return
        }

        const upload = await createClient()
          .storage.from('message-attachments')
          .uploadToSignedUrl(ticket.data.path, ticket.data.token, file, {
            contentType: file.type,
          })

        if (upload.error) {
          toast.error(`Upload failed: ${upload.error.message}`)
          return
        }

        attachment = {
          storage_path: ticket.data.path,
          file_name: file.name,
          mime_type: file.type,
          file_size: file.size,
        }
      }

      const result = await sendMessage({
        conversation_id: conversationId,
        body: text || undefined,
        ...attachment,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      // Realtime will deliver the same row; `append` is keyed by id, so this
      // only makes the sender's own message appear without waiting for it.
      onSent({
        id: result.data.id,
        conversation_id: conversationId,
        // Without this the sender's own message renders as though the other
        // person had sent it, until Realtime replaces it a moment later.
        sender_id: me,
        body: text || null,
        storage_path: (attachment.storage_path as string) ?? null,
        file_name: (attachment.file_name as string) ?? null,
        mime_type: (attachment.mime_type as string) ?? null,
        file_size: (attachment.file_size as number) ?? null,
        read_at: null,
        created_at: new Date().toISOString(),
      })

      reset()
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t px-5 py-3">
      {file ? (
        <div className="bg-muted/50 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
          <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{file.name}</span>
          <span className="text-muted-foreground shrink-0">{formatSize(file.size)}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6"
            onClick={() => chooseFile(null)}
            aria-label="Remove attachment"
          >
            <X className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="sr-only"
          accept={MESSAGE_MIME_TYPES.join(',')}
          onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          aria-label="Attach a file"
        >
          <Paperclip className="size-4" aria-hidden="true" />
        </Button>

        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a new line, as in every chat app.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void submit()
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder="Write a message"
          aria-label="Message"
          className="max-h-32 min-h-9 flex-1 resize-none py-2"
        />

        <Button
          type="button"
          size="icon"
          className="size-9 shrink-0"
          disabled={busy || (!body.trim() && !file)}
          onClick={() => void submit()}
          aria-label="Send"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  mine,
  showDay,
}: {
  message: ChatMessage
  mine: boolean
  showDay: boolean
}) {
  return (
    <>
      {showDay ? (
        <p className="text-muted-foreground my-3 text-center text-[11px]">
          {formatDay(message.created_at)}
        </p>
      ) : null}

      <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'flex max-w-[min(30rem,80%)] flex-col gap-1 rounded-lg px-3 py-2 text-sm',
            mine ? 'bg-primary text-primary-foreground' : 'bg-muted',
          )}
        >
          {message.body ? <p className="break-words whitespace-pre-wrap">{message.body}</p> : null}

          {message.storage_path ? <AttachmentLink message={message} mine={mine} /> : null}

          <span
            className={cn(
              'self-end text-[10px]',
              mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
            )}
          >
            {formatTime(message.created_at)}
            {mine && message.read_at ? ' · Read' : ''}
          </span>
        </div>
      </div>
    </>
  )
}

/**
 * Attachments are fetched through a server-minted signed URL rather than linked
 * directly. The bucket is private and its policy admits only the two
 * participants, so a stored link would be useless to anybody else anyway — but
 * minting on click means the URL is short-lived and never sits in the HTML.
 */
function AttachmentLink({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const [busy, setBusy] = useState(false)

  const open = async () => {
    setBusy(true)
    try {
      const result = await getAttachmentUrl(message.id)
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
        mine
          ? 'border-primary-foreground/30 hover:bg-primary-foreground/10'
          : 'border-border hover:bg-background',
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 truncate">{message.file_name}</span>
      {message.file_size ? (
        <span className="shrink-0 opacity-70">{formatSize(message.file_size)}</span>
      ) : null}
    </button>
  )
}
