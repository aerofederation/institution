import { z } from 'zod'

/**
 * What a client may say about a message.
 *
 * `sender_id` is deliberately absent: it comes from the session, and
 * `messages_insert` checks it against `auth.uid()` again. A schema that
 * accepted it would be offering a field the rest of the stack then has to
 * refuse.
 */

/** Matches the bucket's allowed_mime_types in migration 040. */
export const MESSAGE_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
] as const

/** 25 MiB, the same ceiling the bucket enforces. */
export const MESSAGE_FILE_LIMIT = 26_214_400

export const openConversationSchema = z.object({
  counterpart_id: z.uuid('Choose somebody to message'),
})

export const messageSchema = z
  .object({
    conversation_id: z.uuid(),

    body: z
      .string()
      .trim()
      .max(4000, 'That message is too long')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),

    // The four attachment fields travel together or not at all, mirroring
    // `messages_attachment_ck`.
    storage_path: z.string().min(1).max(500).optional(),
    file_name: z.string().min(1).max(255).optional(),
    mime_type: z.enum(MESSAGE_MIME_TYPES).optional(),
    file_size: z.coerce.number().int().min(1).max(MESSAGE_FILE_LIMIT).optional(),
  })
  .refine((values) => Boolean(values.body) || Boolean(values.storage_path), {
    message: 'Write something or attach a file',
    path: ['body'],
  })
  .refine(
    (values) =>
      [values.storage_path, values.file_name, values.mime_type, values.file_size].every(
        (field) => field === undefined,
      ) ||
      [values.storage_path, values.file_name, values.mime_type, values.file_size].every(
        (field) => field !== undefined,
      ),
    { message: 'The attachment is incomplete', path: ['file_name'] },
  )

export type MessageInput = z.infer<typeof messageSchema>
