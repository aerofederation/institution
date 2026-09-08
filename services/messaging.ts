'use server'

import { randomBytes } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { requireTenant } from '@/lib/auth/session'
import { AppError, action, type ActionResult } from '@/lib/errors'
import { authorize } from '@/lib/permissions/guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { toFieldErrors } from '@/lib/validation/common'
import { messageSchema, openConversationSchema } from '@/lib/validation/messaging'

/**
 * Direct messages between one teacher and one student.
 *
 * Two layers, as everywhere else. This one decides who may ask; the database
 * decides what comes back. `conversations_select` and `messages_select` admit
 * only the two participants, so a bug in this file cannot widen a thread — the
 * worst it can do is fail to show somebody their own messages.
 *
 * The contact list and the thread list come from SECURITY DEFINER functions
 * rather than joins, because `profiles_select` is asymmetric: a teacher may
 * read a student they teach, and a student may read no teacher at all. Joining
 * would have shown students their own conversations with the other name blank.
 * See migrations 041 and 042.
 */

export type MessageContact = {
  profile_id: string
  full_name: string
  subtitle: string
}

export type ConversationSummary = {
  id: string
  counterpart_id: string
  counterpart_name: string
  counterpart_role: string
  last_message_at: string | null
  last_message_preview: string | null
  last_sender_id: string | null
  unread_count: number
}

export type ChatMessage = {
  id: string
  conversation_id: string
  sender_id: string
  body: string | null
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  read_at: string | null
  created_at: string
}

/** Everyone this person is paired with by teaching, and nobody else. */
export async function listMessageContacts(): Promise<MessageContact[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('my_message_contacts')
  if (error) throw error
  return (data ?? []) as MessageContact[]
}

export async function listConversations(): Promise<ConversationSummary[]> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('my_conversations')
  if (error) throw error
  return (data ?? []) as ConversationSummary[]
}

export async function getConversation(id: string): Promise<ConversationSummary | null> {
  await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('my_conversation', { target_id: id })
  if (error) throw error

  const row = (data ?? [])[0]
  if (!row) return null

  // The header function returns identity only; the list carries the counters.
  const summary = (await listConversations()).find((item) => item.id === id)
  return {
    ...(row as { id: string; counterpart_id: string; counterpart_name: string; counterpart_role: string }),
    last_message_at: summary?.last_message_at ?? null,
    last_message_preview: summary?.last_message_preview ?? null,
    last_sender_id: summary?.last_sender_id ?? null,
    unread_count: summary?.unread_count ?? 0,
  }
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  await requireTenant()
  const supabase = await createClient()

  /*
   * No participant filter, and none is needed: `messages_select` calls
   * `private.in_conversation()`, so a thread the caller is not in returns
   * nothing however this query is written.
   */
  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, sender_id, body, storage_path, file_name, mime_type, file_size, read_at, created_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) throw error
  return (data ?? []) as ChatMessage[]
}

/**
 * Find the thread with somebody, or start it.
 *
 * Which side of the pair the caller is on comes from their own role, never from
 * the request — a student cannot ask to be filed as the teacher. The pairing
 * itself is checked again by `conversations_insert`, which calls
 * `private.teacher_teaches_student()`; this only decides which column each id
 * belongs in.
 */
export async function openConversation(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'message.participate' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const parsed = openConversationSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'invalid contact', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const counterpart = parsed.data.counterpart_id
    if (counterpart === session.userId) {
      throw new AppError('VALIDATION', 'self conversation', {
        publicMessage: 'You cannot message yourself.',
      })
    }

    const asTeacher = session.role === 'TEACHER'
    const teacherId = asTeacher ? session.userId : counterpart
    const studentId = asTeacher ? counterpart : session.userId

    const supabase = await createClient()

    const existing = await supabase
      .from('conversations')
      .select('id')
      .eq('teacher_id', teacherId)
      .eq('student_id', studentId)
      .maybeSingle()

    if (existing.data) return { id: existing.data.id }

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        institution_id: session.institutionId,
        teacher_id: teacherId,
        student_id: studentId,
        started_by: session.userId,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      // Two tabs pressing at once. The pair is unique, so re-read rather than
      // reporting a conflict the person did not cause.
      if (error.code === '23505') {
        const again = await supabase
          .from('conversations')
          .select('id')
          .eq('teacher_id', teacherId)
          .eq('student_id', studentId)
          .maybeSingle()
        if (again.data) return { id: again.data.id }
      }

      // 42501 is the pairing rule refusing, which is worth saying plainly.
      if (error.code === '42501') {
        throw new AppError('FORBIDDEN', error.message, {
          publicMessage: 'You can only message the people you are paired with.',
        })
      }
      throw error
    }

    if (!data) throw new AppError('FORBIDDEN', 'conversation not created')

    revalidatePath('/teacher/messages')
    revalidatePath('/student/messages')
    return { id: data.id }
  })
}

export async function sendMessage(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await authorize({ permission: 'message.participate' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const parsed = messageSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'message rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('messages')
      .insert({
        institution_id: session.institutionId,
        conversation_id: parsed.data.conversation_id,
        // Never from the request. `messages_insert` checks this too.
        sender_id: session.userId,
        body: parsed.data.body ?? null,
        storage_path: parsed.data.storage_path ?? null,
        file_name: parsed.data.file_name ?? null,
        mime_type: parsed.data.mime_type ?? null,
        file_size: parsed.data.file_size ?? null,
      })
      .select('id')
      .maybeSingle()

    if (error) {
      if (error.code === '42501') {
        throw new AppError('FORBIDDEN', error.message, {
          publicMessage: 'You are not in this conversation.',
        })
      }
      throw error
    }
    if (!data) throw new AppError('FORBIDDEN', 'message not sent')

    return { id: data.id }
  })
}

/** Marks everything the other person sent as read. */
export async function markConversationRead(input: {
  conversation_id: string
}): Promise<ActionResult<{ marked: number }>> {
  return action(async () => {
    const session = await requireTenant()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', input.conversation_id)
      .neq('sender_id', session.userId)
      .is('read_at', null)
      .select('id')

    if (error) throw error
    return { marked: (data ?? []).length }
  })
}

export type UploadTicket = { uploadUrl: string; token: string; path: string }

/**
 * A one-object upload ticket for an attachment.
 *
 * The path is built here, not by the browser, because it is what the storage
 * policy reads: `{institution}/{conversation}/{random}`. A client that chose
 * its own path could aim an upload at another conversation's prefix — the
 * policy would refuse it, but the refusal should not be the only thing
 * standing in the way.
 */
export async function requestAttachmentUpload(input: {
  conversation_id: string
  file_name: string
}): Promise<ActionResult<UploadTicket>> {
  return action(async () => {
    const session = await authorize({ permission: 'message.participate' })
    if (!session.institutionId) throw new AppError('TENANT_MISMATCH', 'no institution')

    const supabase = await createClient()

    // Readable only to a participant, so this is the membership check.
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', input.conversation_id)
      .maybeSingle()

    if (!conversation) {
      throw new AppError('FORBIDDEN', 'not a participant', {
        publicMessage: 'You are not in this conversation.',
      })
    }

    const extension = input.file_name.includes('.')
      ? input.file_name.split('.').pop()!.toLowerCase()
      : 'bin'
    const safe = /^[a-z0-9]{1,8}$/.test(extension) ? extension : 'bin'
    const path = `${session.institutionId}/${input.conversation_id}/${randomBytes(16).toString('hex')}.${safe}`

    const { data: signed, error } = await createAdminClient()
      .storage.from('message-attachments')
      .createSignedUploadUrl(path)

    if (error || !signed) {
      throw new AppError('STORAGE', error?.message ?? 'could not prepare the upload')
    }

    return { uploadUrl: signed.signedUrl, token: signed.token, path }
  })
}

/** A short-lived link to an attachment, minted only for a participant. */
export async function getAttachmentUrl(messageId: string): Promise<ActionResult<{ url: string }>> {
  return action(async () => {
    await requireTenant()
    const supabase = await createClient()

    // `messages_select` is the authorization: a non-participant reads no row.
    const { data: message } = await supabase
      .from('messages')
      .select('id, storage_path, file_name')
      .eq('id', messageId)
      .maybeSingle()

    if (!message?.storage_path) {
      throw new AppError('NOT_FOUND', 'no attachment', {
        publicMessage: 'That file is not available.',
      })
    }

    const { data: signed, error } = await createAdminClient()
      .storage.from('message-attachments')
      .createSignedUrl(message.storage_path, 60, {
        download: message.file_name ?? undefined,
      })

    if (error || !signed) {
      throw new AppError('STORAGE', error?.message ?? 'could not prepare the download')
    }

    return { url: signed.signedUrl }
  })
}
