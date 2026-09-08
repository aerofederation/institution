/**
 * End-to-end verification of teaching content and its boundaries.
 *
 *     npm run verify:teaching
 *
 * Builds a real institution with two teachers and two students in different
 * sections, then signs in as each of them — with their own credentials, through
 * PostgREST, exactly as the application does — and probes what they can reach.
 *
 * The claims worth testing are the negative ones:
 *
 *   * teacher A cannot see, edit or delete teacher B's material, assignments,
 *     papers, submissions or marks;
 *   * a student sees only what was published to their own class and section;
 *   * a student cannot read `assessment_options` at all, because that table is
 *     the answer key;
 *   * a student cannot write their own attempt row or their own score;
 *   * a student cannot see another student's submission or result.
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


const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

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

/** Signs a browser session in by redeeming a real activation link. */
async function browserSession(email: string, landing: string) {
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const token = recovery.data?.properties?.hashed_token
  if (!token) throw new Error(`could not mint a link: ${recovery.error?.message}`)

  const jar = makeJar()
  await walk(`${appUrl}/auth/confirm?token_hash=${token}&type=recovery&next=${landing}`, jar)
  return jar
}

const suffix = randomBytes(4).toString('hex')
const created = { institutions: [] as string[], users: [] as string[] }

/** Creates an ACTIVE account of the given role and returns a signed-in client. */
async function makeUser(
  institutionId: string,
  role: 'TEACHER' | 'STUDENT',
  label: string,
): Promise<{ id: string; email: string; client: SupabaseClient }> {
  const email = `zzt.${label}.${suffix}@example.test`
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

  return { id, email, client }
}

async function main() {
  console.log(`\nVerifying teaching content isolation on ${new URL(url!).host}\n`)

  // ── A tenant with structure ───────────────────────────────────────────────
  const { data: approver } = await admin
    .from('profiles')
    .select('id')
    .eq('role', 'HQ_ADMIN')
    .limit(1)
    .maybeSingle()

  const { data: institution, error: institutionError } = await admin
    .from('institutions')
    .insert({
      slug: `zzt-${suffix}`,
      name: `ZZ Teaching Institute ${suffix}`,
      institution_type: 'UNIVERSITY',
      category: 'PRIVATE',
      official_email: `office.${suffix}@example.test`,
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
    .insert({
      institution_id: tenant,
      academic_year_id: year!.id,
      name: `First Year ${suffix}`,
    })
    .select('id')
    .single()

  const { data: sectionA } = await admin
    .from('sections')
    .insert({ institution_id: tenant, class_id: klass!.id, name: 'A' })
    .select('id')
    .single()

  const { data: sectionB } = await admin
    .from('sections')
    .insert({ institution_id: tenant, class_id: klass!.id, name: 'B' })
    .select('id')
    .single()

  check('academic structure created', Boolean(year && klass && sectionA && sectionB))

  // ── Two teachers, two students ────────────────────────────────────────────
  const teacherA = await makeUser(tenant, 'TEACHER', 'teacher-a')
  const teacherB = await makeUser(tenant, 'TEACHER', 'teacher-b')
  const studentA = await makeUser(tenant, 'STUDENT', 'student-a')
  const studentB = await makeUser(tenant, 'STUDENT', 'student-b')

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

  for (const [person, code, section] of [
    [studentA, 'SA', sectionA!.id],
    [studentB, 'SB', sectionB!.id],
  ] as const) {
    await admin.from('students').insert({
      profile_id: person.id,
      institution_id: tenant,
      student_code: `${code}-${suffix}`,
      class_id: klass!.id,
      section_id: section,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
    await admin.from('student_enrollments').insert({
      institution_id: tenant,
      student_id: person.id,
      class_id: klass!.id,
      section_id: section,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
  }

  // Both teachers teach the same class — the hardest case for isolation.
  for (const person of [teacherA, teacherB]) {
    await admin.from('teacher_class_assignments').insert({
      institution_id: tenant,
      teacher_id: person.id,
      class_id: klass!.id,
      academic_year_id: year!.id,
      status: 'ACTIVE',
    })
  }

  check('two teachers and two students provisioned', true)

  // ── Publishing ────────────────────────────────────────────────────────────
  const { data: materialA, error: materialError } = await teacherA.client
    .from('materials')
    .insert({
      institution_id: tenant,
      teacher_id: teacherA.id,
      class_id: klass!.id,
      academic_year_id: year!.id,
      title: 'Teacher A notes',
      material_type: 'NOTE',
      description: 'Propulsion basics.',
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  check('a teacher can publish to a class they teach', !materialError, materialError?.message)

  const forged = await teacherA.client.from('materials').insert({
    institution_id: tenant,
    // Authorship claimed for somebody else.
    teacher_id: teacherB.id,
    class_id: klass!.id,
    academic_year_id: year!.id,
    title: 'Forged',
    material_type: 'NOTE',
    description: 'Should not exist.',
  })

  check(
    'a teacher cannot publish under another teacher’s name',
    Boolean(forged.error),
    forged.error?.code,
  )

  // ── A document material, before and after its file ────────────────────────
  /*
   * `materials_payload_coherent` used to require `storage_path` on every
   * DOCUMENT row from the moment it was inserted. The path contains the row's
   * own id, so the upload can only happen after the insert — which the
   * constraint forbade until after the upload. Creating a study material of
   * type "File upload" therefore failed every time, and no DOCUMENT row had
   * ever been created.
   *
   * Migration 044 moved the requirement onto publication, which is where it
   * belongs: a draft may be waiting for its file, a published one may not be.
   * Both halves are checked here, because relaxing the wrong half would put a
   * document with nothing behind it in front of a class.
   */
  const { data: draftDocument, error: draftError } = await teacherA.client
    .from('materials')
    .insert({
      institution_id: tenant,
      teacher_id: teacherA.id,
      class_id: klass!.id,
      academic_year_id: year!.id,
      title: 'Handout awaiting its file',
      material_type: 'DOCUMENT',
      is_published: false,
    })
    .select('id')
    .single()

  check(
    'a document material can be created as a draft, before its file exists',
    !draftError,
    draftError?.message,
  )

  const publishedEmpty = await teacherA.client
    .from('materials')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', draftDocument!.id)
    .select('id')
  check(
    'but it cannot be published while it has no file',
    publishedEmpty.error?.code === '23514',
    publishedEmpty.error?.code ?? 'the class would have seen an empty document',
  )

  const withFile = await teacherA.client
    .from('materials')
    .update({
      storage_path: `${tenant}/materials/${draftDocument!.id}/fixture.pdf`,
      file_name: 'fixture.pdf',
      mime_type: 'application/pdf',
      file_size: 1024,
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .eq('id', draftDocument!.id)
    .select('id, is_published')
    .maybeSingle()
  check(
    'once the file is attached it publishes',
    !withFile.error && withFile.data?.is_published === true,
    withFile.error?.message,
  )

  // ── Teacher-to-teacher isolation ──────────────────────────────────────────
  const bSeesA = await teacherB.client.from('materials').select('id').eq('id', materialA!.id)
  check(
    'teacher B cannot see teacher A’s material',
    (bSeesA.data ?? []).length === 0,
    `${(bSeesA.data ?? []).length} rows`,
  )

  const bEditsA = await teacherB.client
    .from('materials')
    .update({ title: 'Hijacked' })
    .eq('id', materialA!.id)
    .select('id')
  check('teacher B cannot edit teacher A’s material', (bEditsA.data ?? []).length === 0)

  const bDeletesA = await teacherB.client.from('materials').delete().eq('id', materialA!.id).select('id')
  check('teacher B cannot delete teacher A’s material', (bDeletesA.data ?? []).length === 0)

  // ── A paper, and its answer key ───────────────────────────────────────────
  const { data: paper } = await teacherA.client
    .from('assessments')
    .insert({
      institution_id: tenant,
      teacher_id: teacherA.id,
      class_id: klass!.id,
      section_id: sectionA!.id,
      academic_year_id: year!.id,
      kind: 'QUIZ',
      title: 'Section A quiz',
      max_attempts: 2,
    })
    .select('id')
    .single()

  const { data: question } = await teacherA.client
    .from('assessment_questions')
    .insert({
      institution_id: tenant,
      assessment_id: paper!.id,
      position: 0,
      question_type: 'SINGLE_CHOICE',
      prompt: 'What provides thrust?',
      marks: 2,
    })
    .select('id')
    .single()

  const { data: options } = await teacherA.client
    .from('assessment_options')
    .insert([
      { institution_id: tenant, question_id: question!.id, position: 0, label: 'The engine', is_correct: true },
      { institution_id: tenant, question_id: question!.id, position: 1, label: 'The wing', is_correct: false },
    ])
    .select('id, is_correct')

  check('a teacher can author questions and an answer key', (options ?? []).length === 2)

  const bReadsKey = await teacherB.client
    .from('assessment_options')
    .select('id, is_correct')
    .eq('question_id', question!.id)
  check(
    'teacher B cannot read teacher A’s answer key',
    (bReadsKey.data ?? []).length === 0,
    `${(bReadsKey.data ?? []).length} rows`,
  )

  await teacherA.client
    .from('assessments')
    .update({ is_published: true, published_at: new Date().toISOString() })
    .eq('id', paper!.id)

  // ── The student boundary ──────────────────────────────────────────────────
  const aSeesMaterial = await studentA.client.from('materials').select('id').eq('id', materialA!.id)
  check(
    'a student sees material published to their class',
    (aSeesMaterial.data ?? []).length === 1,
    `${(aSeesMaterial.data ?? []).length} rows`,
  )

  const aReadsKey = await studentA.client.from('assessment_options').select('id, is_correct')
  check(
    'a student cannot read the answer key table at all',
    (aReadsKey.data ?? []).length === 0,
    aReadsKey.error ? `refused (${aReadsKey.error.code})` : '0 rows',
  )

  const aReadsQuestions = await studentA.client.from('assessment_questions').select('id')
  check(
    'a student cannot read the question table directly',
    (aReadsQuestions.data ?? []).length === 0,
  )

  // Section B student must not receive a paper addressed to section A.
  const bSeesPaper = await studentB.client.from('assessments').select('id').eq('id', paper!.id)
  check(
    'a student in another section does not receive the paper',
    (bSeesPaper.data ?? []).length === 0,
    `${(bSeesPaper.data ?? []).length} rows`,
  )

  const aSeesPaper = await studentA.client.from('assessments').select('id').eq('id', paper!.id)
  check('the addressed student does receive the paper', (aSeesPaper.data ?? []).length === 1)

  // ── Sitting it ────────────────────────────────────────────────────────────
  const started = await studentA.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  const attemptId = started.data as unknown as string
  check('a student can start an attempt', Boolean(attemptId), started.error?.message)

  const wrongStart = await studentB.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  check(
    'a student in another section cannot start an attempt',
    Boolean(wrongStart.error),
    wrongStart.error?.code,
  )

  const paperView = await studentA.client.rpc('student_get_paper', {
    target_attempt_id: attemptId,
  })
  const served = JSON.stringify(paperView.data ?? {})
  check(
    'the paper served to a student contains no answer key',
    !served.includes('is_correct'),
    served.includes('is_correct') ? 'LEAKED is_correct' : 'no is_correct field',
  )

  const forgedScore = await studentA.client
    .from('assessment_attempts')
    .update({ score: 999 })
    .eq('id', attemptId)
    .select('id')
  check(
    'a student cannot write their own score',
    (forgedScore.data ?? []).length === 0,
    forgedScore.error ? `refused (${forgedScore.error.code})` : '0 rows',
  )

  const forgedAttempt = await studentA.client.from('assessment_attempts').insert({
    institution_id: tenant,
    assessment_id: paper!.id,
    student_id: studentA.id,
    attempt_no: 9,
    score: 999,
  })
  check(
    'a student cannot insert an attempt row directly',
    Boolean(forgedAttempt.error),
    forgedAttempt.error?.code,
  )

  const correctOption = (options ?? []).find((option) => option.is_correct)!
  await studentA.client.rpc('student_answer_question', {
    target_attempt_id: attemptId,
    target_question_id: question!.id,
    option_ids: [correctOption.id],
    answer_text: null,
  })

  const submitted = await studentA.client.rpc('student_submit_attempt', {
    target_attempt_id: attemptId,
  })
  const outcome = submitted.data as unknown as { score: number; max_score: number }
  check(
    'the database scores the attempt',
    Number(outcome?.score) === 2 && Number(outcome?.max_score) === 2,
    submitted.error ? submitted.error.message : `${outcome?.score} / ${outcome?.max_score}`,
  )

  // ── Marks stay between the student and the teacher who set the work ───────
  const bSeesAttempt = await studentB.client
    .from('assessment_attempts')
    .select('id')
    .eq('id', attemptId)
  check('a student cannot see another student’s attempt', (bSeesAttempt.data ?? []).length === 0)

  const teacherBSeesAttempt = await teacherB.client
    .from('assessment_attempts')
    .select('id')
    .eq('id', attemptId)
  check(
    'a teacher cannot see attempts on another teacher’s paper',
    (teacherBSeesAttempt.data ?? []).length === 0,
  )

  const teacherASeesAttempt = await teacherA.client
    .from('assessment_attempts')
    .select('id, score')
    .eq('id', attemptId)
  check(
    'the owning teacher sees the attempt and its score',
    (teacherASeesAttempt.data ?? []).length === 1,
  )

  /*
   * ── Assignments and submissions ──────────────────────────────────────────
   *
   * No page reaches these tables any more: an assignment is an assessment of
   * kind ASSIGNMENT, built in the one assessment builder, and the separate
   * assignments surface was removed. The tables and their policies are still
   * in the database holding real submissions, so they are still checked here.
   * A table nothing renders is exactly the one whose RLS quietly rots.
   */
  const { data: assignment } = await teacherA.client
    .from('assignments')
    .insert({
      institution_id: tenant,
      teacher_id: teacherA.id,
      class_id: klass!.id,
      academic_year_id: year!.id,
      title: 'Essay on airfoils',
      max_marks: 20,
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const submission = await studentA.client
    .from('assignment_submissions')
    .insert({
      institution_id: tenant,
      assignment_id: assignment!.id,
      student_id: studentA.id,
      response_text: 'An airfoil generates lift.',
      status: 'SUBMITTED',
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  check('a student can hand in work', !submission.error, submission.error?.message)

  const impersonated = await studentB.client.from('assignment_submissions').insert({
    institution_id: tenant,
    assignment_id: assignment!.id,
    student_id: studentA.id,
    response_text: 'Submitted on somebody else’s behalf.',
    status: 'SUBMITTED',
    submitted_at: new Date().toISOString(),
  })
  check(
    'a student cannot submit as another student',
    Boolean(impersonated.error),
    impersonated.error?.code,
  )

  const bSeesSubmission = await studentB.client
    .from('assignment_submissions')
    .select('id')
    .eq('id', submission.data!.id)
  check(
    'a student cannot see another student’s submission',
    (bSeesSubmission.data ?? []).length === 0,
  )

  const teacherBSeesSubmission = await teacherB.client
    .from('assignment_submissions')
    .select('id')
    .eq('id', submission.data!.id)
  check(
    'a teacher cannot see submissions for another teacher’s assignment',
    (teacherBSeesSubmission.data ?? []).length === 0,
  )

  const marked = await teacherA.client
    .from('assignment_submissions')
    .update({
      marks: 17,
      feedback: 'Good.',
      status: 'GRADED',
      graded_by: teacherA.id,
      graded_at: new Date().toISOString(),
    })
    .eq('id', submission.data!.id)
    .select('marks')
  check('the owning teacher can mark it', (marked.data ?? []).length === 1, marked.error?.message)

  const selfMarked = await studentA.client
    .from('assignment_submissions')
    .update({ marks: 20 })
    .eq('id', submission.data!.id)
    .select('marks')
  check(
    'a student cannot change their own mark',
    (selfMarked.data ?? [])[0]?.marks !== 20,
    `marks now ${(selfMarked.data ?? [])[0]?.marks ?? 'unchanged'}`,
  )

  // ── Every page actually renders ───────────────────────────────────────────
  /*
   * Added because the workspace shell was refactored to take its navigation as
   * a prop, and a nav item holds a Lucide icon — a function. Passing it from a
   * Server Component to a Client Component made every page 500, and typecheck,
   * lint and `next build` all passed. Only a request finds that.
   */
  const reachable = await fetch(appUrl, { redirect: 'manual' }).then(
    () => true,
    () => false,
  )

  // ── AI study aids ─────────────────────────────────────────────────────────
  /*
   * A study aid is shared by everyone the material was published to, which is
   * the cheap choice — one model call per material rather than one per student.
   * Sharing is only safe if "everyone" is exactly the set who can read the
   * material, so that is what these check, against a material addressed to
   * section A while student B sits in section B.
   */
  const { data: sectionMaterial } = await teacherA.client
    .from('materials')
    .insert({
      institution_id: tenant,
      teacher_id: teacherA.id,
      class_id: klass!.id,
      section_id: sectionA!.id,
      academic_year_id: year!.id,
      title: 'Section A only notes',
      material_type: 'NOTE',
      description: 'Thrust comes from accelerating mass rearwards.',
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  const bSeesSectionMaterial = await studentB.client
    .from('materials')
    .select('id')
    .eq('id', sectionMaterial!.id)
  check(
    'the section-A material is not visible to the section-B student',
    (bSeesSectionMaterial.data ?? []).length === 0,
  )

  const aid = await studentA.client
    .from('material_study_aids')
    .insert({
      institution_id: tenant,
      material_id: sectionMaterial!.id,
      summary: 'Thrust is produced by accelerating mass rearwards.',
      key_points: ['Newton’s third law', 'Mass flow rate matters'],
      questions: [{ question: 'What produces thrust?', answer: 'Accelerating mass rearwards.', difficulty: 'EASY' }],
      source_kind: 'NOTE',
      model: 'test-model',
      requested_by: studentA.id,
    })
    .select('id')
    .maybeSingle()

  check('a student can create a study aid for material they receive', !aid.error, aid.error?.message)

  const aReadsAid = await studentA.client
    .from('material_study_aids')
    .select('id, summary')
    .eq('material_id', sectionMaterial!.id)
  check('that student reads it back', (aReadsAid.data ?? []).length === 1)

  const bReadsAid = await studentB.client
    .from('material_study_aids')
    .select('id')
    .eq('material_id', sectionMaterial!.id)
  check(
    'a student who cannot read the material cannot read its study aid',
    (bReadsAid.data ?? []).length === 0,
    `${(bReadsAid.data ?? []).length} row(s) visible`,
  )

  const teacherBReadsAid = await teacherB.client
    .from('material_study_aids')
    .select('id')
    .eq('material_id', sectionMaterial!.id)
  check(
    'another teacher cannot read it either',
    (teacherBReadsAid.data ?? []).length === 0,
    `${(teacherBReadsAid.data ?? []).length} row(s) visible`,
  )

  const bWritesAid = await studentB.client.from('material_study_aids').insert({
    institution_id: tenant,
    material_id: sectionMaterial!.id,
    summary: 'Written by somebody who cannot see the material.',
    source_kind: 'NOTE',
    model: 'test-model',
    requested_by: studentB.id,
  })
  check(
    'nor create one for it',
    Boolean(bWritesAid.error),
    bWritesAid.error?.code ?? 'the insert was accepted',
  )

  const forgedRequester = await studentA.client.from('material_study_aids').insert({
    institution_id: tenant,
    material_id: materialA!.id,
    summary: 'Attributed to somebody else.',
    source_kind: 'NOTE',
    model: 'test-model',
    requested_by: studentB.id,
  })
  check(
    'a study aid cannot be attributed to another student',
    Boolean(forgedRequester.error),
    forgedRequester.error?.code ?? 'the insert was accepted',
  )

  const secondAid = await studentB.client.from('material_study_aids').insert({
    institution_id: tenant,
    material_id: materialA!.id,
    summary: 'A second aid for the same material.',
    source_kind: 'NOTE',
    model: 'test-model',
    requested_by: studentB.id,
  })
  const firstForMaterialA = await studentA.client.from('material_study_aids').insert({
    institution_id: tenant,
    material_id: materialA!.id,
    summary: 'The first aid for the class-wide material.',
    source_kind: 'NOTE',
    model: 'test-model',
    requested_by: studentA.id,
  })
  check(
    'a class-wide material admits one aid, and the second is refused',
    !secondAid.error && firstForMaterialA.error?.code === '23505',
    secondAid.error?.message ?? firstForMaterialA.error?.code ?? 'both were accepted',
  )

  const editedAid = await studentA.client
    .from('material_study_aids')
    .update({ summary: 'Quietly rewritten.' })
    .eq('material_id', sectionMaterial!.id)
    .select('id')
  check(
    'a study aid cannot be edited by anybody',
    (editedAid.data ?? []).length === 0,
    editedAid.error?.code ?? `${(editedAid.data ?? []).length} row(s) rewritten`,
  )

  const studentDeletes = await studentA.client
    .from('material_study_aids')
    .delete()
    .eq('material_id', sectionMaterial!.id)
    .select('id')
  check(
    'a student cannot discard the aid their class is using',
    (studentDeletes.data ?? []).length === 0,
    `${(studentDeletes.data ?? []).length} row(s) deleted`,
  )

  const teacherDeletes = await teacherA.client
    .from('material_study_aids')
    .delete()
    .eq('material_id', sectionMaterial!.id)
    .select('id')
  check(
    'the owning teacher can, so it can be regenerated',
    (teacherDeletes.data ?? []).length === 1,
    teacherDeletes.error?.message,
  )

  // ── Notifications ─────────────────────────────────────────────────────────
  /*
   * A notice is addressed to one person. `notifications_select` is the only
   * read policy and it is `user_id = auth.uid()`, so the feed cannot widen —
   * but a feed is exactly the surface where a leak would be least noticed, so
   * it is checked rather than assumed.
   *
   * Insert needs `notification.broadcast`, which no student or teacher holds:
   * a class is told about a paper by `notifyClass`, which reads the recipients
   * under the teacher's own RLS and then inserts with the service role.
   */
  const { data: notice } = await admin
    .from('notifications')
    .insert({
      user_id: studentA.id,
      institution_id: tenant,
      category: 'EXAM',
      priority: 'NORMAL',
      title: 'Notification addressed to student A',
      body: 'Opens 04 Sep, 11:12. Closes 06 Sep, 11:12.',
      deep_link: '/student/assessments',
    })
    .select('id')
    .single()

  const aReadsOwn = await studentA.client
    .from('notifications')
    .select('id, title')
    .eq('id', notice!.id)
  check('a student reads their own notification', (aReadsOwn.data ?? []).length === 1)

  const bReadsA = await studentB.client
    .from('notifications')
    .select('id')
    .eq('id', notice!.id)
  check(
    'another student cannot read it',
    (bReadsA.data ?? []).length === 0,
    `${(bReadsA.data ?? []).length} row(s) visible`,
  )

  const teacherReadsA = await teacherA.client
    .from('notifications')
    .select('id')
    .eq('id', notice!.id)
  check('their teacher cannot read it either', (teacherReadsA.data ?? []).length === 0)

  const bMarksA = await studentB.client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notice!.id)
    .select('id')
  check(
    'another student cannot mark it read',
    (bMarksA.data ?? []).length === 0,
    bMarksA.error?.message ?? `${(bMarksA.data ?? []).length} row(s) updated`,
  )

  const aMarks = await studentA.client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notice!.id)
    .select('id, read_at')
    .maybeSingle()
  check(
    'the addressee can mark it read',
    !aMarks.error && Boolean(aMarks.data?.read_at),
    aMarks.error?.message,
  )

  const studentBroadcast = await studentA.client.from('notifications').insert({
    user_id: studentB.id,
    institution_id: tenant,
    category: 'EXAM',
    priority: 'NORMAL',
    title: 'Written by a student',
  })
  check(
    'a student cannot write a notification to anyone',
    Boolean(studentBroadcast.error),
    studentBroadcast.error?.code ?? 'the insert was accepted',
  )

  const teacherBroadcast = await teacherA.client.from('notifications').insert({
    user_id: studentA.id,
    institution_id: tenant,
    category: 'EXAM',
    priority: 'NORMAL',
    title: 'Written directly by a teacher',
  })
  check(
    'a teacher cannot write one directly either',
    Boolean(teacherBroadcast.error),
    teacherBroadcast.error?.code ?? 'the insert was accepted',
  )

  if (!reachable) {
    console.log(`SKIP  page rendering — ${appUrl} is not running`)
  } else {
    const sweeps: [label: string, email: string, pages: [string, string][]][] = [
      [
        'teacher',
        teacherA.email,
        [
          ['/teacher', 'My classes'],
          ['/teacher/classes', 'Set by your institution administrator'],
          ['/teacher/materials', 'Add material'],
          // The in-page reader, on a material that carries a file.
          [`/teacher/materials/${draftDocument!.id}/read`, 'Handout awaiting its file'],
          ['/teacher/assessments', 'Create assessment'],
          ['/teacher/students', 'My students'],
        ],
      ],
      [
        'student',
        studentA.email,
        [
          ['/student', 'Study materials'],
          ['/student/materials', 'Study materials'],
          // A note has no document, so the reader says so rather than
          // showing an empty frame.
          [`/student/materials/${sectionMaterial!.id}/read`, 'cannot be read here'],
          ['/student/assessments', 'Quizzes'],
          ['/student/notifications', 'Notifications'],
        ],
      ],
    ]

    for (const [label, email, pages] of sweeps) {
      const jar = await browserSession(email, pages[0][0])

      for (const [route, needle] of pages) {
        const landed = await walk(`${appUrl}${route}`, jar)
        const body = await landed.response.text()
        const status = landed.response.status
        const denied = body.includes('This workspace is for')
        const login = body.includes('Use the account issued to you by your institution')

        check(
          `${label}: ${route} renders`,
          status === 200 && body.includes(needle) && !denied && !login,
          login
            ? 'served the sign-in page'
            : denied
              ? 'access denied'
              : status !== 200
                ? `HTTP ${status}`
                : body.includes(needle)
                  ? ''
                  : `no "${needle}" in the body`,
        )
      }
    }

    /*
     * The separate assignments surface is gone — an assignment is an
     * assessment of kind ASSIGNMENT. These assert the routes are actually
     * absent rather than merely unlinked from the navigation, because a page
     * left behind is still reachable by anyone who typed the URL once.
     */
    const gone: [string, string][] = [
      [teacherA.email, '/teacher/assignments'],
      [studentA.email, '/student/assignments'],
    ]

    for (const [email, route] of gone) {
      const jar = await browserSession(email, '/')
      const landed = await walk(`${appUrl}${route}`, jar)
      check(
        `${route} no longer exists`,
        landed.response.status === 404,
        landed.response.status === 404 ? '' : `HTTP ${landed.response.status} — expected 404`,
      )
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
  /*
   * Profiles first, then auth users, then the institution.
   *
   * `profiles.institution_id` is ON DELETE RESTRICT, so the institution cannot
   * go while any of its people remain — and deleting the auth user only
   * cascades the profile if the profile's own dependants have already gone.
   * Deleting the profiles directly cascades teachers, students, materials,
   * assignments and attempts in one step.
   */
  /*
   * Content before people.
   *
   * `assignment_submissions.graded_by` is ON DELETE SET NULL, but
   * `submissions_graded_coherent` requires a grader on any GRADED row — so
   * cascading a teacher's deletion into a marked submission violates the CHECK
   * and the whole delete is refused. The application never hits this because it
   * soft-deletes people; a fixture teardown does not have that luxury.
   */
  for (const table of ['materials', 'assignments', 'assessments'] as const) {
    await admin.from(table).delete().eq('institution_id', tenant)
  }

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
  process.exit(failed ? 1 : 0)
}

await main()
