'use client'

import { useTransition } from 'react'

import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { Check } from 'lucide-react'
import { toast } from 'sonner'

import { relativeTime } from '@/components/hq/activity-timeline'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { humaniseEnum } from '@/lib/constants/enums'
import {
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '@/services/notifications'

/**
 * The student's notices.
 *
 * Marking one read is an ordinary update the database already scopes to the
 * signed-in user, so there is nothing to guard here beyond showing the result.
 * A notice with a `deep_link` is a link; one without is plain text — the column
 * is constrained to a relative path, so it cannot carry a notice off-site.
 */
export function NotificationList({
  notifications,
  emptyHint,
}: {
  notifications: Notification[]
  emptyHint?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const unread = notifications.filter((item) => !item.read_at).length

  const markOne = (id: string) =>
    startTransition(async () => {
      const result = await markNotificationRead({ notification_id: id })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      router.refresh()
    })

  const markAll = () =>
    startTransition(async () => {
      const result = await markAllNotificationsRead()
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(
        result.data.marked === 0
          ? 'Nothing was unread'
          : `${result.data.marked} marked as read`,
      )
      router.refresh()
    })

  if (notifications.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {emptyHint ?? 'Nothing yet. When a teacher publishes work to your class, it appears here.'}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {unread > 0 ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={pending} onClick={markAll}>
            <Check className="size-4" aria-hidden="true" />
            Mark all read
          </Button>
        </div>
      ) : null}

      <ul className="divide-border bg-card divide-y rounded-lg border">
        {notifications.map((item) => (
          <li
            key={item.id}
            className={cn('flex flex-wrap items-start gap-3 p-4', !item.read_at && 'bg-primary/5')}
          >
            {/* The unread marker is a dot for sighted users and a word for
                everyone else — colour alone would say nothing to a screen
                reader. */}
            <span className="mt-1.5 flex size-2 shrink-0 items-center justify-center">
              {item.read_at ? null : (
                <>
                  <span className="bg-primary size-2 rounded-full" aria-hidden="true" />
                  <span className="sr-only">Unread</span>
                </>
              )}
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={cn('truncate', item.read_at ? 'font-normal' : 'font-medium')}>
                  {item.title}
                </span>
                <span className="text-muted-foreground font-mono text-[10px] tracking-[0.12em] uppercase">
                  {humaniseEnum(item.category)}
                </span>
              </span>

              {item.body ? (
                <span className="text-muted-foreground text-sm">{item.body}</span>
              ) : null}

              <span className="text-muted-foreground text-xs">{relativeTime(item.created_at)}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {item.deep_link ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={item.deep_link} onClick={() => !item.read_at && markOne(item.id)}>
                    Open
                  </Link>
                </Button>
              ) : null}

              {!item.read_at ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => markOne(item.id)}
                >
                  Mark read
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
