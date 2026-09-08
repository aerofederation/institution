import { z } from 'zod'

/**
 * Raising and answering a support ticket.
 *
 * `institution_id`, `raised_by` and `raised_as` are absent from every schema
 * here. All three come from the session: which institution somebody belongs to
 * and what role they hold are facts about their account, not claims a form gets
 * to make. `tickets_insert` checks the first two again independently.
 *
 * The minimum body length is not padding for its own sake. A ticket that says
 * only "not working" costs HQ a round trip to find out what is not working, and
 * the person waiting is the one who pays for it.
 */

export const TICKET_CATEGORIES = [
  'ACCOUNT_ACCESS',
  'ACADEMIC',
  'TECHNICAL',
  'BILLING',
  'DATA_CORRECTION',
  'COMPLAINT',
  'OTHER',
] as const

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const

/**
 * Who the ticket is addressed to, and therefore who may read it.
 *
 * Not a routing hint — the audience decides visibility. A ticket sent to HQ is
 * invisible to the raiser's own institution, which is what makes it usable for
 * reporting a problem with that institution.
 */
export const TICKET_AUDIENCES = ['INSTITUTION', 'HQ'] as const

export const TICKET_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_ON_USER',
  'RESOLVED',
  'CLOSED',
] as const

export const raiseTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(5, 'Give the query a subject of at least 5 characters')
    .max(200, 'Keep the subject under 200 characters'),
  body: z
    .string()
    .trim()
    .min(20, 'Describe the issue in at least 20 characters so HQ can act on it')
    .max(8000, 'That description is too long — attach detail in a reply instead'),
  category: z.enum(TICKET_CATEGORIES),
  /*
   * The raiser picks a priority and HQ may change it. Accepting it is not the
   * same as trusting it: the guard trigger stops anybody but HQ altering it
   * afterwards, so it is a starting suggestion rather than a lever.
   */
  priority: z.enum(TICKET_PRIORITIES).default('NORMAL'),
  /*
   * Defaults to the institution, because most of what a teacher or student
   * needs is their own institution's to fix. An institution administrator is
   * forced to HQ by the service and by a CHECK constraint — they are the
   * institution, so there is nobody else for them to address.
   */
  raised_to: z.enum(TICKET_AUDIENCES).default('INSTITUTION'),
})
export type RaiseTicketInput = z.infer<typeof raiseTicketSchema>

export const ticketReplySchema = z.object({
  ticket_id: z.uuid(),
  body: z.string().trim().min(1, 'Write a reply').max(8000),
  /** HQ-only. The service refuses it from anybody else, and so does RLS. */
  is_internal: z
    .union([z.literal('true'), z.literal('on'), z.literal(''), z.boolean()])
    .transform((value) => value === true || value === 'true' || value === 'on')
    .optional()
    .default(false),
})
export type TicketReplyInput = z.infer<typeof ticketReplySchema>

/** HQ triage. Everything here is refused from a non-HQ caller by the trigger. */
export const triageTicketSchema = z.object({
  ticket_id: z.uuid(),
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  assign_to_me: z
    .union([z.literal('true'), z.literal('on'), z.literal(''), z.boolean()])
    .transform((value) => value === true || value === 'true' || value === 'on')
    .optional()
    .default(false),
})
export type TriageTicketInput = z.infer<typeof triageTicketSchema>
