'use server'

import { revalidatePath } from 'next/cache'

import { requireTenant, getSessionContext } from '@/lib/auth/session'
import { AppError, action, notFound, type ActionResult } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { TicketCategory, TicketPriority, TicketStatus } from '@/types/database.generated'
import { toFieldErrors } from '@/lib/validation/common'
import { raiseTicketSchema, ticketReplySchema, triageTicketSchema } from '@/lib/validation/support'

/**
 * Support tickets.
 *
 * A ticket names the office it was addressed to — the raiser's own institution,
 * or HQ — and that choice decides who may read it. Routing is strict: an
 * institution's administrators see tickets addressed to the institution and
 * nothing else. One addressed to HQ stays invisible to them, which is what
 * makes it usable for reporting a problem WITH that institution.
 *
 * Every read below is unfiltered by person, and deliberately so. `tickets_select`
 * decides, so a query here cannot widen what comes back; the worst a bug in this
 * file can do is fail to show somebody their own ticket.
 *
 * Notifications go out with the service role rather than the caller's client,
 * because `notification.broadcast` is a permission no student, teacher or
 * reviewer should hold generally — it would allow notifying anybody. The
 * recipients are never chosen by the caller: they are the ticket's own raiser,
 * the HQ administrators, or the institution's own, each read from the record.
 */

export type TicketSummary = {
  id: string
  reference: string
  subject: string
  category: string
  priority: string
  status: string
  raised_as: string
  raised_to: string
  raised_by: string
  institution_id: string
  last_reply_at: string | null
  created_at: string
  institutions?: { name: string } | null
  profiles?: { full_name: string; email: string } | null
}

export type TicketMessage = {
  id: string
  ticket_id: string
  author_id: string
  body: string
  is_internal: boolean
  created_at: string
}

export type TicketDetail = {
  ticket: TicketSummary & { body: string; assigned_to: string | null; resolved_at: string | null }
  messages: TicketMessage[]
}

const SUMMARY =
  'id, reference, subject, category, priority, status, raised_as, raised_to, raised_by, institution_id, last_reply_at, created_at'

/** The caller's own tickets, newest activity first. */
export async function listMyTickets(): Promise<TicketSummary[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('support_tickets')
    .select(SUMMARY)
    // Redundant against `tickets_select`, and kept: were that policy ever
    // loosened, this would still return one person's own queries.
    .eq('raised_by', session.userId)
    .order('last_reply_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as TicketSummary[]
}

/** Every ticket in the federation. HQ only — RLS returns nothing to anybody else. */
export async function listAllTickets(filters: {
  status?: string
  priority?: string
} = {}): Promise<TicketSummary[]> {
  const supabase = await createClient()

  let query = supabase
    .from('support_tickets')
    .select(`${SUMMARY}, institutions ( name ), profiles!support_tickets_raised_by_fkey ( full_name, email )`)
    .order('last_reply_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.status) query = query.eq('status', filters.status as never)
  if (filters.priority) query = query.eq('priority', filters.priority as never)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TicketSummary[]
}

/**
 * Tickets addressed to the caller's own institution.
 *
 * The `raised_to` filter is belt and braces — `tickets_select` already returns
 * an administrator only the institution-directed ones — but stating it here
 * means a reader of this function can see the intent without going to the
 * policy, and a loosened policy would not silently turn this into a list of
 * their members' private queries to HQ.
 */
export async function listInstitutionTickets(filters: {
  status?: string
} = {}): Promise<TicketSummary[]> {
  const session = await requireTenant()
  const supabase = await createClient()

  let query = supabase
    .from('support_tickets')
    .select(`${SUMMARY}, profiles!support_tickets_raised_by_fkey ( full_name, email )`)
    .eq('institution_id', session.institutionId!)
    .eq('raised_to', 'INSTITUTION')
    .order('last_reply_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(200)

  if (filters.status) query = query.eq('status', filters.status as never)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as TicketSummary[]
}

export async function getTicket(id: string): Promise<TicketDetail | null> {
  const supabase = await createClient()

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .select(
      `${SUMMARY}, body, assigned_to, resolved_at, institutions ( name ), profiles!support_tickets_raised_by_fkey ( full_name, email )`,
    )
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!ticket) return null

  /*
   * Internal notes are filtered by `ticket_messages_select`, not here. RLS
   * cannot hide a column, so an HQ-only note is a row the raiser's policy does
   * not return — which means this query is the same for both parties and only
   * the database decides what each sees.
   */
  const { data: messages, error: messageError } = await supabase
    .from('support_ticket_messages')
    .select('id, ticket_id, author_id, body, is_internal, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  if (messageError) throw messageError

  return {
    ticket: ticket as unknown as TicketDetail['ticket'],
    messages: (messages ?? []) as TicketMessage[],
  }
}

export async function raiseTicket(input: unknown): Promise<ActionResult<{ id: string; reference: string }>> {
  return action(async () => {
    const session = await requireTenant()

    const parsed = raiseTicketSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'ticket rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    if (!['INSTITUTION_ADMIN', 'TEACHER', 'STUDENT'].includes(session.role)) {
      throw new AppError('FORBIDDEN', 'role cannot raise tickets', {
        publicMessage: 'Support tickets are raised by institution members.',
      })
    }

    /*
     * An institution administrator is the institution, so there is nobody else
     * for them to address. Forced here rather than validated, and a CHECK
     * constraint refuses the other combination independently.
     */
    const raisedTo = session.role === 'INSTITUTION_ADMIN' ? 'HQ' : parsed.data.raised_to

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('support_tickets')
      .insert({
        institution_id: session.institutionId!,
        // From the session, never the form.
        raised_by: session.userId,
        raised_as: session.role,
        raised_to: raisedTo,
        subject: parsed.data.subject,
        body: parsed.data.body,
        category: parsed.data.category,
        priority: parsed.data.priority,
      })
      .select('id, reference')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new AppError('FORBIDDEN', 'ticket not created')

    if (raisedTo === 'HQ') {
      await notifyHq(data.id, data.reference, parsed.data.subject)
    } else {
      await notifyInstitution(
        session.institutionId!,
        data.id,
        data.reference,
        parsed.data.subject,
      )
    }

    revalidatePath('/institution/support')
    revalidatePath('/teacher/support')
    revalidatePath('/student/support')
    revalidatePath('/hq/support')
    return { id: data.id, reference: data.reference }
  })
}

export async function replyToTicket(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await getSessionContext()
    if (!session) throw new AppError('UNAUTHENTICATED', 'not signed in')

    const parsed = ticketReplySchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'reply rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    /*
     * Whether this person is the office the ticket was addressed to is decided
     * by the database — `ticket_messages_insert` calls
     * `private.can_handle_ticket()`. This check only produces a civil message
     * before the policy produces a bare 42501.
     */
    const isHq = session.role === 'HQ_ADMIN'
    const isInstitutionHandler = session.permissions.has('support.resolve')
    if (parsed.data.is_internal && !isHq && !isInstitutionHandler) {
      throw new AppError('FORBIDDEN', 'internal notes are for the handling office', {
        publicMessage: 'Only the office handling this ticket can leave an internal note.',
      })
    }

    const supabase = await createClient()

    // Readable only to the raiser and HQ, so this read is the membership check.
    const { data: ticket } = await supabase
      .from('support_tickets')
      .select('id, reference, subject, raised_by, status, raised_to, institution_id')
      .eq('id', parsed.data.ticket_id)
      .maybeSingle()

    if (!ticket) throw notFound('ticket not found')
    if (ticket.status === 'CLOSED') {
      throw new AppError('CONFLICT', 'ticket closed', {
        publicMessage: 'This ticket is closed. Raise a new one if you still need help.',
      })
    }

    const { data, error } = await supabase
      .from('support_ticket_messages')
      .insert({
        ticket_id: parsed.data.ticket_id,
        author_id: session.userId,
        body: parsed.data.body,
        is_internal: parsed.data.is_internal,
      })
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw new AppError('FORBIDDEN', 'reply not sent')

    // An internal note is not an update to the person waiting.
    if (!parsed.data.is_internal) {
      const fromHandler = session.userId !== ticket.raised_by
      if (fromHandler) {
        await notifyRaiser(ticket.raised_by, parsed.data.ticket_id, ticket.reference, ticket.subject)
      } else if (ticket.raised_to === 'HQ') {
        await notifyHq(parsed.data.ticket_id, ticket.reference, ticket.subject, 'replied to')
      } else {
        await notifyInstitution(
          ticket.institution_id,
          parsed.data.ticket_id,
          ticket.reference,
          ticket.subject,
          'replied to',
        )
      }
    }

    revalidatePath('/hq/support')
    revalidatePath('/institution/support')
    revalidatePath('/teacher/support')
    revalidatePath('/student/support')
    return { id: data.id }
  })
}

/** HQ triage: status, priority, category, assignment. */
export async function triageTicket(input: unknown): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await getSessionContext()
    if (!session) throw new AppError('UNAUTHENTICATED', 'not signed in')

    const parsed = triageTicketSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError('VALIDATION', 'triage rejected', {
        fieldErrors: toFieldErrors(parsed.error),
      })
    }

    const supabase = await createClient()

    /*
     * Built field by field against the real column types rather than spread
     * from a generic object. A `Record<string, unknown>` would let any future
     * schema key reach the table, which is the mistake this layer exists to
     * prevent — the same reasoning as `updateTeacher`.
     */
    const patch: {
      status?: TicketStatus
      priority?: TicketPriority
      category?: TicketCategory
      assigned_to?: string
    } = {}
    if (parsed.data.status) patch.status = parsed.data.status
    if (parsed.data.priority) patch.priority = parsed.data.priority
    if (parsed.data.category) patch.category = parsed.data.category
    if (parsed.data.assign_to_me) patch.assigned_to = session.userId

    if (Object.keys(patch).length === 0) {
      throw new AppError('VALIDATION', 'nothing to change', {
        publicMessage: 'Choose something to change.',
      })
    }

    const { data, error } = await supabase
      .from('support_tickets')
      .update(patch)
      .eq('id', parsed.data.ticket_id)
      .select('id, raised_by, reference, subject, status')
      .maybeSingle()

    if (error) {
      // 42501 is `guard_ticket_columns` refusing a non-HQ triage.
      if (error.code === '42501') {
        throw new AppError('FORBIDDEN', error.message, {
          publicMessage: 'Only HQ can triage a ticket.',
        })
      }
      throw error
    }
    if (!data) throw notFound('ticket not found')

    if (parsed.data.status && ['RESOLVED', 'CLOSED'].includes(parsed.data.status)) {
      await notifyRaiser(
        data.raised_by,
        data.id,
        data.reference,
        data.subject,
        parsed.data.status === 'CLOSED' ? 'closed' : 'resolved',
      )
    }

    revalidatePath('/hq/support')
    revalidatePath(`/hq/support/${parsed.data.ticket_id}`)
    return { id: data.id }
  })
}

/** The raiser closing their own ticket. The trigger allows exactly this. */
export async function closeMyTicket(input: {
  ticket_id: string
}): Promise<ActionResult<{ id: string }>> {
  return action(async () => {
    const session = await requireTenant()
    const supabase = await createClient()

    const { data, error } = await supabase
      .from('support_tickets')
      .update({ status: 'CLOSED' })
      .eq('id', input.ticket_id)
      .eq('raised_by', session.userId)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) throw notFound('ticket not found')

    revalidatePath('/institution/support')
    revalidatePath('/teacher/support')
    revalidatePath('/student/support')
    return { id: data.id }
  })
}

// ── Notifications ───────────────────────────────────────────────────────────

async function notifyHq(ticketId: string, reference: string, subject: string, verb = 'raised') {
  const admin = createAdminClient()

  const { data: hq } = await admin.from('profiles').select('id').eq('role', 'HQ_ADMIN').eq('status', 'ACTIVE')
  if (!hq || hq.length === 0) return

  const { error } = await admin.from('notifications').insert(
    hq.map((person) => ({
      user_id: person.id,
      // HQ has no institution, and the column is nullable for exactly this.
      institution_id: null,
      category: 'SYSTEM' as const,
      priority: 'NORMAL' as const,
      title: `Support ticket ${verb}: ${reference}`,
      body: subject,
      /*
       * The queue opens a ticket with `?ticket=`, not a path segment. This
       * pointed at `/hq/support/<id>` — a route that does not exist — so every
       * notification HQ received led to a 404.
       */
      deep_link: `/hq/support?ticket=${ticketId}`,
    })),
  )

  // A failed notification must not fail a ticket that has been recorded.
  if (error) console.warn('[afi:support] could not notify HQ', error.message)
}

async function notifyRaiser(
  raiserId: string,
  ticketId: string,
  reference: string,
  subject: string,
  verb = 'answered',
) {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('institution_id, role')
    .eq('id', raiserId)
    .maybeSingle()

  /*
   * There is no `/support`. Each workspace has its own, and the raiser's role
   * decides which one their ticket lives in — a student following a link to
   * `/teacher/support` would be bounced by the layout guard.
   */
  const workspace =
    profile?.role === 'STUDENT'
      ? '/student'
      : profile?.role === 'TEACHER'
        ? '/teacher'
        : '/institution'

  const { error } = await admin.from('notifications').insert({
    user_id: raiserId,
    institution_id: profile?.institution_id ?? null,
    category: 'SYSTEM' as const,
    priority: 'NORMAL' as const,
    title: `Your support ticket was ${verb}: ${reference}`,
    body: subject,
    deep_link: `${workspace}/support?ticket=${ticketId}`,
  })

  if (error) console.warn('[afi:support] could not notify the raiser', error.message)
}

/**
 * Tells an institution's own administrators that one of their members has
 * raised something.
 *
 * The recipients are read from `institution_admins` rather than accepted as an
 * argument, for the same reason `notifyHq` reads the HQ list: a caller choosing
 * who gets notified would be a way to reach anybody.
 */
async function notifyInstitution(
  institutionId: string,
  ticketId: string,
  reference: string,
  subject: string,
  verb = 'raised',
) {
  const admin = createAdminClient()

  const { data: admins } = await admin
    .from('institution_admins')
    .select('profile_id')
    .eq('institution_id', institutionId)
    .eq('status', 'ACTIVE')

  if (!admins || admins.length === 0) return

  const { error } = await admin.from('notifications').insert(
    admins.map((person) => ({
      user_id: person.profile_id,
      institution_id: institutionId,
      category: 'SYSTEM' as const,
      priority: 'NORMAL' as const,
      title: `Support ticket ${verb}: ${reference}`,
      body: subject,
      deep_link: `/institution/support?ticket=${ticketId}`,
    })),
  )

  if (error) console.warn('[afi:support] could not notify the institution', error.message)
}
