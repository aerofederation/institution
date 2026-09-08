'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'

import { Megaphone, Pin, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'

import { DateTimePicker } from '@/components/shared/date-time-picker'
import { Field } from '@/components/institution/teacher-form'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { NOTICE_AUDIENCES, NOTICE_PRIORITIES } from '@/lib/validation/notices'
import {
  createNotice,
  deleteNotice,
  setNoticePublished,
  updateNotice,
  type Notice,
} from '@/services/notices'

const SELECT_CLASS =
  'border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:outline-none'

const AUDIENCE_LABEL: Record<string, string> = {
  EVERYONE: 'Teachers and students',
  TEACHERS: 'Teachers only',
  STUDENTS: 'Students only',
}

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: 'border-destructive/40 text-destructive',
  HIGH: 'border-warning/40 text-warning',
  NORMAL: 'border-border text-muted-foreground',
  LOW: 'border-border text-muted-foreground',
}

/** `2026-08-28T14:30:00+00:00` → `2026-08-28T14:30`, in the reader's own zone. */
function toLocalInput(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatWhen(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Writing a notice.
 *
 * The audience control is first, because it changes who the words are for. The
 * same dialog edits an existing notice — one form rather than two that drift.
 *
 * Fields are controlled rather than uncontrolled: React resets a
 * `<form action={…}>` once the action returns, which on a rejected submission
 * would wipe a notice somebody had just written out.
 */
export function NoticeDialog({ notice }: { notice?: Notice }) {
  const router = useRouter()
  const editing = Boolean(notice)

  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const [title, setTitle] = useState(notice?.title ?? '')
  const [body, setBody] = useState(notice?.body ?? '')
  const [audience, setAudience] = useState(notice?.audience ?? 'EVERYONE')
  const [priority, setPriority] = useState(notice?.priority ?? 'NORMAL')
  const [pinned, setPinned] = useState(notice?.pinned ?? false)
  const [published, setPublished] = useState(notice?.is_published ?? false)
  const [expiresAt, setExpiresAt] = useState(toLocalInput(notice?.expires_at ?? null))

  const submit = () => {
    setErrors({})

    startTransition(async () => {
      const payload = {
        title,
        body,
        audience,
        priority,
        pinned: pinned ? 'true' : '',
        is_published: published ? 'true' : '',
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : '',
      }

      const result = notice
        ? await updateNotice({ ...payload, notice_id: notice.id })
        : await createNotice(payload)

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        toast.error(result.message)
        return
      }

      toast.success(editing ? 'Notice updated' : published ? 'Notice posted' : 'Draft saved')
      if (!editing) {
        setTitle('')
        setBody('')
        setAudience('EVERYONE')
        setPriority('NORMAL')
        setPinned(false)
        setPublished(false)
        setExpiresAt('')
      }
      setOpen(false)
      router.refresh()
    })
  }

  const error = (name: string) => errors[name]?.[0]

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button size="sm" variant={editing ? 'outline' : 'default'}>
          {editing ? (
            'Edit'
          ) : (
            <>
              <Megaphone className="size-4" aria-hidden="true" />
              Post a notice
            </>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit notice' : 'Post a notice'}</DialogTitle>
          <DialogDescription>
            Goes on the notice board for whoever you address it to. Nobody outside your institution
            can see it.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field
            label="Who is this for?"
            name="audience"
            error={error('audience')}
            hint={AUDIENCE_LABEL[audience]}
            required
          >
            <select
              id="audience"
              name="audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value)}
              className={SELECT_CLASS}
            >
              {NOTICE_AUDIENCES.map((value) => (
                <option key={value} value={value}>
                  {AUDIENCE_LABEL[value]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title" name="title" error={error('title')} required>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              minLength={3}
              maxLength={200}
            />
          </Field>

          <Field label="Notice" name="body" error={error('body')} required>
            <Textarea
              id="body"
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              required
              maxLength={10_000}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" name="priority" error={error('priority')}>
              <select
                id="priority"
                name="priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
                className={SELECT_CLASS}
              >
                {NOTICE_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {humaniseEnum(value)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Remove on"
              name="expires_at"
              error={error('expires_at')}
              hint="Optional — it comes off the board then"
            >
              <DateTimePicker
                name="expires_at"
                defaultValue={expiresAt}
                defaultTime="23:59"
                onValueChange={setExpiresAt}
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox checked={pinned} onCheckedChange={(next) => setPinned(next === true)} />
              Pin to the top
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <Checkbox
                checked={published}
                onCheckedChange={(next) => setPublished(next === true)}
              />
              Publish now
            </label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : editing ? 'Save changes' : published ? 'Post notice' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * The board itself.
 *
 * `manageable` is a presentation flag, not a permission. What an administrator
 * may actually do is decided by `notices_update` and `notices_delete`; this
 * only decides whether to draw buttons that would otherwise be refused.
 */
export function NoticeList({
  notices,
  manageable = false,
}: {
  notices: Notice[]
  manageable?: boolean
}) {
  return (
    <ul className="flex flex-col gap-3">
      {notices.map((notice) => (
        <NoticeCard key={notice.id} notice={notice} manageable={manageable} />
      ))}
    </ul>
  )
}

function NoticeCard({ notice, manageable }: { notice: Notice; manageable: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const act = (run: () => Promise<{ ok: boolean; message?: string }>, success: string) =>
    startTransition(async () => {
      const result = await run()
      if (!result.ok) {
        toast.error(result.message ?? 'That did not work')
        return
      }
      toast.success(success)
      router.refresh()
    })

  const expired = notice.expires_at ? new Date(notice.expires_at) < new Date() : false

  return (
    <li
      className={cn(
        'bg-card flex flex-col gap-3 rounded-lg border p-5',
        notice.pinned && 'border-primary/40',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {notice.pinned ? (
              <Pin className="text-primary size-3.5 shrink-0" aria-label="Pinned" />
            ) : null}
            <span className="font-medium">{notice.title}</span>
          </span>

          <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3" aria-hidden="true" />
              {AUDIENCE_LABEL[notice.audience] ?? notice.audience}
            </span>
            <span>·</span>
            <span>
              {notice.is_published
                ? `posted ${formatWhen(notice.published_at)}`
                : 'not posted yet'}
            </span>
            {notice.profiles?.full_name ? <span>· {notice.profiles.full_name}</span> : null}
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {notice.priority !== 'NORMAL' ? (
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px]',
                PRIORITY_STYLE[notice.priority] ?? PRIORITY_STYLE.NORMAL,
              )}
            >
              {humaniseEnum(notice.priority)}
            </span>
          ) : null}

          {/* Only the office sees these two; the audience never gets a draft. */}
          {manageable && !notice.is_published ? (
            <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
              Draft
            </span>
          ) : null}
          {manageable && expired ? (
            <span className="text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]">
              Expired
            </span>
          ) : null}
        </div>
      </div>

      <p className="text-sm whitespace-pre-wrap">{notice.body}</p>

      {manageable ? (
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <NoticeDialog notice={notice} />

          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              act(
                () => setNoticePublished({ notice_id: notice.id, publish: !notice.is_published }),
                notice.is_published ? 'Taken down' : 'Posted',
              )
            }
          >
            {notice.is_published ? 'Take down' : 'Post'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => act(() => deleteNotice({ notice_id: notice.id }), 'Notice removed')}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Remove
          </Button>
        </div>
      ) : null}
    </li>
  )
}
