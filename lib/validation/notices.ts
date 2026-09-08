import { z } from 'zod'

import { checkboxField } from './common'

/**
 * Institution notices.
 *
 * `institution_id`, `author_id` and `published_at` are absent by design. The
 * first two come from the session and are checked again by `notices_insert`;
 * the third is stamped by a trigger, because a client-supplied publication time
 * is a claim rather than a fact.
 */

export const NOTICE_AUDIENCES = ['EVERYONE', 'TEACHERS', 'STUDENTS'] as const
export const NOTICE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

/** Local wall clock from the picker, resolved to an instant in the browser. */
const instant = z
  .union([z.iso.datetime({ offset: true }), z.literal('')])
  .transform((value) => (value === '' ? null : value))
  .nullish()

export const noticeSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Give the notice a title')
    .max(200, 'Keep the title under 200 characters'),
  body: z
    .string()
    .trim()
    .min(1, 'Write the notice')
    .max(10_000, 'That notice is too long'),
  audience: z.enum(NOTICE_AUDIENCES),
  priority: z.enum(NOTICE_PRIORITIES).default('NORMAL'),
  pinned: checkboxField,
  is_published: checkboxField,
  /** Optional. A notice about an event stops being one after the event. */
  expires_at: instant,
})
export type NoticeInput = z.infer<typeof noticeSchema>

export const updateNoticeSchema = noticeSchema.extend({
  notice_id: z.uuid(),
})
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>
