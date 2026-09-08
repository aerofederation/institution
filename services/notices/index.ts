'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { noticeSchema, updateNoticeSchema } from '@/lib/validation/notices'
import type { NoticeAudience, NotificationPriority } from '@/types/database.generated'

/**
 * The institution's notice board.
 *
 * One row per notice; `notices_select` decides who sees it. A teacher gets the
 * ones addressed to EVERYONE or TEACHERS, a student EVERYONE or STUDENTS, and
 * the office that posts them gets all of it including drafts. So neither read
 * below filters by audience — doing it here as well would be a second rule to
 * keep in step with the first, and the database's is the one that counts.
 *
 * Expiry and publication are handled the same way: the policy excludes an
 * unpublished or expired notice from the audience's view, so a query that
 * forgot to check would still not leak a draft.
 */

export type Notice = {
  id: string
  title: string
  body: string
  audience: string
  priority: string
  is_published: boolean
  published_at: string | null
  pinned: boolean
  expires_at: string | null
  created_at: string
  author_id: string
  profiles?: { full_name: string } | null
}

const COLUMNS =
  'id, title, body, audience, priority, is_published, published_at, pinned, expires_at, created_at, author_id'

/**
 * What the signed-in person should see on the board.
 *
 * For a teacher or student that is the published, unexpired notices addressed
 * to them. For an administrator it is everything, drafts included — which is
 * correct for the page where they manage them, and is why the board component
 * shows the draft badge rather than hiding those rows.
 */
export async function listNotices(): Promise<Notice[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('institution_notices')
    .select(`${COLUMNS}, profiles!institution_notices_author_id_fkey ( full_name )`)
    .is('deleted_at', null)
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) throw error
  return (data ?? []) as unknown as Notice[]
}

/** The published board, for a workspace overview. Same policy, fewer rows. */
export async function listPublishedNotices(limit = 3): Promise<Notice[]> {
  const all = await listNotices()
  return all.filter((notice) => notice.is_published).slice(0, limit)
}

async function tenantForWrite() {
  const session = await authorize({ permission: 'notification.broadcast' })
  if (!session.institutionId) {
    throw new AppError('TENANT_MISMATCH', 'a notice belongs to an institution')
  }
  return session
}

export async function createNotice(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await tenantForWrite()

    const parsed = noticeSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'notice rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('institution_notices')
      .insert({
        institution_id: session.institutionId!,
        // From the session, never the form.
        author_id: session.userId,
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience as NoticeAudience,
        priority: parsed.data.priority as NotificationPriority,
        pinned: parsed.data.pinned,
        is_published: parsed.data.is_published,
        expires_at: parsed.data.expires_at ?? null,
      })
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new AppError('FORBIDDEN', 'notice not created')

    revalidateBoards()
    return { id: data.id }
  })
}

export async function updateNotice(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    await tenantForWrite()

    const parsed = updateNoticeSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'notice rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('institution_notices')
      .update({
        title: parsed.data.title,
        body: parsed.data.body,
        audience: parsed.data.audience as NoticeAudience,
        priority: parsed.data.priority as NotificationPriority,
        pinned: parsed.data.pinned,
        is_published: parsed.data.is_published,
        expires_at: parsed.data.expires_at ?? null,
      })
      .eq('id', parsed.data.notice_id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('notice not found')

    revalidateBoards()
    return { id: data.id }
  })
}

/** Publishing and unpublishing, without opening the whole form. */
export async function setNoticePublished(input: {
  notice_id: string
  publish: boolean
}): Promise<ActionResult<{ published: boolean }>> {
  return action(async () => {
    await tenantForWrite()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('institution_notices')
      .update({ is_published: input.publish })
      .eq('id', input.notice_id)
      .select('id, is_published')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('notice not found')

    revalidateBoards()
    return { published: data.is_published }
  })
}

/**
 * Soft delete, matching materials and assessments.
 *
 * A notice somebody has already read should leave a trace for the office that
 * posted it, rather than vanishing as though it had never been on the wall.
 */
export async function deleteNotice(input: {
  notice_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    await tenantForWrite()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('institution_notices')
      .update({ deleted_at: new Date().toISOString(), is_published: false })
      .eq('id', input.notice_id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('notice not found')

    revalidateBoards()
    return { id: data.id }
  })
}

function revalidateBoards() {
  revalidatePath('/institution/notices')
  revalidatePath('/teacher/notices')
  revalidatePath('/student/notices')
  revalidatePath('/teacher')
  revalidatePath('/student')
}
