'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { LifeBuoy, Loader2, Lock, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { humaniseEnum } from '@/lib/constants/enums'
import { cn } from '@/lib/utils'
import { TICKET_AUDIENCES, TICKET_CATEGORIES, TICKET_PRIORITIES } from '@/lib/validation/support'
import {
  closeMyTicket,
  raiseTicket,
  replyToTicket,
  type TicketMessage,
} from '@/services/support'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

/**
 * Raising a query. Identical for an administrator, a teacher and a student.
 *
 * The fields are controlled rather than uncontrolled, which they have to be:
 * React resets a `<form action={…}>` once the action returns, so a rejected
 * submission cleared everything the person had typed. On a form whose whole
 * point is a long description of a problem, losing it to a validation error
 * about the subject line is the kind of thing that stops somebody reporting the
 * problem at all.
 */
export function RaiseTicketDialog({ canChooseAudience = true }: { canChooseAudience?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<string>('OTHER')
  const [priority, setPriority] = useState<string>('NORMAL')
  const [audience, setAudience] = useState<string>('INSTITUTION')

  const submit = () => {
    setErrors({})

    startTransition(async () => {
      const result = await raiseTicket({ subject, body, category, priority, raised_to: audience })

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(`Raised as ${result.data.reference}`)
      setSubject('')
      setBody('')
      setCategory('OTHER')
      setPriority('NORMAL')
      setAudience('INSTITUTION')
      setOpen(false)
      router.refresh()
    })
  }

  const error = (name: string) => errors[name]?.[0]

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm">
          <LifeBuoy className="size-4" aria-hidden="true" />
          Raise a query
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise a query</DialogTitle>
          <DialogDescription>
            {/*
              Said plainly, because it is the reason somebody would use this
              rather than asking their own institution.
            */}
            {canChooseAudience
              ? 'Choose who should see this. A query to AEROFEDERATION HEAD QUARTERS cannot be read by your own institution — use it if the problem is with them.'
              : 'This goes to the federation headquarters.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          {canChooseAudience ? (
            <Field
              label="Send to"
              name="raised_to"
              error={error('raised_to')}
              hint={
                audience === 'HQ'
                  ? 'AEROFEDERATION HEAD QUARTERS. Your institution cannot read this.'
                  : 'Your own institution’s office. They resolve it.'
              }
              required
            >
              <select
                id="raised_to"
                name="raised_to"
                value={audience}
                onChange={(event) => setAudience(event.target.value)}
                className={SELECT_CLASS}
              >
                {TICKET_AUDIENCES.map((value) => (
                  <option key={value} value={value}>
                    {value === 'INSTITUTION' ? 'My institution' : 'AEROFEDERATION HEAD QUARTERS'}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <Field label="Subject" name="subject" error={error('subject')} required>
            <Input
              id="subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              minLength={5}
              maxLength={200}
              placeholder="Short summary of the issue"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" name="category" error={error('category')} required>
              <select
                id="category"
                name="category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className={SELECT_CLASS}
              >
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {humaniseEnum(category)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Priority"
              name="priority"
              error={error('priority')}
              hint="HQ may adjust this"
            >
              <select
                id="priority"
                name="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className={SELECT_CLASS}
              >
                {TICKET_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {humaniseEnum(priority)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            label="What is the issue?"
            name="body"
            error={error('body')}
            hint="At least 20 characters. Include anything HQ would need to act on it — names, dates, what you expected to happen."
            required
          >
            <Textarea
              id="body"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              required
              minLength={20}
              maxLength={8000}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {/* Names the destination, so the button cannot say HQ while the
                  form is addressed to the institution. */}
              {pending
                ? 'Sending…'
                : audience === 'HQ' || !canChooseAudience
                  ? 'Send to HQ'
                  : 'Send to my institution'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The reply trail.
 *
 * Two separate things had been folded into one `isHq` flag: whether the viewer
 * is the office answering, and whether that office is HQ. They are not the same
 * since a ticket can be addressed to the institution — and conflating them
 * labelled an institution administrator's reply "AEROFEDERATION HEAD QUARTERS" on a ticket that had
 * never been near HQ. `isHandler` is who is looking; `handlerName` is who
 * answers.
 *
 * Internal notes only ever reach this component for the handling office — the
 * raiser's SELECT policy does not return those rows at all. The badge exists so
 * whoever wrote one can see it is not visible to the other side.
 */
export function TicketThread({
  ticketId,
  messages,
  viewerId,
  canReply,
  isHandler = false,
  handlerName,
}: {
  ticketId: string
  messages: TicketMessage[]
  viewerId: string
  canReply: boolean
  isHandler?: boolean
  /** Who answers this ticket: "AEROFEDERATION HEAD QUARTERS", or the institution's own name. */
  handlerName: string
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  const [pending, startTransition] = useTransition()

  const send = () => {
    const text = body.trim()
    if (!text) return

    startTransition(async () => {
      const result = await replyToTicket({
        ticket_id: ticketId,
        body: text,
        is_internal: internal,
      })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      setBody('')
      setInternal(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No replies yet. {isHandler ? 'Answer below.' : `${handlerName} will reply here.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
            const mine = message.author_id === viewerId
            return (
              <li
                key={message.id}
                className={cn(
                  'flex flex-col gap-1.5 rounded-lg border p-4',
                  message.is_internal ? 'border-warning/40 bg-warning/5' : 'bg-card',
                )}
              >
                <span className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium">
                    {mine ? 'You' : isHandler ? 'The person who raised it' : handlerName}
                  </span>
                  {message.is_internal ? (
                    <span className="text-warning inline-flex items-center gap-1 text-[10px] tracking-wide uppercase">
                      <Lock className="size-3" aria-hidden="true" />
                      Internal — not visible to them
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">
                    {new Date(message.created_at).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </span>
                <p className="text-sm whitespace-pre-wrap">{message.body}</p>
              </li>
            )
          })}
        </ul>
      )}

      {canReply ? (
        <div className="flex flex-col gap-2 border-t pt-4">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            maxLength={8000}
            placeholder={isHandler ? 'Reply to the person who raised this' : 'Add to your query'}
            aria-label="Reply"
          />

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={pending || !body.trim()} onClick={send}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="size-4" aria-hidden="true" />
              )}
              Send reply
            </Button>

            {isHandler ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={internal}
                  onChange={(event) => setInternal(event.target.checked)}
                  className="size-4"
                />
                Internal note — not shown to them
              </label>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground border-t pt-4 text-sm">
          This ticket is closed. Raise a new query if you still need help.
        </p>
      )}
    </div>
  )
}

/** The raiser marking their own query as finished. */
export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await closeMyTicket({ ticket_id: ticketId })
          if (!result.ok) {
            toast.error(result.message)
            return
          }
          toast.success('Ticket closed')
          router.refresh()
        })
      }
    >
      {pending ? 'Closing…' : 'Close this ticket'}
    </Button>
  )
}
