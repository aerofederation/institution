/**
 * End-to-end verification of the institution workspace.
 *
 *     npm run verify:institution      (needs the dev server on NEXT_PUBLIC_APP_URL)
 *
 * Builds a throwaway institution with its own administrator, signs in as them
 * by redeeming a real activation link, and then drives the actual application:
 * every page is fetched over HTTP and every tenant boundary is probed with that
 * administrator's own credentials.
 *
 * The point is the things that only fail at runtime. A page that throws while
 * rendering, an embed PostgREST cannot resolve, an RLS policy that refuses a
 * write the UI offers — none of those are visible to typecheck, lint or build,
 * and all of them are visible here.
 *
 * A second tenant is created alongside the first. Isolation is not asserted by
 * reading a policy; it is asserted by signing in as one institution's
 * administrator and trying to reach the other's data.
 *
 * Everything it creates is deleted at the end.
 */

import './load-env.mts'

import { randomBytes } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

if (!url || !serviceKey) {
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

function makeJar() {
  const jar = new Map<string, string>()
  return {
    absorb(response: Response) {
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const [pair] = raw.split(';')
        const index = pair.indexOf('=')
        if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim())
      }
    },
    header() {
      return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ')
    },
    has() {
      return [...jar.keys()].some((name) => name.startsWith('sb-'))
    },
  }
}

async function walk(start: string, jar: ReturnType<typeof makeJar>, limit = 5) {
  let current = start
  for (let hop = 0; hop < limit; hop += 1) {
    const response: Response = await fetch(current, {
      redirect: 'manual',
      headers: jar.header() ? { cookie: jar.header() } : {},
    })
    jar.absorb(response)
    const location = response.headers.get('location')
    if (!location) return { url: current, response }
    current = new URL(location, current).toString()
  }
  throw new Error('too many redirects')
}

const suffix = randomBytes(4).toString('hex')
const created = { institutions: [] as string[], users: [] as string[] }

/** Creates an institution and an activated member of it, returning a signed-in jar. */
async function makeTenant(label: string, role: 'INSTITUTION_ADMIN' | 'TEACHER') {
  const { data: approver } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'HQ_ADMIN')
    .limit(1)
    .maybeSingle()

  const { data: institution, error: institutionError } = await admin
    .from('institutions')
    .insert({
      slug: `zzws-${label}-${suffix}`,
      name: `ZZ Workspace ${label} ${suffix}`,
      institution_type: 'UNIVERSITY',
      category: 'PRIVATE',
      official_email: `office.${label}.${suffix}@example.test`,
      country: 'India',
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: approver?.id ?? null,
    })
    .select('id')
    .single()

  if (institutionError || !institution) {
    throw new Error(`could not create institution: ${institutionError?.message}`)
  }
  created.institutions.push(institution.id)

  const email = `zzws.${label}.${suffix}@example.test`
  const invite = await admin.auth.admin.generateLink({ type: 'invite', email })
  const userId = invite.data?.user?.id
  if (!userId) throw new Error(`could not create the account: ${invite.error?.message}`)
  created.users.push(userId)

  const { error: provisionError } = await admin.rpc('provision_profile', {
    user_id: userId,
    user_email: email,
    full_name: `ZZ ${label} Admin`,
    role,
    institution_id: institution.id,
  })
  if (provisionError) throw provisionError

  await admin.auth.admin.updateUserById(userId, { app_metadata: { afi_role: role } })

  if (role === 'INSTITUTION_ADMIN') {
    await admin.from('institution_admins').insert({
      profile_id: userId,
      institution_id: institution.id,
      is_primary: true,
      status: 'ACTIVE',
    })
  } else {
    await admin.from('teachers').insert({
      profile_id: userId,
      institution_id: institution.id,
      employee_id: `T-${suffix}`,
      status: 'ACTIVE',
    })
  }

  /*
   * Activated directly rather than through the form. This script verifies the
   * workspace; `verify:activation` is what proves the activation screen works,
   * and repeating it here would test the same thing twice.
   */
  await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', userId)

  /*
   * The password is set before the link is minted, not after.
   *
   * Changing a password revokes every existing session — correct behaviour, and
   * the reason this ordering matters: setting it later would silently sign the
   * cookie jar out mid-run and the remaining page checks would quietly be
   * testing the login screen.
   */
  const password = `Zz${randomBytes(12).toString('hex')}!9`
  await admin.auth.admin.updateUserById(userId, { password, email_confirm: true })

  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const token = recovery.data?.properties?.hashed_token
  if (!token) throw new Error(`could not mint a link: ${recovery.error?.message}`)

  const jar = makeJar()
  await walk(`${appUrl}/auth/confirm?token_hash=${token}&type=recovery&next=/institution`, jar)

  return { institutionId: institution.id, userId, email, password, jar }
}

async function main() {
  console.log(`\nVerifying the institution workspace against ${appUrl}\n`)

  try {
    await fetch(appUrl, { redirect: 'manual' })
  } catch {
    console.error(`Cannot reach ${appUrl}. Start the dev server first.\n`)
    process.exit(1)
  }

  const primary = await makeTenant('alpha', 'INSTITUTION_ADMIN')
  const other = await makeTenant('beta', 'INSTITUTION_ADMIN')

  check('an institution administrator can sign in', primary.jar.has())

  // ── Every page renders ────────────────────────────────────────────────────
  /*
   * The needles are strings that appear only in the rendered page, never in a
   * <title>. An earlier version matched the page's own metadata title, which
   * meant every check passed against the *login* screen — Next puts the title
   * of the requested route in the document head even when it redirects. A test
   * that passes on the login page is worse than no test, so each needle below
   * is body-only, and the login screen is ruled out explicitly as well.
   */
  const pages: [path: string, mustContain: string][] = [
    ['/institution', 'Awaiting activation'],
    ['/institution/teachers', 'Add teacher'],
    ['/institution/students', 'Enrol student'],
    ['/institution/academics', 'Add academic year'],
    ['/institution/settings', 'Federation record'],
    ['/institution/documents', 'verified by AFI headquarters'],
  ]

  for (const [route, needle] of pages) {
    const landed = await walk(`${appUrl}${route}`, primary.jar)
    const body = await landed.response.text()
    const status = landed.response.status
    const denied = body.includes('This workspace is for institution administrators')
    const loginScreen = body.includes('Use the account issued to you by your institution')

    check(
      `${route} renders`,
      status === 200 && body.includes(needle) && !denied && !loginScreen,
      loginScreen
        ? 'served the sign-in page — the session was lost'
        : denied
          ? 'access denied'
          : status !== 200
            ? `HTTP ${status}`
            : body.includes(needle)
              ? ''
              : `no "${needle}" in the page body`,
    )
  }

  // ── The workspace refuses the wrong role ──────────────────────────────────
  const teacher = await makeTenant('gamma', 'TEACHER')
  const teacherLanding = await walk(`${appUrl}/institution`, teacher.jar)
  const teacherBody = await teacherLanding.response.text()

  check(
    'a teacher is refused the administrator workspace',
    teacherBody.includes('This workspace is for institution administrators') ||
      new URL(teacherLanding.url).pathname !== '/institution',
    new URL(teacherLanding.url).pathname,
  )

  // ── Tenant isolation, as the administrator themselves ─────────────────────
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim()
  const asAdmin = createClient(url!, anonKey, { auth: { persistSession: false } })

  const signIn = await asAdmin.auth.signInWithPassword({
    email: primary.email,
    password: primary.password,
  })
  check('the administrator has a usable database session', !signIn.error, signIn.error?.message)

  const { data: ownDepartment, error: ownDepartmentError } = await asAdmin
    .from('departments')
    .insert({
      institution_id: primary.institutionId,
      code: `AERO${suffix.slice(0, 4)}`,
      name: 'Aerospace Engineering',
    })
    .select('id')
    .single()

  check(
    'the administrator can create a department in their own institution',
    !ownDepartmentError,
    ownDepartmentError?.message,
  )

  const foreignDepartment = await asAdmin.from('departments').insert({
    institution_id: other.institutionId,
    code: `EVIL${suffix.slice(0, 4)}`,
    name: 'Should not exist',
  })

  check(
    'the administrator cannot create a department in another institution',
    Boolean(foreignDepartment.error),
    foreignDepartment.error?.code,
  )

  /*
   * A teacher inside the primary tenant. Both the edit checks below and the
   * subject picker check further down need one, and the `gamma` fixture has
   * its own institution — using that would prove tenant isolation rather than
   * the thing being tested.
   */
  const insideEmail = `zzws.inside.${suffix}@example.test`
  const insidePassword = `Zz${randomBytes(12).toString('hex')}!9`
  const insideInvite = await admin.auth.admin.generateLink({
    type: 'invite',
    email: insideEmail,
  })
  const insideId = insideInvite.data?.user?.id
  if (!insideId) throw new Error('could not create the in-tenant teacher')
  created.users.push(insideId)

  await admin.rpc('provision_profile', {
    user_id: insideId,
    user_email: insideEmail,
    full_name: 'ZZ Inside Teacher',
    role: 'TEACHER',
    institution_id: primary.institutionId,
  })
  await admin.auth.admin.updateUserById(insideId, {
    password: insidePassword,
    email_confirm: true,
    app_metadata: { afi_role: 'TEACHER' },
  })
  await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', insideId)
  await admin.from('teachers').insert({
    profile_id: insideId,
    institution_id: primary.institutionId,
    employee_id: `TIN-${suffix}`,
    status: 'ACTIVE',
  })

  // ── Editing people ────────────────────────────────────────────────────────
  /*
   * `updateTeacher` and `updateStudent` existed with no form anywhere, so a
   * misspelled name could only be corrected with a database client. The forms
   * are new; these check the boundary they sit on, which is the part a form
   * cannot be trusted to enforce.
   */
  const { data: editable } = await admin
    .from('teachers')
    .select('profile_id')
    .eq('institution_id', primary.institutionId)
    .limit(1)
    .maybeSingle()

  if (editable) {
    const renamed = await asAdmin
      .from('profiles')
      .update({ full_name: 'ZZ Renamed Teacher' })
      .eq('id', editable.profile_id)
      .select('id, full_name')
      .maybeSingle()

    check(
      'the administrator can correct their own teacher’s name',
      !renamed.error && renamed.data?.full_name === 'ZZ Renamed Teacher',
      renamed.error?.message,
    )

    const detail = await asAdmin
      .from('teachers')
      .update({ qualification: 'M.Tech Aerospace' })
      .eq('profile_id', editable.profile_id)
      .select('profile_id, qualification')
      .maybeSingle()

    check(
      'and their teaching record',
      !detail.error && detail.data?.qualification === 'M.Tech Aerospace',
      detail.error?.message,
    )

    /*
     * The tenant column is the one an edit must never move. A teacher whose
     * institution_id could be rewritten would be a way to walk somebody into
     * another institution — the service builds its patch field by field for
     * this reason, and the database refuses it independently.
     */
    const moved = await asAdmin
      .from('teachers')
      .update({ institution_id: other.institutionId })
      .eq('profile_id', editable.profile_id)
      .select('profile_id')
    check(
      'but cannot move them into another institution',
      Boolean(moved.error) || (moved.data ?? []).length === 0,
      moved.error?.code ?? `${(moved.data ?? []).length} row(s) moved`,
    )
  } else {
    check('a teacher exists to edit', false, 'no teacher in the primary tenant')
  }

  const foreignTeacherEdit = await asAdmin
    .from('teachers')
    .update({ qualification: 'Edited across the boundary' })
    .eq('institution_id', other.institutionId)
    .select('profile_id')
  check(
    'another institution’s teachers cannot be edited at all',
    (foreignTeacherEdit.data ?? []).length === 0,
    foreignTeacherEdit.error?.code ?? `${(foreignTeacherEdit.data ?? []).length} row(s) edited`,
  )

  // ── HQ editing an institution's details ───────────────────────────────────
  /*
   * `institution.update_all` is new. HQ could already update the row — the
   * policy accepted `institution.suspend`, which has no column restriction —
   * but an audit trail that records a details correction as "held
   * institution.suspend" tells a reader nothing about what happened.
   */
  const adminEditsOther = await asAdmin
    .from('institutions')
    .update({ name: 'Renamed by the wrong tenant' })
    .eq('id', other.institutionId)
    .select('id')
  check(
    'an institution administrator cannot rename another institution',
    (adminEditsOther.data ?? []).length === 0,
    adminEditsOther.error?.code ?? `${(adminEditsOther.data ?? []).length} row(s) renamed`,
  )

  const adminEditsOwnStatus = await asAdmin
    .from('institutions')
    .update({ status: 'SUSPENDED' })
    .eq('id', primary.institutionId)
    .select('id, status')
    .maybeSingle()
  check(
    'nor change its own standing in the federation',
    adminEditsOwnStatus.data?.status !== 'SUSPENDED',
    adminEditsOwnStatus.error?.code ?? `status is now ${adminEditsOwnStatus.data?.status}`,
  )

  /*
   * The in-tenant teacher, signed in. Needed by the support checks below and by
   * the subject picker further down.
   */
  const asTeacher = createClient(url!, anonKey, { auth: { persistSession: false } })
  const teacherSignIn = await asTeacher.auth.signInWithPassword({
    email: insideEmail,
    password: insidePassword,
  })

  // ── Support tickets ───────────────────────────────────────────────────────
  /*
   * The claim this feature rests on is that an institution's administrators
   * cannot read their own members' tickets. Without it, a student reporting a
   * problem with their institution is reporting it to the people they are
   * reporting on — so it is checked from both directions here, with the
   * administrator's own credentials.
   */
  const teacherTicket = await asTeacher
    .from('support_tickets')
    .insert({
      institution_id: primary.institutionId,
      raised_by: insideId,
      raised_as: 'TEACHER',
      subject: 'A concern about how this institution records marks',
      body: 'Raised by a teacher, and their own administrators must not be able to read it.',
      category: 'COMPLAINT',
      priority: 'HIGH',
    })
    .select('id, reference, status')
    .maybeSingle()

  check(
    'a teacher can raise a ticket to HQ',
    !teacherTicket.error && Boolean(teacherTicket.data?.reference),
    teacherTicket.error?.message ?? `reference ${teacherTicket.data?.reference}`,
  )

  const teacherReadsOwn = await asTeacher
    .from('support_tickets')
    .select('id')
    .eq('id', teacherTicket.data!.id)
  check('and read it back', (teacherReadsOwn.data ?? []).length === 1)

  const adminReadsIt = await asAdmin
    .from('support_tickets')
    .select('id, subject')
    .eq('id', teacherTicket.data!.id)
  check(
    'their own institution’s administrator cannot read it',
    (adminReadsIt.data ?? []).length === 0,
    `${(adminReadsIt.data ?? []).length} row(s) visible`,
  )

  const adminReadsAny = await asAdmin.from('support_tickets').select('id')
  check(
    'nor any ticket they did not raise themselves',
    (adminReadsAny.data ?? []).length === 0,
    `${(adminReadsAny.data ?? []).length} row(s) visible`,
  )

  const forgedRaiser = await asTeacher.from('support_tickets').insert({
    institution_id: primary.institutionId,
    raised_by: primary.userId,
    raised_as: 'INSTITUTION_ADMIN',
    subject: 'Raised in somebody else’s name',
    body: 'The raiser column must come from the session, not the request body.',
    category: 'OTHER',
  })
  check(
    'a ticket cannot be raised in another person’s name',
    Boolean(forgedRaiser.error),
    forgedRaiser.error?.code ?? 'the insert was accepted',
  )

  const selfTriage = await asTeacher
    .from('support_tickets')
    .update({ priority: 'URGENT' })
    .eq('id', teacherTicket.data!.id)
    .select('id')
  check(
    'the raiser cannot re-prioritise their own ticket after HQ triage',
    Boolean(selfTriage.error),
    selfTriage.error?.code ?? `${(selfTriage.data ?? []).length} row(s) changed`,
  )

  const rewriteReport = await asTeacher
    .from('support_tickets')
    .update({ body: 'Something entirely different from what was reported.' })
    .eq('id', teacherTicket.data!.id)
    .select('id')
  check(
    'nor rewrite what they originally reported',
    Boolean(rewriteReport.error),
    rewriteReport.error?.code ?? `${(rewriteReport.data ?? []).length} row(s) rewritten`,
  )

  const closeOwn = await asTeacher
    .from('support_tickets')
    .update({ status: 'CLOSED' })
    .eq('id', teacherTicket.data!.id)
    .select('id, status, closed_at')
    .maybeSingle()
  check(
    'but may close it, and the timestamp follows the status',
    !closeOwn.error && closeOwn.data?.status === 'CLOSED' && Boolean(closeOwn.data?.closed_at),
    closeOwn.error?.message ?? `status ${closeOwn.data?.status}`,
  )

  /* Internal notes are a row the raiser's policy does not return. */
  const { data: noteTicket } = await admin
    .from('support_tickets')
    .insert({
      institution_id: primary.institutionId,
      raised_by: insideId,
      raised_as: 'TEACHER',
      subject: 'A second ticket, for the internal-note check',
      body: 'HQ notes on this ticket must not be readable by the person who raised it.',
      category: 'OTHER',
    })
    .select('id')
    .single()

  const { data: hqPerson } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'HQ_ADMIN')
    .limit(1)
    .maybeSingle()

  const seeded = await admin.from('support_ticket_messages').insert([
    { ticket_id: noteTicket!.id, author_id: hqPerson!.id, body: 'Visible reply to the teacher.', is_internal: false },
    { ticket_id: noteTicket!.id, author_id: hqPerson!.id, body: 'Internal: check this against the audit log first.', is_internal: true },
  ])
  check('two HQ messages are seeded on that ticket', !seeded.error, seeded.error?.message)

  const teacherSeesMessages = await asTeacher
    .from('support_ticket_messages')
    .select('body, is_internal')
    .eq('ticket_id', noteTicket!.id)

  check(
    'the raiser sees HQ’s reply but not its internal note',
    !teacherSeesMessages.error &&
      (teacherSeesMessages.data ?? []).length === 1 &&
      (teacherSeesMessages.data ?? [])[0]?.is_internal === false,
    teacherSeesMessages.error
      ? `refused: ${teacherSeesMessages.error.message}`
      : `${(teacherSeesMessages.data ?? []).length} of 2 message(s) visible`,
  )

  const teacherWritesInternal = await asTeacher.from('support_ticket_messages').insert({
    ticket_id: noteTicket!.id,
    author_id: insideId,
    body: 'Trying to write an internal note.',
    is_internal: true,
  })
  check(
    'and cannot write one',
    Boolean(teacherWritesInternal.error),
    teacherWritesInternal.error?.code ?? 'the insert was accepted',
  )

  // ── Tickets addressed to the institution ──────────────────────────────────
  /*
   * The routing is the whole design. A ticket addressed to the institution is
   * the institution's to resolve; one addressed to HQ stays invisible to them.
   * Both directions are checked, because widening the first without preserving
   * the second is exactly the mistake that would destroy the guarantee migration
   * 046 established.
   */
  const toInstitution = await asTeacher
    .from('support_tickets')
    .insert({
      institution_id: primary.institutionId,
      raised_by: insideId,
      raised_as: 'TEACHER',
      raised_to: 'INSTITUTION',
      subject: 'My class list is missing three students',
      body: 'Addressed to the institution, because enrolment is theirs to fix rather than HQ’s.',
      category: 'ACADEMIC',
      priority: 'NORMAL',
    })
    .select('id, reference')
    .maybeSingle()

  check(
    'a teacher can raise an issue to their own institution',
    !toInstitution.error && Boolean(toInstitution.data?.reference),
    toInstitution.error?.message,
  )

  const adminSeesInstitutionTicket = await asAdmin
    .from('support_tickets')
    .select('id, subject')
    .eq('id', toInstitution.data!.id)
  check(
    'the institution’s administrator can read it',
    (adminSeesInstitutionTicket.data ?? []).length === 1,
    `${(adminSeesInstitutionTicket.data ?? []).length} row(s)`,
  )

  /*
   * The load-bearing one. `teacherTicket` above was addressed to HQ, and the
   * administrator must still not see it now that they can see institution
   * tickets from the same person in the same tenant.
   */
  const adminStillBlindToHq = await asAdmin
    .from('support_tickets')
    .select('id')
    .eq('id', teacherTicket.data!.id)
  check(
    'but still cannot read that person’s ticket to HQ',
    (adminStillBlindToHq.data ?? []).length === 0,
    `${(adminStillBlindToHq.data ?? []).length} row(s) visible`,
  )

  const adminTriages = await asAdmin
    .from('support_tickets')
    .update({ status: 'IN_PROGRESS', priority: 'HIGH' })
    .eq('id', toInstitution.data!.id)
    .select('id, status, priority')
    .maybeSingle()
  check(
    'and may triage what was addressed to them',
    !adminTriages.error && adminTriages.data?.status === 'IN_PROGRESS',
    adminTriages.error?.message ?? `status ${adminTriages.data?.status}`,
  )

  const adminReplies = await asAdmin
    .from('support_ticket_messages')
    .insert({
      ticket_id: toInstitution.data!.id,
      author_id: primary.userId,
      body: 'Enrolment corrected — the three students are on your list now.',
      is_internal: false,
    })
    .select('id')
    .maybeSingle()
  check('and reply to it', !adminReplies.error, adminReplies.error?.message)

  const otherAdminSees = await createClient(url!, anonKey, { auth: { persistSession: false } })
  const otherSignIn = await otherAdminSees.auth.signInWithPassword({
    email: other.email,
    password: other.password,
  })
  if (otherSignIn.error) {
    check('a second institution’s administrator can sign in', false, otherSignIn.error.message)
  } else {
    const crossTenant = await otherAdminSees
      .from('support_tickets')
      .select('id')
      .eq('id', toInstitution.data!.id)
    check(
      'another institution’s administrator sees nothing of it',
      (crossTenant.data ?? []).length === 0,
      `${(crossTenant.data ?? []).length} row(s) visible`,
    )
  }

  const adminAudienceMove = await asAdmin
    .from('support_tickets')
    .update({ raised_to: 'HQ' })
    .eq('id', toInstitution.data!.id)
    .select('id')
  check(
    'a ticket cannot be moved to a different audience after the fact',
    Boolean(adminAudienceMove.error),
    adminAudienceMove.error?.code ?? `${(adminAudienceMove.data ?? []).length} row(s) moved`,
  )

  // ── Notices ───────────────────────────────────────────────────────────────
  /*
   * The audience column is the whole feature, so every combination is checked
   * from a real teacher's session rather than reasoned about: addressed to
   * everyone, to teachers, to students, and still a draft.
   */
  const notices: Record<string, string> = {}
  for (const [key, audience, published] of [
    ['everyone', 'EVERYONE', true],
    ['teachers', 'TEACHERS', true],
    ['students', 'STUDENTS', true],
    ['draft', 'EVERYONE', false],
  ] as const) {
    const { data, error } = await asAdmin
      .from('institution_notices')
      .insert({
        institution_id: primary.institutionId,
        author_id: primary.userId,
        title: `ZZ notice for ${key}`,
        body: `Addressed to ${audience}, published=${published}.`,
        audience,
        is_published: published,
      })
      .select('id, published_at')
      .maybeSingle()

    if (error) {
      check(`a notice for ${key} can be posted`, false, error.message)
    } else {
      notices[key] = data!.id
      // `published_at` is stamped by a trigger, never accepted from the caller.
      check(
        `a notice for ${key} can be posted`,
        published ? Boolean(data!.published_at) : data!.published_at === null,
        published ? `stamped ${data!.published_at}` : 'draft, unstamped',
      )
    }
  }

  const teacherBoard = await asTeacher
    .from('institution_notices')
    .select('id, title, audience')
    .in('id', Object.values(notices))

  const teacherSees = new Set((teacherBoard.data ?? []).map((row) => row.id))
  check(
    'a teacher sees the notice addressed to everyone',
    teacherSees.has(notices.everyone),
  )
  check('and the one addressed to teachers', teacherSees.has(notices.teachers))
  check(
    'but not the one addressed to students',
    !teacherSees.has(notices.students),
    teacherSees.has(notices.students) ? 'the students-only notice leaked' : '',
  )
  check(
    'and not a draft',
    !teacherSees.has(notices.draft),
    teacherSees.has(notices.draft) ? 'an unpublished notice leaked' : '',
  )

  const teacherWrites = await asTeacher.from('institution_notices').insert({
    institution_id: primary.institutionId,
    author_id: insideId,
    title: 'Written by a teacher',
    body: 'Only the office posts notices.',
    audience: 'EVERYONE',
    is_published: true,
  })
  check(
    'a teacher cannot post a notice',
    Boolean(teacherWrites.error),
    teacherWrites.error?.code ?? 'the insert was accepted',
  )

  const teacherEdits = await asTeacher
    .from('institution_notices')
    .update({ title: 'Rewritten by a teacher' })
    .eq('id', notices.everyone)
    .select('id')
  check(
    'nor edit one',
    Boolean(teacherEdits.error) || (teacherEdits.data ?? []).length === 0,
    teacherEdits.error?.code ?? `${(teacherEdits.data ?? []).length} row(s) rewritten`,
  )

  /* An expired notice comes off the board without anybody unpublishing it. */
  await asAdmin
    .from('institution_notices')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', notices.everyone)

  const afterExpiry = await asTeacher
    .from('institution_notices')
    .select('id')
    .eq('id', notices.everyone)
  check(
    'an expired notice leaves the board on its own',
    (afterExpiry.data ?? []).length === 0,
    `${(afterExpiry.data ?? []).length} row(s) still visible`,
  )

  const otherTenantBoard = await otherAdminSees
    .from('institution_notices')
    .select('id')
    .in('id', Object.values(notices))
  check(
    'another institution sees none of this board',
    (otherTenantBoard.data ?? []).length === 0,
    `${(otherTenantBoard.data ?? []).length} row(s) visible`,
  )

  // ── Subjects ──────────────────────────────────────────────────────────────
  /*
   * A teacher's "Subject" dropdown reads this table. Until the institution can
   * create a subject it offers only "Not set" — which is not an optional field,
   * it is a broken one. The table, its RLS and every read already existed; what
   * was missing was any way to write to it.
   */
  const { data: ownSubject, error: ownSubjectError } = await asAdmin
    .from('subjects')
    .insert({
      institution_id: primary.institutionId,
      department_id: ownDepartment?.id ?? null,
      code: `SUB${suffix.slice(0, 4)}`,
      name: 'Aerodynamics',
    })
    .select('id')
    .single()

  check(
    'the administrator can create a subject',
    !ownSubjectError,
    ownSubjectError?.message,
  )

  const duplicateCode = await asAdmin.from('subjects').insert({
    institution_id: primary.institutionId,
    code: `SUB${suffix.slice(0, 4)}`,
    name: 'A different subject, same code',
  })
  check(
    'a subject code is unique within the institution',
    duplicateCode.error?.code === '23505',
    duplicateCode.error?.code ?? 'the duplicate was accepted',
  )

  const foreignSubject = await asAdmin.from('subjects').insert({
    institution_id: other.institutionId,
    code: `EVL${suffix.slice(0, 4)}`,
    name: 'Should not exist',
  })
  check(
    'the administrator cannot create a subject in another institution',
    Boolean(foreignSubject.error),
    foreignSubject.error?.code ?? 'the insert was accepted',
  )

  /*
   * The teacher is the one who has to see it, and they must be inside the same
   * institution — the `gamma` fixture above has its own, which would prove
   * tenant isolation rather than that the picker fills.
   */
  if (teacherSignIn.error) {
    check('a teacher can sign in to read subjects', false, teacherSignIn.error.message)
  } else {
    const teacherSees = await asTeacher
      .from('subjects')
      .select('id, name')
      .eq('id', ownSubject!.id)
    check(
      'a teacher of that institution sees the subject in their picker',
      (teacherSees.data ?? []).length === 1,
      `${(teacherSees.data ?? []).length} row(s)`,
    )

    const teacherWrites = await asTeacher.from('subjects').insert({
      institution_id: primary.institutionId,
      code: `TCH${suffix.slice(0, 4)}`,
      name: 'Written by a teacher',
    })
    check(
      'but cannot create one — that is the institution’s to decide',
      Boolean(teacherWrites.error),
      teacherWrites.error?.code ?? 'the insert was accepted',
    )
  }

  const foreignTeachers = await asAdmin
    .from('teachers')
    .select('profile_id')
    .eq('institution_id', other.institutionId)

  check(
    'another institution’s teachers are invisible',
    (foreignTeachers.data ?? []).length === 0,
    `${(foreignTeachers.data ?? []).length} rows`,
  )

  const foreignProfiles = await asAdmin
    .from('profiles')
    .select('id')
    .eq('institution_id', other.institutionId)

  check(
    'another institution’s people are invisible',
    (foreignProfiles.data ?? []).length === 0,
    `${(foreignProfiles.data ?? []).length} rows`,
  )

  /*
   * The composite tenant key, tested rather than trusted: a teacher row whose
   * `institution_id` disagrees with the profile it points at has no valid
   * parent, so the reference cannot land.
   */
  const mismatched = await admin.from('teachers').insert({
    profile_id: primary.userId,
    institution_id: other.institutionId,
    employee_id: `X-${suffix}`,
  })

  check(
    'a cross-tenant member row is refused even to the service role',
    Boolean(mismatched.error),
    mismatched.error?.code,
  )

  // ── A department created in the app appears in the app ────────────────────
  if (ownDepartment) {
    const landed = await walk(`${appUrl}/institution/academics`, primary.jar)
    const body = await landed.response.text()
    check(
      'a department created by the administrator appears on the academics page',
      body.includes('Aerospace Engineering'),
      body.includes('No departments') ? 'page rendered the empty state' : `HTTP ${landed.response.status}`,
    )
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  for (const userId of created.users) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (error) console.log(`      cleanup: user ${userId} — ${error.message}`)
  }
  for (const institutionId of created.institutions) {
    const { error } = await admin.from('institutions').delete().eq('id', institutionId)
    if (error) console.log(`      cleanup: institution ${institutionId} — ${error.message}`)
  }

  const { data: leftovers } = await admin
    .from('institutions')
    .select('id')
    .in('id', created.institutions)

  check('fixtures removed', (leftovers ?? []).length === 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
