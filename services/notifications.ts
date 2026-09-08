'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { action, type ActionResult } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

/**
 * A signed-in person's own notifications.
 *
 * `notifications` has exactly one SELECT policy — `user_id = auth.uid()` — so
 * every read here is owner-scoped by the database. There is no tenant filter in
 * the queries below and there does not need to be one: a row addressed to
 * somebody else is not visible to this session at all, whatever the query asks
 * for. The same is true of the update that marks one read.
 *
 * Writing notifications is deliberately not here. Insert requires
 * `notification.broadcast`, which no teacher or student holds; papers reach a
 * class through `notifyClass`, which reads the recipients under the teacher's
 * own RLS and inserts with the service role.
 */

export type Notification = {
  id: string
  category: string
  priority: string
  title: string
  body: string | null
  deep_link: string | null
  read_at: string | null
  created_at: string
}

const COLUMNS = 'id, category, priority, title, body, deep_link, read_at, created_at'

/** Newest first. `limit` keeps the dashboard block short; the page asks for more. */
export async function listNotifications(limit = 50): Promise<Notification[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('notifications')
    .select(COLUMNS)
    /*
     * An expired notice is one whose moment has passed — a paper that has since
     * closed, say. Rows with no expiry never age out.
     */
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as Notification[]
}

/** Drives the bell. Counts the same rows the list would show. */
export async function countUnreadNotifications(): Promise<number> {
  await requireTenant()
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .is('read_at', null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)

  if (error) throw error
  return count ?? 0
}

export async function markNotificationRead(input: {
  notification_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    /*
     * No `user_id` filter, and none is wanted: `notifications_update_own` has
     * `user_id = auth.uid()` in both USING and WITH CHECK, so somebody else's
     * row simply does not match. Adding the filter here would imply the
     * database was not already enforcing it.
     */
    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', input.notification_id)
      .is('read_at', null)
      .select('id')
      .maybeSingle()

    if (error) throw error

    revalidatePath('/student')
    revalidatePath('/student/notifications')

    // Already read is not a failure — two tabs, one notification.
    return { id: data?.id ?? input.notification_id }
  })
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ marked: number }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)
      .select('id')

    if (error) throw error

    revalidatePath('/student')
    revalidatePath('/student/notifications')
    return { marked: (data ?? []).length }
  })
}
