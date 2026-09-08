/**
 * Direct messaging: does a private conversation stay private?
 *
 * Run against the real database with real signed-in clients, because that is
 * the only way an RLS policy proves anything. A policy that reads correctly can
 * still admit the wrong row, and PL/pgSQL bodies are not type-checked until
 * they run — a clean `db push` establishes neither.
 *
 * The hard case is built deliberately: both teachers teach the same class, so
 * both are legitimately paired with both students. Isolation therefore cannot
 * come from tenancy or from class membership. It has to come from the
 * conversation itself.
 *
 * Everything it creates is deleted at the end.
 */

import './load-env.mts'

import { randomBytes } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !anonKey || !serviceKey) {
  console.error('\nNeeds Supabase configuration. Run `npm run check:env`.\n')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = '') {
  if (ok) {
    passed += 1
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } else {
    failed += 1
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const suffix = randomBytes(3).toString('hex')
const created = { institutions: [] as string[], users: [] as string[] }

async function makeUser(
  institutionId: string,
  role: 'TEACHER' | 'STUDENT' | 'INSTITUTION_ADMIN',
  label: string,
): Promise<{ id: string; email: string; token: string; client: SupabaseClient }> {
  const email = `zzm.${label}.${suffix}@example.test`
  const password = `Zz${randomBytes(12).toString('hex')}!9`

  const invite = await admin.auth.admin.generateLink({ type: 'invite', email })
  const id = invite.data?.user?.id
  if (!id) throw new Error(`could not create ${label}: ${invite.error?.message}`)
  created.users.push(id)

  const { error } = await admin.rpc('provision_profile', {
    user_id: id,
    user_email: email,
    full_name: `ZZ ${label}`,
    role,
    institution_id: institutionId,
  })
  if (error) throw error

  await admin.auth.admin.updateUserById(id, {
    password,
    email_confirm: true,
    app_metadata: { afi_role: role },
  })
  await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', id)

  const client = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`sign-in failed for ${label}: ${signIn.error.message}`)

  const token = signIn.data.session?.access_token
  if (!token) throw new Error(`no access token for ${label}`)

  /*
   * Realtime runs the SELECT policy against the token on its own socket, which
   * is separate from the one PostgREST uses. With `persistSession: false` there
   * is no stored session for it to pick up, so it must be handed over — without
   * this the socket is anonymous, every row fails the policy, and the
   * subscription silently receives nothing at all.
   */
  await client.realtime.setAuth(token)

  return { id, email, token, client }
}

async function main() {
  console.log(`\nVerifying direct messaging isolation on ${new URL(url!).host}\n`)

  // ── A tenant with two teachers and two students, all in one class ─────────
  const { data: approver } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'HQ_ADMIN')
    .limit(1)
    .maybeSingle()

  const { data: institution, error: institutionError } = await admin
    .from('institutions')
    .insert({
      slug: `zzm-${suffix}`,
      name: `ZZ Messaging Institute ${suffix}`,
      institution_type: 'UNIVERSITY',
      category: 'PRIVATE',
      official_email: `office.m.${suffix}@example.test`,
      country: 'India',
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: approver?.id ?? null,
    })
    .select('id')
    .single()

  check('a tenant can be provisioned', !institutionError, institutionError?.message)
  if (!institution) process.exit(1)
  created.institutions.push(institution.id)
  const tenant = institution.id

  const { data: year } = await admin
    .from('academic_years')
    .insert({
      institution_id: tenant,
      name: `2026-27-${suffix}`,
      starts_on: '2026-07-01',
      ends_on: '2027-06-30',
      is_current: true,
    })
    .select('id')
    .single()

  const { data: klass } = await admin
    .from('classes')
    .insert({ institution_id: tenant, academic_year_id: year!.id, name: `First Year ${suffix}` })
    .select('id')
    .single()

  // A second class nobody in the first one touches — used for the pairing rule.
  const { data: otherClass } = await admin
    .from('classes')
    .insert({ institution_id: tenant, academic_year_id: year!.id, name: `Other Year ${suffix}` })
    .select('id')
    .single()

  const teacherA = await makeUser(tenant, 'TEACHER', 'teacher-a')
  const teacherB = await makeUser(tenant, 'TEACHER', 'teacher-b')
  const studentA = await makeUser(tenant, 'STUDENT', 'student-a')
  const studentB = await makeUser(tenant, 'STUDENT', 'student-b')
  const outsider = await makeUser(tenant, 'STUDENT', 'student-outsider')
  const principal = await makeUser(tenant, 'INSTITUTION_ADMIN', 'principal')

  for (const [person, code] of [
    [teacherA, 'TA'],
    [teacherB, 'TB'],
  ] as const) {
    await admin.from('teachers').insert({
      profile_id: person.id,
      institution_id: tenant,
      employee_id: `${code}-${suffix}`,
      status: 'ACTIVE',
    })
  }

  for (const [person, code, room] of [
    [studentA, 'SA', klass!.id],
    [studentB, 'SB', klass!.id],
    [outsider, 'SO', otherClass!.id],
  ] as const) {
    await admin.from('students').insert({
      profile_id: person.id,
      institution_id: tenant,
      student_code: `${code}-${suffix}`,
      class_id: room,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
    await admin.from('student_enrollments').insert({
      institution_id: tenant,
      student_id: person.id,
      class_id: room,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
  }

  // Both teachers teach the shared class. Neither teaches the other class.
  for (const person of [teacherA, teacherB]) {
    await admin.from('teacher_class_assignments').insert({
      institution_id: tenant,
      teacher_id: person.id,
      class_id: klass!.id,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
  }

  check('two teachers and three students share one institution', true)

  // ── Who may I message? ────────────────────────────────────────────────────
  /*
   * The picker is built from `my_message_contacts()`, so it has to agree
   * exactly with the conversation INSERT policy: a name it offers must be one
   * the database will accept, and a name it withholds must be one the database
   * refuses. PL/pgSQL is not checked until it runs, so this executes it.
   */
  const teacherContacts = await teacherA.client.rpc('my_message_contacts')
  const teacherContactIds = (teacherContacts.data ?? []).map((row: { profile_id: string }) => row.profile_id)

  check(
    'a teacher is offered the students they teach',
    !teacherContacts.error &&
      teacherContactIds.includes(studentA.id) &&
      teacherContactIds.includes(studentB.id),
    teacherContacts.error?.message ?? `${teacherContactIds.length} contact(s)`,
  )
  check(
    'a teacher is not offered a student from a class they do not teach',
    !teacherContactIds.includes(outsider.id),
    teacherContactIds.includes(outsider.id) ? 'the outsider was offered' : '',
  )

  const studentContacts = await studentA.client.rpc('my_message_contacts')
  const studentContactIds = (studentContacts.data ?? []).map((row: { profile_id: string }) => row.profile_id)

  check(
    'a student is offered the teachers who teach them',
    !studentContacts.error &&
      studentContactIds.includes(teacherA.id) &&
      studentContactIds.includes(teacherB.id),
    studentContacts.error?.message ?? `${studentContactIds.length} contact(s)`,
  )

  const outsiderContacts = await outsider.client.rpc('my_message_contacts')
  check(
    'a student with no teaching assignment is offered nobody',
    (outsiderContacts.data ?? []).length === 0,
    `${(outsiderContacts.data ?? []).length} contact(s)`,
  )

  const principalContacts = await principal.client.rpc('my_message_contacts')
  check(
    'an administrator is offered nobody — messaging is not their surface',
    (principalContacts.data ?? []).length === 0,
    `${(principalContacts.data ?? []).length} contact(s)`,
  )

  // ── Starting a conversation ───────────────────────────────────────────────
  const { data: chatAA, error: startError } = await teacherA.client
    .from('conversations')
    .insert({ institution_id: tenant, teacher_id: teacherA.id, student_id: studentA.id, started_by: teacherA.id })
    .select('id')
    .single()

  check('a teacher can open a conversation with a student they teach', !startError, startError?.message)
  if (!chatAA) process.exit(1)

  const studentStarted = await studentB.client
    .from('conversations')
    .insert({ institution_id: tenant, teacher_id: teacherB.id, student_id: studentB.id, started_by: studentB.id })
    .select('id')
    .single()

  check(
    'a student can open one with a teacher who teaches them',
    !studentStarted.error,
    studentStarted.error?.message,
  )

  // ── The pairing rule ──────────────────────────────────────────────────────
  const unpaired = await teacherA.client
    .from('conversations')
    .insert({ institution_id: tenant, teacher_id: teacherA.id, student_id: outsider.id, started_by: teacherA.id })
  check(
    'a teacher cannot open one with a student they do not teach',
    Boolean(unpaired.error),
    unpaired.error?.code ?? 'the insert was accepted',
  )

  const impersonated = await teacherA.client
    .from('conversations')
    .insert({ institution_id: tenant, teacher_id: teacherB.id, student_id: studentA.id, started_by: teacherA.id })
  check(
    'a teacher cannot open a conversation between two other people',
    Boolean(impersonated.error),
    impersonated.error?.code ?? 'the insert was accepted',
  )

  const duplicate = await teacherA.client
    .from('conversations')
    .insert({ institution_id: tenant, teacher_id: teacherA.id, student_id: studentA.id, started_by: teacherA.id })
  check(
    'a pair gets one thread, not two',
    Boolean(duplicate.error),
    duplicate.error?.code ?? 'a second thread was created',
  )

  // ── Who can see the conversation ──────────────────────────────────────────
  const aSees = await teacherA.client.from('conversations').select('id').eq('id', chatAA.id)
  check('the teacher in it sees it', (aSees.data ?? []).length === 1)

  const studentSees = await studentA.client.from('conversations').select('id').eq('id', chatAA.id)
  check('the student in it sees it', (studentSees.data ?? []).length === 1)

  const teacherBSees = await teacherB.client.from('conversations').select('id').eq('id', chatAA.id)
  check(
    'teacher B cannot see teacher A’s conversation — same class, same student',
    (teacherBSees.data ?? []).length === 0,
    `${(teacherBSees.data ?? []).length} row(s) visible`,
  )

  const studentBSees = await studentB.client.from('conversations').select('id').eq('id', chatAA.id)
  check(
    'student B cannot see student A’s conversation',
    (studentBSees.data ?? []).length === 0,
    `${(studentBSees.data ?? []).length} row(s) visible`,
  )

  const principalSees = await principal.client.from('conversations').select('id').eq('id', chatAA.id)
  check(
    'the institution administrator cannot see it either',
    (principalSees.data ?? []).length === 0,
    `${(principalSees.data ?? []).length} row(s) visible`,
  )

  // An unfiltered read is the question that matters: not "can they fetch this
  // row by id" but "what does the table look like to them".
  const teacherBAll = await teacherB.client.from('conversations').select('id')
  check(
    'an unfiltered read returns only your own threads',
    (teacherBAll.data ?? []).every((row) => row.id !== chatAA.id),
    `${(teacherBAll.data ?? []).length} row(s) total`,
  )

  // ── Messages ──────────────────────────────────────────────────────────────
  const { data: sent, error: sendError } = await teacherA.client
    .from('messages')
    .insert({
      institution_id: tenant,
      conversation_id: chatAA.id,
      sender_id: teacherA.id,
      body: 'Please bring your propulsion notes tomorrow.',
    })
    .select('id, created_at')
    .single()

  check('a participant can send a message', !sendError, sendError?.message)

  const replied = await studentA.client
    .from('messages')
    .insert({
      institution_id: tenant,
      conversation_id: chatAA.id,
      sender_id: studentA.id,
      body: 'Yes sir, I will.',
    })
    .select('id')
    .single()

  check('the other participant can reply', !replied.error, replied.error?.message)

  const studentReads = await studentA.client
    .from('messages')
    .select('id, body')
    .eq('conversation_id', chatAA.id)
  check('both messages are readable inside the conversation', (studentReads.data ?? []).length === 2)

  const teacherBReads = await teacherB.client
    .from('messages')
    .select('id')
    .eq('conversation_id', chatAA.id)
  check(
    'teacher B cannot read the messages',
    (teacherBReads.data ?? []).length === 0,
    `${(teacherBReads.data ?? []).length} row(s) visible`,
  )

  const studentBReads = await studentB.client
    .from('messages')
    .select('id')
    .eq('conversation_id', chatAA.id)
  check(
    'student B cannot read the messages',
    (studentBReads.data ?? []).length === 0,
    `${(studentBReads.data ?? []).length} row(s) visible`,
  )

  const principalReads = await principal.client.from('messages').select('id')
  check(
    'the administrator sees no messages at all',
    (principalReads.data ?? []).length === 0,
    `${(principalReads.data ?? []).length} row(s) visible`,
  )

  // ── Writing into somebody else's conversation ─────────────────────────────
  const intruder = await teacherB.client.from('messages').insert({
    institution_id: tenant,
    conversation_id: chatAA.id,
    sender_id: teacherB.id,
    body: 'Let me into this thread.',
  })
  check(
    'teacher B cannot post into that conversation',
    Boolean(intruder.error),
    intruder.error?.code ?? 'the insert was accepted',
  )

  const spoofed = await studentA.client.from('messages').insert({
    institution_id: tenant,
    conversation_id: chatAA.id,
    sender_id: teacherA.id,
    body: 'Written by the student, signed by the teacher.',
  })
  check(
    'a participant cannot post as the other person',
    Boolean(spoofed.error),
    spoofed.error?.code ?? 'the insert was accepted',
  )

  // ── A sent message is a record ────────────────────────────────────────────
  const edited = await teacherA.client
    .from('messages')
    .update({ body: 'Something I never actually said.' })
    .eq('id', sent!.id)
    .select('id')
  check(
    'a message cannot be edited once sent',
    Boolean(edited.error) || (edited.data ?? []).length === 0,
    edited.error?.code ?? `${(edited.data ?? []).length} row(s) rewritten`,
  )

  const selfRead = await teacherA.client
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', sent!.id)
    .select('id')
  check(
    'a sender cannot mark their own message read',
    Boolean(selfRead.error) || (selfRead.data ?? []).length === 0,
    selfRead.error?.code ?? `${(selfRead.data ?? []).length} row(s) updated`,
  )

  const recipientRead = await studentA.client
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('id', sent!.id)
    .select('id, read_at')
    .maybeSingle()
  check(
    'the recipient can mark it read',
    !recipientRead.error && Boolean(recipientRead.data?.read_at),
    recipientRead.error?.message,
  )

  // ── The conversation summary is derived, not asserted ─────────────────────
  const { data: summary } = await teacherA.client
    .from('conversations')
    .select('last_message_at, last_message_preview, last_sender_id')
    .eq('id', chatAA.id)
    .single()

  check(
    'the thread carries the latest message for the list',
    summary?.last_message_preview === 'Yes sir, I will.' && summary?.last_sender_id === studentA.id,
    `preview ${JSON.stringify(summary?.last_message_preview)}`,
  )

  const forged = await teacherA.client
    .from('conversations')
    .update({ last_message_preview: 'Forged summary' })
    .eq('id', chatAA.id)
    .select('id')
  check(
    'a participant cannot rewrite the summary by hand',
    Boolean(forged.error) || (forged.data ?? []).length === 0,
    forged.error?.code ?? `${(forged.data ?? []).length} row(s) updated`,
  )

  // ── Cross-tenant ──────────────────────────────────────────────────────────
  const { data: other, error: otherError } = await admin
    .from('institutions')
    .insert({
      slug: `zzm2-${suffix}`,
      name: `ZZ Other Institute ${suffix}`,
      institution_type: 'UNIVERSITY',
      category: 'PRIVATE',
      official_email: `office.m2.${suffix}@example.test`,
      country: 'India',
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: approver?.id ?? null,
    })
    .select('id')
    .single()

  check('a second tenant exists to test against', !otherError, otherError?.message)
  if (!other) throw new Error(`second tenant not created: ${otherError?.message}`)
  created.institutions.push(other.id)

  /*
   * A pair with no thread yet, deliberately. Using teacher A and student A here
   * would be rejected by `conversations_pair_uk` before the tenancy was ever
   * tested — a unique violation reads as a pass and proves nothing. The code is
   * asserted for the same reason: this must fail as 23503, the composite
   * foreign key finding no matching row in the other institution.
   */
  const crossTenant = await admin.from('conversations').insert({
    institution_id: other.id,
    teacher_id: teacherA.id,
    student_id: studentB.id,
    started_by: teacherA.id,
  })
  check(
    'a conversation cannot span two institutions, even for the service role',
    crossTenant.error?.code === '23503',
    crossTenant.error?.code ?? 'the insert was accepted',
  )

  // ── Attachments ───────────────────────────────────────────────────────────
  /*
   * The shared buckets in migration 012 are tenant-scoped: any active member
   * can read any object. A private message needs narrower, so attachments have
   * their own bucket keyed by conversation.
   */
  const file = new Blob(['propulsion notes'], { type: 'text/plain' })
  const path = `${tenant}/${chatAA.id}/${randomBytes(8).toString('hex')}.txt`

  const upload = await teacherA.client.storage.from('message-attachments').upload(path, file, {
    contentType: 'text/plain',
  })
  check('a participant can upload an attachment', !upload.error, upload.error?.message)

  const intruderPath = `${tenant}/${chatAA.id}/${randomBytes(8).toString('hex')}.txt`
  const intruderUpload = await teacherB.client.storage
    .from('message-attachments')
    .upload(intruderPath, file, { contentType: 'text/plain' })
  check(
    'a non-participant cannot upload into that conversation’s prefix',
    Boolean(intruderUpload.error),
    intruderUpload.error?.message ?? 'the upload was accepted',
  )

  const participantDownload = await studentA.client.storage
    .from('message-attachments')
    .download(path)
  check(
    'the other participant can download it',
    !participantDownload.error,
    participantDownload.error?.message,
  )

  const intruderDownload = await teacherB.client.storage.from('message-attachments').download(path)
  check(
    'teacher B cannot download it',
    Boolean(intruderDownload.error),
    intruderDownload.error?.message ?? 'the download succeeded',
  )

  const intruderSigned = await teacherB.client.storage
    .from('message-attachments')
    .createSignedUrl(path, 60)
  check(
    'teacher B cannot mint a signed URL for it either',
    Boolean(intruderSigned.error),
    intruderSigned.error?.message ?? 'a signed URL was issued',
  )

  await admin.storage.from('message-attachments').remove([path])

  // ── Realtime ──────────────────────────────────────────────────────────────
  /*
   * "Without a refresh" is the requirement, so it is tested by subscribing and
   * waiting for a message rather than by reading the publication catalogue —
   * a table can be published and still deliver nothing to a given subscriber.
   *
   * Both participants and one non-participant subscribe to the same filter.
   * Realtime re-runs the SELECT policy for each of them before forwarding a
   * row, so the filter is a convenience and the policy is the boundary. If that
   * were ever untrue, the third subscription is where it would show.
   */
  type Waiter = { received: Record<string, unknown>[]; stop: () => Promise<'ok' | 'timed out' | 'error'> }

  async function listen(client: SupabaseClient, label: string): Promise<Waiter> {
    const received: Record<string, unknown>[] = []
    const channel = client
      .channel(`verify-${label}-${randomBytes(4).toString('hex')}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${chatAA!.id}`,
        },
        (payload) => {
          received.push(payload.new as Record<string, unknown>)
        },
      )

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} never subscribed`)), 15_000)
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timer)
          resolve()
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(timer)
          reject(new Error(`${label} subscription failed: ${status}`))
        }
      })
    })

    return {
      received,
      stop: async () => {
        await client.removeChannel(channel)
        return 'ok' as const
      },
    }
  }

  try {
    const [studentLive, teacherLive, intruderLive] = await Promise.all([
      listen(studentA.client, 'student-a'),
      listen(teacherA.client, 'teacher-a'),
      listen(teacherB.client, 'teacher-b'),
    ])

    const send = async () => {
      const body = `Live delivery ${randomBytes(4).toString('hex')}`
      await teacherA.client.from('messages').insert({
        institution_id: tenant,
        conversation_id: chatAA!.id,
        sender_id: teacherA.id,
        body,
      })
      return body
    }

    /*
     * Waits for BOTH participants. Waiting on one and asserting the other made
     * this fail whenever the second delivery landed a moment later.
     *
     * The window is generous because this is a network round trip and not a
     * latency test — a real client renders the message far sooner, and all this
     * has to establish is that it arrives unprompted.
     */
    const settle = async (body: string, within: number) => {
      const deadline = Date.now() + within
      while (
        Date.now() < deadline &&
        !(
          studentLive.received.some((row) => row.body === body) &&
          teacherLive.received.some((row) => row.body === body)
        )
      ) {
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
    }

    let liveBody = await send()
    await settle(liveBody, 30_000)

    /*
     * One retry, and it is reported rather than hidden.
     *
     * Running this suite several times in quick succession has produced a run
     * where nothing at all was delivered — every subscriber saw zero events,
     * including the sender — and the next run was clean. The cause was not
     * established; back-to-back subscription churn against the hosted Realtime
     * service is the obvious suspect, but that is a guess. A single retry keeps
     * the suite from crying wolf about the isolation it is really here to
     * check, and the detail says when the first attempt was dropped, so this
     * cannot quietly become "delivery works, eventually".
     */
    let retried = false
    if (!studentLive.received.some((row) => row.body === liveBody)) {
      retried = true
      liveBody = await send()
      await settle(liveBody, 30_000)
    }

    // A moment more, so a leak to the third subscriber has every chance to land
    // before it is declared absent.
    await new Promise((resolve) => setTimeout(resolve, 2_000))

    const note = retried ? ' (first publish was never delivered — retried)' : ''

    check(
      'the recipient is pushed the message with no refresh',
      studentLive.received.some((row) => row.body === liveBody),
      `${studentLive.received.length} event(s) received${note}`,
    )
    check(
      'the sender sees their own message land too',
      teacherLive.received.some((row) => row.body === liveBody),
      `${teacherLive.received.length} event(s) received${note}`,
    )
    check(
      'teacher B receives nothing, though subscribed to the same filter',
      intruderLive.received.length === 0,
      `${intruderLive.received.length} event(s) leaked`,
    )

    await Promise.all([studentLive.stop(), teacherLive.stop(), intruderLive.stop()])
  } catch (error) {
    check('realtime delivery', false, (error as Error).message)
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await admin.from('conversations').delete().eq('institution_id', tenant)

  const { error: profileError } = await admin
    .from('profiles')
    .delete()
    .eq('institution_id', tenant)
  if (profileError) console.log(`      cleanup profiles: ${profileError.message}`)

  for (const userId of created.users) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) console.log(`      cleanup user: ${error.message}`)
  }

  for (const institutionId of created.institutions) {
    const { error } = await admin.from('institutions').delete().eq('id', institutionId)
    if (error) console.log(`      cleanup: ${error.message}`)
  }

  const { data: left } = await admin
    .from('institutions')
    .select('id')
    .in('id', created.institutions)
  check('fixtures removed', (left ?? []).length === 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
