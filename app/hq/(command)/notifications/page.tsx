import Link from 'next/link'

import { Bell } from 'lucide-react'

import { relativeTime } from '@/components/hq/activity-timeline'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { requireHq } from '@/lib/auth/hq'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const metadata = { title: 'Notifications' }

/**
 * The HQ notification centre.
 *
 * `notifications` is owner-scoped by RLS — the only SELECT policy is
 * `user_id = auth.uid()` — so this shows the signed-in administrator's own
 * notifications and nothing else. Even a service that tried to widen the query
 * would return the same rows.
 */
export default async function HqNotificationsPage() {
  await requireHq()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notifications')
    .select('id, category, priority, title, body, deep_link, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error
  const notifications = data ?? []

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Notifications"
        description="System notices and administrative alerts addressed to your account."
        breadcrumbs={[{ label: 'HQ', href: '/hq' }, { label: 'Notifications' }]}
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications"
          description="Application submissions, institution approvals, account events and system notices addressed to you appear here."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/hq/audit-logs">Open the audit centre</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border bg-card">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn('flex gap-3 p-4', !notification.read_at && 'bg-primary/[0.04]')}
            >
              <span
                className={cn(
                  'mt-1.5 size-2 shrink-0 rounded-full',
                  notification.read_at ? 'bg-muted-foreground/30' : 'bg-primary',
                )}
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{notification.title}</p>
                  <span className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                    {notification.category}
                  </span>
                  {!notification.read_at ? <span className="sr-only">Unread</span> : null}
                </div>
                {notification.body ? (
                  <p className="text-sm text-muted-foreground">{notification.body}</p>
                ) : null}
                {notification.deep_link ? (
                  <Link
                    href={notification.deep_link}
                    className="text-xs text-primary underline-offset-4 hover:underline"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
              <time
                dateTime={notification.created_at}
                className="shrink-0 font-mono text-[11px] text-muted-foreground"
                title={new Date(notification.created_at).toLocaleString('en-IN')}
              >
                {relativeTime(notification.created_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
