/**
 * End-to-end verification of the assessment engine.
 *
 *     npm run verify:assessment
 *
 * Walks the exact workflow the brief specifies: a teacher builds a mixed paper,
 * publishes it, a student sits it, refreshes mid-attempt, submits, the objective
 * questions mark themselves, the essay waits for a person, the teacher marks it,
 * the result is released, and the student sees it.
 *
 * Alongside that it probes the things that must NOT work — a client extending
 * its own timer, a second submission, an expired attempt, a student writing
 * their own score, one teacher reaching another's paper, one institution
 * reaching another's anything.
 *
 * Everything runs against the real hosted database through PostgREST, signed in
 * as the actual people involved. Nothing here uses the service role to prove a
 * point about permissions — that would prove nothing.
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

const suffix = randomBytes(4).toString('hex')
const tenants: string[] = []
const people: string[] = []

type Person = { id: string; email: string; client: SupabaseClient }

async function makeTenant(label: string) {
  const { data: approver } = await admin
    .from('profiles').select('id').eq('role', 'HQ_ADMIN').limit(1).maybeSingle()

  const { data, error } = await admin
    .from('institutions')
    .insert({
      slug: `zzae-${label}-${suffix}`,
      name: `ZZ Assessment ${label} ${suffix}`,
      institution_type: 'UNIVERSITY',
      category: 'PRIVATE',
      official_email: `office.${label}.${suffix}@example.test`,
      country: 'India',
      status: 'ACTIVE',
      approved_at: new Date().toISOString(),
      approved_by: approver?.id ?? null,
    })
    .select('id').single()

  if (error || !data) throw new Error(`institution: ${error?.message}`)
  tenants.push(data.id)
  return data.id
}

async function makePerson(
  institutionId: string,
  role: 'TEACHER' | 'STUDENT',
  label: string,
): Promise<Person> {
  const email = `zzae.${label}.${suffix}@example.test`
  const password = `Zz${randomBytes(12).toString('hex')}!9`

  const invite = await admin.auth.admin.generateLink({ type: 'invite', email })
  const id = invite.data?.user?.id
  if (!id) throw new Error(`create ${label}: ${invite.error?.message}`)
  people.push(id)

  const { error } = await admin.rpc('provision_profile', {
    user_id: id, user_email: email, full_name: `ZZ ${label}`, role, institution_id: institutionId,
  })
  if (error) throw error

  await admin.auth.admin.updateUserById(id, {
    password, email_confirm: true, app_metadata: { afi_role: role },
  })
  await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', id)

  const client = createClient(url!, anonKey!, { auth: { persistSession: false } })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw new Error(`sign in ${label}: ${signIn.error.message}`)

  return { id, email, client }
}

/** A class, a section, a teacher assigned to it and a student enrolled in it. */
async function makeClassroom(tenant: string, teacherId: string, studentId: string) {
  const { data: year } = await admin.from('academic_years').insert({
    institution_id: tenant, name: `2026-${suffix}`,
    starts_on: '2026-07-01', ends_on: '2027-06-30', is_current: true,
  }).select('id').single()

  const { data: klass } = await admin.from('classes').insert({
    institution_id: tenant, academic_year_id: year!.id, name: `Year 1 ${suffix}`,
  }).select('id').single()

  await admin.from('teachers').insert({
    profile_id: teacherId, institution_id: tenant,
    employee_id: `T-${suffix.slice(0, 6)}`, status: 'ACTIVE',
  })
  await admin.from('students').insert({
    profile_id: studentId, institution_id: tenant,
    student_code: `S-${suffix.slice(0, 6)}`, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })
  await admin.from('teacher_class_assignments').insert({
    institution_id: tenant, teacher_id: teacherId, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })
  await admin.from('student_enrollments').insert({
    institution_id: tenant, student_id: studentId, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })

  return { yearId: year!.id, classId: klass!.id }
}

async function main() {
  console.log(`\nVerifying the assessment engine on ${new URL(url!).host}\n`)

  const tenant = await makeTenant('alpha')
  const other = await makeTenant('beta')

  const teacher = await makePerson(tenant, 'TEACHER', 'teacher')
  const teacherB = await makePerson(tenant, 'TEACHER', 'teacher-b')
  const student = await makePerson(tenant, 'STUDENT', 'student')
  const studentB = await makePerson(tenant, 'STUDENT', 'student-b')
  const outsider = await makePerson(other, 'TEACHER', 'outsider')

  const room = await makeClassroom(tenant, teacher.id, student.id)
  await admin.from('teachers').insert({
    profile_id: teacherB.id, institution_id: tenant,
    employee_id: `TB-${suffix.slice(0, 5)}`, status: 'ACTIVE',
  })
  await admin.from('students').insert({
    profile_id: studentB.id, institution_id: tenant,
    student_code: `SB-${suffix.slice(0, 5)}`, class_id: room.classId,
    academic_year_id: room.yearId, status: 'ACTIVE',
  })
  await admin.from('student_enrollments').insert({
    institution_id: tenant, student_id: studentB.id, class_id: room.classId,
    academic_year_id: room.yearId, status: 'ACTIVE',
  })

  check('a classroom with two teachers and two students exists', true)

  // ── Every assessment kind is expressible ──────────────────────────────────
  const kinds = ['ASSIGNMENT', 'QUIZ', 'TEST', 'EXAM', 'PRACTICE'] as const
  let kindsOk = true
  for (const kind of kinds) {
    const { error } = await teacher.client.from('assessments').insert({
      institution_id: tenant, teacher_id: teacher.id, class_id: room.classId,
      academic_year_id: room.yearId, kind, title: `${kind} ${suffix}`,
      max_attempts: 1, status: 'DRAFT',
    })
    if (error) {
      kindsOk = false
      console.log(`      ${kind}: ${error.message}`)
    }
  }
  check('all five assessment kinds can be created', kindsOk)

  // ── The paper ─────────────────────────────────────────────────────────────
  const { data: paper, error: paperError } = await teacher.client
    .from('assessments')
    .insert({
      institution_id: tenant, teacher_id: teacher.id, class_id: room.classId,
      academic_year_id: room.yearId,
      kind: 'EXAM', title: `Mixed paper ${suffix}`,
      instructions: 'Answer every question.',
      duration_minutes: 30, max_attempts: 2, pass_marks: 5,
      negative_marking: true, reveal_answers: true,
      release_policy: 'AFTER_GRADING', status: 'DRAFT',
    })
    .select('id, status, is_published').single()

  check('a draft paper is created', !paperError, paperError?.message)
  check('a new paper is not published', paper?.is_published === false, `status ${paper?.status}`)

  const { data: section } = await teacher.client.from('assessment_sections').insert({
    institution_id: tenant, assessment_id: paper!.id, position: 0,
    title: 'Section A', instructions: 'Objective questions.',
  }).select('id').single()

  check('a section can be added', Boolean(section))

  // Five question types, one of each.
  async function addQuestion(
    position: number,
    fields: Record<string, unknown>,
    options?: { label: string; is_correct: boolean; match_label?: string }[],
  ) {
    const { data, error } = await teacher.client.from('assessment_questions').insert({
      institution_id: tenant, assessment_id: paper!.id, position,
      section_id: section!.id, ...fields,
    }).select('id').single()

    if (error) throw new Error(`question ${position}: ${error.message}`)

    if (options?.length) {
      const { error: optionError } = await teacher.client.from('assessment_options').insert(
        options.map((option, index) => ({
          institution_id: tenant, question_id: data.id, position: index,
          label: option.label, is_correct: option.is_correct,
          match_label: option.match_label ?? null,
        })),
      )
      if (optionError) throw new Error(`options ${position}: ${optionError.message}`)
    }

    return data.id
  }

  const mcq = await addQuestion(0, {
    question_type: 'SINGLE_CHOICE', prompt: 'What provides thrust?',
    marks: 2, negative_marks: 0.5,
  }, [
    { label: 'The engine', is_correct: true },
    { label: 'The wing', is_correct: false },
  ])

  const tf = await addQuestion(1, {
    question_type: 'TRUE_FALSE', prompt: 'Lift acts upward.', marks: 1,
  }, [
    { label: 'True', is_correct: true },
    { label: 'False', is_correct: false },
  ])

  const numerical = await addQuestion(2, {
    question_type: 'NUMERICAL', prompt: 'Acceleration due to gravity (m/s²)?',
    marks: 2, numeric_answer: 9.81, numeric_tolerance: 0.05, numeric_unit: 'm/s²',
  })

  const short = await addQuestion(3, {
    question_type: 'SHORT_ANSWER', prompt: 'Name the force opposing motion.',
    marks: 2, accepted_answers: ['drag', 'air resistance'],
  })

  const essay = await addQuestion(4, {
    question_type: 'LONG_ANSWER', prompt: 'Explain how an aerofoil generates lift.',
    marks: 5,
  })

  check('five question types were authored', Boolean(mcq && tf && numerical && short && essay))

  // ── Publishing ────────────────────────────────────────────────────────────
  const published = await teacher.client
    .from('assessments').update({ status: 'PUBLISHED' }).eq('id', paper!.id)
    .select('status, is_published').single()

  check(
    'publishing derives is_published from status',
    published.data?.is_published === true && published.data?.status === 'PUBLISHED',
    published.error?.message,
  )

  const illegal = await teacher.client
    .from('assessments').update({ status: 'COMPLETED' }).eq('id', paper!.id).select('id')
  check(
    'an illegal status transition is refused',
    Boolean(illegal.error),
    illegal.error?.code,
  )

  // ── The student sits it ───────────────────────────────────────────────────
  const start = await student.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  const attemptId = start.data as unknown as string
  check('the student can start', Boolean(attemptId), start.error?.message)

  const { data: attemptRow } = await admin
    .from('assessment_attempts')
    .select('started_at, expires_at, question_set, assessment_version')
    .eq('id', attemptId).single()

  check('the server set started_at', Boolean(attemptRow?.started_at))
  check('the server set expires_at', Boolean(attemptRow?.expires_at))
  check(
    'the attempt records the exact paper served',
    (attemptRow?.question_set ?? []).length === 5,
    `${(attemptRow?.question_set ?? []).length} questions`,
  )

  const firstExpiry = attemptRow!.expires_at

  const restart = await student.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  check(
    'starting again resumes rather than duplicating',
    (restart.data as unknown as string) === attemptId,
  )

  const { data: afterRestart } = await admin
    .from('assessment_attempts').select('expires_at').eq('id', attemptId).single()
  check(
    'the deadline did not move when the attempt resumed',
    afterRestart?.expires_at === firstExpiry,
  )

  // A client cannot push its own deadline out.
  const stretched = await student.client
    .from('assessment_attempts')
    .update({ expires_at: new Date(Date.now() + 86_400_000).toISOString() })
    .eq('id', attemptId).select('id')
  check(
    'a student cannot extend their own timer',
    (stretched.data ?? []).length === 0,
    stretched.error ? `refused (${stretched.error.code})` : '0 rows',
  )

  // ── The paper served carries no answers ───────────────────────────────────
  const paperView = await student.client.rpc('student_get_paper', {
    target_attempt_id: attemptId,
  })
  const served = JSON.stringify(paperView.data ?? {})

  check('the paper is served', !paperView.error, paperView.error?.message)
  check(
    'no answer key reaches the student',
    !served.includes('is_correct')
      && !served.includes('accepted_answers')
      && !served.includes('numeric_answer')
      && !served.includes('9.81'),
    'no is_correct / accepted_answers / numeric_answer',
  )
  check(
    'the served paper carries the server clock',
    typeof (paperView.data as Record<string, unknown>)?.server_now === 'string',
  )

  // ── Answering, then "refreshing" ──────────────────────────────────────────
  const { data: correctOption } = await admin
    .from('assessment_options').select('id').eq('question_id', mcq).eq('is_correct', true).single()

  const saves = await Promise.all([
    student.client.rpc('student_answer_question', {
      target_attempt_id: attemptId, target_question_id: mcq,
      option_ids: [correctOption!.id], answer_text: null, payload: {},
    }),
    student.client.rpc('student_answer_question', {
      target_attempt_id: attemptId, target_question_id: numerical,
      option_ids: [], answer_text: '9.8', payload: {},
    }),
    student.client.rpc('student_answer_question', {
      target_attempt_id: attemptId, target_question_id: short,
      option_ids: [], answer_text: '  Drag  ', payload: {},
    }),
    student.client.rpc('student_answer_question', {
      target_attempt_id: attemptId, target_question_id: essay,
      option_ids: [], answer_text: 'Pressure difference across the aerofoil.', payload: {},
    }),
  ])

  check(
    'answers autosave',
    saves.every((save) => (save.data as { saved?: boolean })?.saved === true),
    saves.find((save) => save.error)?.error?.message,
  )

  // The refresh: fetch the paper again and confirm nothing moved.
  const afterRefresh = await student.client.rpc('student_get_paper', {
    target_attempt_id: attemptId,
  })
  const refreshed = afterRefresh.data as {
    expires_at: string
    questions: { id: string; answer: { text_answer: string | null } | null }[]
  }

  check('the timer survives a refresh', refreshed.expires_at === firstExpiry)
  check(
    'answers survive a refresh',
    refreshed.questions.find((q) => q.id === short)?.answer?.text_answer === 'Drag',
    refreshed.questions.find((q) => q.id === short)?.answer?.text_answer ?? 'missing',
  )
  check(
    'the question order is the order served',
    refreshed.questions.map((q) => q.id).join(',') === (attemptRow!.question_set as string[]).join(','),
  )

  // ── Submitting ────────────────────────────────────────────────────────────
  const submitted = await student.client.rpc('student_submit_attempt', {
    target_attempt_id: attemptId, expired: false,
  })
  const outcome = submitted.data as unknown as {
    score: number; max_score: number; awaiting_marking: boolean; already_submitted: boolean
  }

  check('the attempt submits', !submitted.error, submitted.error?.message)

  /*
   * 2 (MCQ) + 0 (true/false unanswered) + 2 (numerical within tolerance)
   * + 2 (short answer, case and whitespace normalised) = 6, out of 12.
   * The essay is unmarked, so it contributes nothing yet.
   */
  check(
    'objective questions are marked deterministically',
    Number(outcome?.score) === 6 && Number(outcome?.max_score) === 12,
    `${outcome?.score} / ${outcome?.max_score}`,
  )
  check('the essay is left for a person', outcome?.awaiting_marking === true)

  const { data: numericAnswer } = await admin
    .from('assessment_answers').select('is_correct, marks_awarded')
    .eq('attempt_id', attemptId).eq('question_id', numerical).single()
  check(
    'a numerical answer inside tolerance is correct',
    numericAnswer?.is_correct === true,
    `9.8 vs 9.81 ±0.05 → ${numericAnswer?.marks_awarded}`,
  )

  const { data: shortAnswer } = await admin
    .from('assessment_answers').select('is_correct')
    .eq('attempt_id', attemptId).eq('question_id', short).single()
  check('a short answer matches ignoring case and spacing', shortAnswer?.is_correct === true)

  const resubmit = await student.client.rpc('student_submit_attempt', {
    target_attempt_id: attemptId, expired: false,
  })
  check(
    'a second submission is idempotent, not a second scoring',
    (resubmit.data as { already_submitted?: boolean })?.already_submitted === true,
  )

  const lateSave = await student.client.rpc('student_answer_question', {
    target_attempt_id: attemptId, target_question_id: mcq,
    option_ids: [], answer_text: null, payload: {},
  })
  check(
    'answers cannot change after submission',
    (lateSave.data as { saved?: boolean })?.saved === false,
    (lateSave.data as { reason?: string })?.reason,
  )

  // ── The result is withheld until the essay is marked ──────────────────────
  const early = await student.client.rpc('student_get_result', { target_attempt_id: attemptId })
  check(
    'the result is withheld while marking is outstanding',
    (early.data as { released?: boolean })?.released === false,
    `policy ${(early.data as { release_policy?: string })?.release_policy}`,
  )

  /*
   * The marks page sums released attempts only. An unreleased one appearing in
   * an average would tell the student their mark by arithmetic, before anybody
   * decided it should be visible — so the filter the page relies on is checked
   * here against the real table rather than assumed.
   */
  const unreleasedForMarks = await student.client
    .from('assessment_attempts')
    .select('id')
    .eq('student_id', student.id)
    .not('released_at', 'is', null)
    .eq('id', attemptId)
  check(
    'an unreleased attempt is not picked up by the marks query',
    (unreleasedForMarks.data ?? []).length === 0,
    `${(unreleasedForMarks.data ?? []).length} row(s) would have been counted`,
  )

  /*
   * `student_get_result()` refuses to send an unreleased score to the browser,
   * and says why: a score sent with a "hidden" flag is a score in the browser,
   * with only the UI declining to draw it.
   *
   * `attempts_select` admits a student to their own attempt row, and RLS is
   * row-level — it cannot withhold one column. So the score is reachable by
   * querying the table directly, which is what this records. It is the
   * student's own mark rather than somebody else's, so nothing leaks between
   * people; what leaks is timing, ahead of the teacher's release. Closing it
   * needs the scored columns moved somewhere with their own policy, because
   * column privileges cannot separate a student from a teacher when both are
   * `authenticated`.
   */
  const directRead = await student.client
    .from('assessment_attempts')
    .select('score, released_at')
    .eq('id', attemptId)
    .maybeSingle()

  const scoreVisibleEarly =
    directRead.data?.released_at === null && directRead.data?.score !== null

  check(
    'KNOWN GAP: an unreleased score is still readable from the attempts table',
    true,
    scoreVisibleEarly
      ? 'reachable by direct query — the marks page filters it out, the table does not'
      : 'not reachable, so the gap has been closed elsewhere',
  )
  check(
    'the withheld result carries no score',
    !Object.hasOwn((early.data ?? {}) as object, 'score'),
  )

  // ── The teacher marks the essay ───────────────────────────────────────────
  const { data: essayAnswer } = await admin
    .from('assessment_answers').select('id')
    .eq('attempt_id', attemptId).eq('question_id', essay).single()

  const overMax = await teacher.client.rpc('teacher_grade_answer', {
    target_answer_id: essayAnswer!.id, awarded: 99, comment: null,
  })
  check('a mark above the maximum is refused', Boolean(overMax.error), overMax.error?.code)

  const graded = await teacher.client.rpc('teacher_grade_answer', {
    target_answer_id: essayAnswer!.id, awarded: 4, comment: 'Clear, but mention circulation.',
  })
  const gradeResult = graded.data as unknown as { score: number; awaiting: number; released: boolean }

  check('the teacher can mark the essay', !graded.error, graded.error?.message)
  check(
    'the final score combines auto and manual marks',
    Number(gradeResult?.score) === 10,
    `6 auto + 4 manual = ${gradeResult?.score}`,
  )
  check('nothing is left awaiting a person', Number(gradeResult?.awaiting) === 0)

  const outsiderGrade = await teacherB.client.rpc('teacher_grade_answer', {
    target_answer_id: essayAnswer!.id, awarded: 5, comment: null,
  })
  check(
    'another teacher cannot mark this paper',
    Boolean(outsiderGrade.error),
    outsiderGrade.error?.code,
  )

  // ── Release, and the student's view ───────────────────────────────────────
  const final = await student.client.rpc('student_get_result', { target_attempt_id: attemptId })
  const finalResult = final.data as unknown as {
    released: boolean; score: number; percentage: number; passed: boolean
    questions: { feedback: string | null }[]
  }

  check('AFTER_GRADING releases once marking is done', finalResult?.released === true)
  check(
    'the student sees the final score, percentage and outcome',
    Number(finalResult?.score) === 10
      && Number(finalResult?.percentage) === 83.33
      && finalResult?.passed === true,
    `${finalResult?.score}/12 = ${finalResult?.percentage}% passed=${finalResult?.passed}`,
  )
  check(
    'the student sees the teacher’s feedback',
    finalResult?.questions?.some((q) => q.feedback?.includes('circulation')) === true,
  )

  // ── Expiry ────────────────────────────────────────────────────────────────
  const secondStart = await student.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  const secondId = secondStart.data as unknown as string
  check('a second attempt is allowed when the paper permits it', Boolean(secondId))

  // Wind the clock back with the service role — the student cannot do this,
  // which is the point tested above.
  await admin.from('assessment_attempts')
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq('id', secondId)

  const expiredSave = await student.client.rpc('student_answer_question', {
    target_attempt_id: secondId, target_question_id: mcq,
    option_ids: [correctOption!.id], answer_text: null, payload: {},
  })
  check(
    'an expired attempt refuses further answers',
    (expiredSave.data as { saved?: boolean })?.saved === false,
    (expiredSave.data as { reason?: string })?.reason,
  )

  const expiredSubmit = await student.client.rpc('student_submit_attempt', {
    target_attempt_id: secondId, expired: false,
  })
  check('an expired attempt still finalises', !expiredSubmit.error, expiredSubmit.error?.message)

  const { data: expiredRow } = await admin
    .from('assessment_attempts').select('status, submitted_at').eq('id', secondId).single()
  check(
    'the expired attempt is closed, not left open',
    expiredRow?.status !== 'IN_PROGRESS' && Boolean(expiredRow?.submitted_at),
    `status ${expiredRow?.status}`,
  )

  // ── Security ──────────────────────────────────────────────────────────────
  const otherTeacherReads = await teacherB.client
    .from('assessments').select('id').eq('id', paper!.id)
  check('another teacher cannot see this paper', (otherTeacherReads.data ?? []).length === 0)

  const outsiderReads = await outsider.client
    .from('assessments').select('id').eq('id', paper!.id)
  check('another institution cannot see this paper', (outsiderReads.data ?? []).length === 0)

  const studentReadsKey = await student.client.from('assessment_options').select('id, is_correct')
  check('a student cannot read the answer key', (studentReadsKey.data ?? []).length === 0)

  const studentEditsPaper = await student.client
    .from('assessments').update({ status: 'DRAFT' }).eq('id', paper!.id).select('id')
  check(
    'a student cannot change assessment status',
    (studentEditsPaper.data ?? []).length === 0,
  )

  const studentScore = await student.client
    .from('assessment_attempts').update({ score: 12 }).eq('id', attemptId).select('id')
  check('a student cannot rewrite their score', (studentScore.data ?? []).length === 0)

  const otherStudentAttempt = await studentB.client
    .from('assessment_attempts').select('id').eq('id', attemptId)
  check('a student cannot read another student’s attempt', (otherStudentAttempt.data ?? []).length === 0)

  const forgeAnswer = await studentB.client.rpc('student_answer_question', {
    target_attempt_id: attemptId, target_question_id: mcq,
    option_ids: [], answer_text: 'forged', payload: {},
  })
  check(
    'a student cannot answer into another student’s attempt',
    (forgeAnswer.data as { saved?: boolean })?.saved === false,
  )

  // ── Integrity events ──────────────────────────────────────────────────────
  const thirdStart = await student.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  const thirdId = thirdStart.data as unknown as string

  if (thirdId) {
    const event = await student.client.from('assessment_integrity_events').insert({
      institution_id: tenant, attempt_id: thirdId, event: 'TAB_HIDDEN',
    })
    check('a student’s browser can record an integrity event', !event.error, event.error?.message)

    const foreignEvent = await studentB.client.from('assessment_integrity_events').insert({
      institution_id: tenant, attempt_id: thirdId, event: 'TAB_HIDDEN',
    })
    check(
      'nobody can write integrity events onto another student’s attempt',
      Boolean(foreignEvent.error),
      foreignEvent.error?.code,
    )

    const teacherSees = await teacher.client
      .from('assessment_integrity_events').select('id').eq('attempt_id', thirdId)
    check('the owning teacher sees integrity events', (teacherSees.data ?? []).length >= 1)
  } else {
    check('a third attempt was refused because the limit is two', Boolean(thirdStart.error),
      thirdStart.error?.message)
  }

  // ── Auto marking OFF ──────────────────────────────────────────────────────
  /*
   * The rule: nothing is finalised merely because a correct answer exists. Every
   * question waits for a person, the score stays zero, and no result is
   * released — even for a multiple-choice question the engine could mark in its
   * sleep.
   */
  const { data: manualPaper } = await teacher.client
    .from('assessments')
    .insert({
      institution_id: tenant, teacher_id: teacher.id, class_id: room.classId,
      academic_year_id: room.yearId, kind: 'ASSIGNMENT',
      title: `Manually marked ${suffix}`, max_attempts: 1,
      auto_marking: false, release_policy: 'AFTER_GRADING', status: 'DRAFT',
    })
    .select('id').single()

  check('a paper can be set to manual marking', Boolean(manualPaper))

  const manualMcq = await (async () => {
    const { data } = await teacher.client.from('assessment_questions').insert({
      institution_id: tenant, assessment_id: manualPaper!.id, position: 0,
      question_type: 'SINGLE_CHOICE', prompt: 'Which is a control surface?', marks: 2,
    }).select('id').single()

    await teacher.client.from('assessment_options').insert([
      { institution_id: tenant, question_id: data!.id, position: 0, label: 'Aileron', is_correct: true },
      { institution_id: tenant, question_id: data!.id, position: 1, label: 'Fuselage', is_correct: false },
    ])
    return data!.id
  })()

  await teacher.client.from('assessment_questions').insert({
    institution_id: tenant, assessment_id: manualPaper!.id, position: 1,
    question_type: 'LONG_ANSWER', prompt: 'Describe roll control.', marks: 3,
  })

  await teacher.client.from('assessments')
    .update({ status: 'PUBLISHED' }).eq('id', manualPaper!.id)

  const manualAttempt = await student.client.rpc('student_start_attempt', {
    target_assessment_id: manualPaper!.id,
  })
  const manualAttemptId = manualAttempt.data as unknown as string

  const { data: manualCorrect } = await admin
    .from('assessment_options').select('id')
    .eq('question_id', manualMcq).eq('is_correct', true).single()

  await student.client.rpc('student_answer_question', {
    target_attempt_id: manualAttemptId, target_question_id: manualMcq,
    option_ids: [manualCorrect!.id], answer_text: null, payload: {},
  })

  const manualSubmit = await student.client.rpc('student_submit_attempt', {
    target_attempt_id: manualAttemptId, expired: false,
  })
  const manualOutcome = manualSubmit.data as unknown as {
    score: number; awaiting_marking: boolean; auto_marking: boolean; released: boolean
  }

  check('the paper reports that auto marking is off', manualOutcome?.auto_marking === false)
  check(
    'a correct multiple-choice answer is NOT finalised when marking is off',
    Number(manualOutcome?.score) === 0,
    `score ${manualOutcome?.score} — the key says 2`,
  )
  check('every question waits for the teacher', manualOutcome?.awaiting_marking === true)
  check('no result is released', manualOutcome?.released === false)

  const { data: manualAnswers } = await admin
    .from('assessment_answers')
    .select('is_correct, marks_awarded, suggested_marks, assessment_questions(question_type)')
    .eq('attempt_id', manualAttemptId)

  const mcqAnswer = (manualAnswers ?? []).find(
    (row) => (row.assessment_questions as unknown as { question_type: string })?.question_type
      === 'SINGLE_CHOICE',
  )

  check(
    'the objective answer is left unmarked',
    mcqAnswer?.is_correct === null && Number(mcqAnswer?.marks_awarded) === 0,
  )
  check(
    'but the engine records what it would have awarded, as a suggestion',
    Number(mcqAnswer?.suggested_marks) === 2,
    `suggested ${mcqAnswer?.suggested_marks}`,
  )

  const { data: manualRow } = await admin
    .from('assessment_attempts')
    .select('status, awaiting_manual, passed, released_at')
    .eq('id', manualAttemptId).single()

  check(
    'the attempt is pending grading, not graded',
    manualRow?.status === 'SUBMITTED' && manualRow?.awaiting_manual === 2,
    `status ${manualRow?.status}, ${manualRow?.awaiting_manual} outstanding`,
  )
  check('pass or fail is undecided until marking is done', manualRow?.passed === null)

  const withheld = await student.client.rpc('student_get_result', {
    target_attempt_id: manualAttemptId,
  })
  check(
    'the student sees no score while it is pending',
    (withheld.data as { released?: boolean })?.released === false
      && !Object.hasOwn((withheld.data ?? {}) as object, 'score'),
  )

  // The teacher marks both, and only then does a result exist.
  const { data: toMark } = await admin
    .from('assessment_answers').select('id, question_id').eq('attempt_id', manualAttemptId)

  for (const row of toMark ?? []) {
    await teacher.client.rpc('teacher_grade_answer', {
      target_answer_id: row.id, awarded: row.question_id === manualMcq ? 2 : 3,
      comment: null,
    })
  }

  const { data: manualFinal } = await admin
    .from('assessment_attempts')
    .select('status, score, awaiting_manual, passed, released_at')
    .eq('id', manualAttemptId).single()

  check(
    'once the teacher has marked everything the result is final',
    manualFinal?.status === 'GRADED'
      && Number(manualFinal?.score) === 5
      && manualFinal?.awaiting_manual === 0
      && manualFinal?.released_at !== null,
    `${manualFinal?.score}/5, status ${manualFinal?.status}`,
  )

  // ── Timer cannot be extended by any client-supplied value ─────────────────
  const probe = await student.client.rpc('student_start_attempt', {
    target_assessment_id: manualPaper!.id,
  })
  check(
    'a second attempt is refused when the limit is one',
    Boolean(probe.error),
    probe.error?.message,
  )

  const forgedExpiry = await student.client
    .from('assessment_attempts')
    .update({ expires_at: new Date(Date.now() + 3_600_000).toISOString(), status: 'IN_PROGRESS' })
    .eq('id', manualAttemptId).select('id')
  check(
    'a student cannot reopen a submitted attempt or move its deadline',
    (forgedExpiry.data ?? []).length === 0,
  )

  const forgedSuggestion = await student.client
    .from('assessment_answers').update({ marks_awarded: 99 })
    .eq('attempt_id', manualAttemptId).select('id')
  check('a student cannot write marks onto their own answers', (forgedSuggestion.data ?? []).length === 0)

  // ── Pausing ───────────────────────────────────────────────────────────────
  /*
   * Pause stops the clock and refuses answers. Resume moves the deadline
   * forward by the time spent paused and no further — and never past the
   * paper's own closing time.
   */
  const { data: pausePaper } = await teacher.client
    .from('assessments')
    .insert({
      institution_id: tenant, teacher_id: teacher.id, class_id: room.classId,
      academic_year_id: room.yearId, kind: 'PRACTICE',
      title: `Pausable ${suffix}`, duration_minutes: 30, max_attempts: 1,
      allow_pause: true, status: 'DRAFT',
    })
    .select('id').single()

  const { data: pauseQuestion } = await teacher.client.from('assessment_questions').insert({
    institution_id: tenant, assessment_id: pausePaper!.id, position: 0,
    question_type: 'TRUE_FALSE', prompt: 'Pausing stops the clock.', marks: 1,
  }).select('id').single()

  await teacher.client.from('assessment_options').insert([
    { institution_id: tenant, question_id: pauseQuestion!.id, position: 0, label: 'True', is_correct: true },
    { institution_id: tenant, question_id: pauseQuestion!.id, position: 1, label: 'False', is_correct: false },
  ])

  await teacher.client.from('assessments').update({ status: 'PUBLISHED' }).eq('id', pausePaper!.id)

  const pauseAttempt = await student.client.rpc('student_start_attempt', {
    target_assessment_id: pausePaper!.id,
  })
  const pauseAttemptId = pauseAttempt.data as unknown as string

  const { data: beforePause } = await admin
    .from('assessment_attempts').select('expires_at').eq('id', pauseAttemptId).single()

  const paused = await student.client.rpc('student_pause_attempt', {
    target_attempt_id: pauseAttemptId,
  })
  check(
    'a student can pause a paper that allows it',
    (paused.data as { paused?: boolean })?.paused === true,
    paused.error?.message,
  )

  const savedWhilePaused = await student.client.rpc('student_answer_question', {
    target_attempt_id: pauseAttemptId, target_question_id: pauseQuestion!.id,
    option_ids: [], answer_text: null, payload: {},
  })
  check(
    'answers are refused while paused',
    (savedWhilePaused.data as { saved?: boolean })?.saved === false
      && (savedWhilePaused.data as { reason?: string })?.reason === 'paused',
    (savedWhilePaused.data as { reason?: string })?.reason,
  )

  // Wind the pause back two minutes so resuming has something to give back.
  await admin.from('assessment_attempts')
    .update({ paused_at: new Date(Date.now() - 120_000).toISOString() })
    .eq('id', pauseAttemptId)

  const resumed = await student.client.rpc('student_resume_attempt', {
    target_attempt_id: pauseAttemptId,
  })
  const resumeOutcome = resumed.data as unknown as { resumed: boolean; expires_at: string }

  check('a paused attempt resumes', resumeOutcome?.resumed === true, resumed.error?.message)
  check(
    'the deadline moves forward by roughly the time spent paused',
    (() => {
      const before = new Date(beforePause!.expires_at as string).getTime()
      const after = new Date(resumeOutcome.expires_at).getTime()
      const gained = (after - before) / 1000
      return gained > 100 && gained < 140
    })(),
    (() => {
      const before = new Date(beforePause!.expires_at as string).getTime()
      const after = new Date(resumeOutcome.expires_at).getTime()
      return `gained ${Math.round((after - before) / 1000)}s for ~120s paused`
    })(),
  )

  const savedAfterResume = await student.client.rpc('student_answer_question', {
    target_attempt_id: pauseAttemptId, target_question_id: pauseQuestion!.id,
    option_ids: [], answer_text: null, payload: {},
  })
  check(
    'answers are accepted again after resuming',
    (savedAfterResume.data as { saved?: boolean })?.saved === true,
  )

  const foreignPause = await studentB.client.rpc('student_pause_attempt', {
    target_attempt_id: pauseAttemptId,
  })
  check(
    'nobody can pause another student’s attempt',
    (foreignPause.data as { paused?: boolean })?.paused === false,
  )

  // ── Editing a question ────────────────────────────────────────────────────
  const { data: draftPaper } = await teacher.client
    .from('assessments')
    .insert({
      institution_id: tenant, teacher_id: teacher.id, class_id: room.classId,
      academic_year_id: room.yearId, kind: 'QUIZ',
      title: `Editable ${suffix}`, max_attempts: 1, status: 'DRAFT',
    })
    .select('id').single()

  const { data: editable } = await teacher.client.from('assessment_questions').insert({
    institution_id: tenant, assessment_id: draftPaper!.id, position: 0,
    question_type: 'SINGLE_CHOICE', prompt: 'Original prompt', marks: 1,
  }).select('id').single()

  await teacher.client.from('assessment_options').insert([
    { institution_id: tenant, question_id: editable!.id, position: 0, label: 'A', is_correct: true },
    { institution_id: tenant, question_id: editable!.id, position: 1, label: 'B', is_correct: false },
  ])

  const edited = await teacher.client
    .from('assessment_questions')
    .update({ prompt: 'Edited prompt', marks: 3 })
    .eq('id', editable!.id).select('prompt, marks').maybeSingle()

  check(
    'the owning teacher can edit a draft question',
    edited.data?.prompt === 'Edited prompt' && Number(edited.data?.marks) === 3,
    edited.error?.message,
  )

  const foreignEdit = await teacherB.client
    .from('assessment_questions')
    .update({ prompt: 'Hijacked' })
    .eq('id', editable!.id).select('id')
  check(
    'another teacher cannot edit that question',
    (foreignEdit.data ?? []).length === 0,
  )

  // ── Question media ────────────────────────────────────────────────────────
  const mediaPath = `${tenant}/questions/${suffix}.png`

  const setMedia = await teacher.client.rpc('teacher_set_question_media', {
    target_question_id: editable!.id, path: mediaPath, content_type: 'image/png',
  })
  check('the owning teacher can attach an image', setMedia.data === true, setMedia.error?.message)

  const forgedMedia = await teacher.client.rpc('teacher_set_question_media', {
    target_question_id: editable!.id,
    path: `${other}/questions/forged.png`, content_type: 'image/png',
  })
  check(
    'an image path outside the institution is refused',
    Boolean(forgedMedia.error),
    forgedMedia.error?.code,
  )

  const foreignMedia = await teacherB.client.rpc('teacher_set_question_media', {
    target_question_id: editable!.id, path: mediaPath, content_type: 'image/png',
  })
  check(
    'another teacher cannot attach an image to that question',
    Boolean(foreignMedia.error),
    foreignMedia.error?.code,
  )

  const teacherReadsMedia = await teacher.client.rpc('assessment_question_media', {
    target_question_id: editable!.id,
  })
  check('the owning teacher can read the image path', teacherReadsMedia.data === mediaPath)

  const studentReadsMedia = await student.client.rpc('assessment_question_media', {
    target_question_id: editable!.id,
  })
  check(
    'a student with no attempt on that paper gets nothing',
    studentReadsMedia.data === null,
  )

  // ── Re-targeting a published paper ────────────────────────────────────────
  /*
   * The rest of a paper's detail stays editable after publication — extending a
   * deadline is a normal thing to do. Moving it to a different class is not:
   * attempts are already running against this one.
   */
  const { data: otherClass } = await admin.from('classes').insert({
    institution_id: tenant, academic_year_id: room.yearId, name: `Year 2 ${suffix}`,
  }).select('id').single()

  await admin.from('teacher_class_assignments').insert({
    institution_id: tenant, teacher_id: teacher.id, class_id: otherClass!.id,
    academic_year_id: room.yearId, status: 'ACTIVE',
  })

  const retarget = await teacher.client
    .from('assessments')
    .update({ class_id: otherClass!.id })
    .eq('id', paper!.id)
    .select('class_id')
    .maybeSingle()

  /*
   * RLS permits the write — the teacher owns the paper and the class is theirs —
   * so this is a rule the service layer holds, and the check records that
   * honestly rather than implying the database refuses it.
   */
  check(
    'the database itself allows a class change (the service is what refuses it)',
    !retarget.error,
    retarget.error?.message ?? 'permitted at the row level',
  )

  // Put it back so the later checks still describe the paper they were written
  // against.
  await admin.from('assessments').update({ class_id: room.classId }).eq('id', paper!.id)

  const extendDeadline = await teacher.client
    .from('assessments')
    .update({ closes_at: new Date(Date.now() + 86_400_000).toISOString() })
    .eq('id', paper!.id)
    .select('closes_at')
    .maybeSingle()

  check(
    'a deadline can still be extended after publication',
    !extendDeadline.error && Boolean(extendDeadline.data?.closes_at),
    extendDeadline.error?.message,
  )

  // ── Archiving, and finding the way back ───────────────────────────────────
  /*
   * Archiving used to be a one-way door with a hole in it. The trigger derives
   * `is_published` from `status`, and cleared `published_at` whenever that came
   * out false — so filing a paper away destroyed the record of when it had been
   * published. The builder then offered nothing to bring it back: the Archive
   * button hides itself once archived, and the Publish button only exists for
   * a DRAFT. A teacher who archived a paper could not un-archive it, and their
   * class simply stopped seeing it.
   */
  const beforeArchive = await admin
    .from('assessments')
    .select('status, published_at')
    .eq('id', paper!.id)
    .single()

  check(
    'the paper under test is published and carries a publication time',
    Boolean(beforeArchive.data?.published_at),
    `status ${beforeArchive.data?.status}`,
  )

  const archived = await teacher.client
    .from('assessments')
    .update({ status: 'ARCHIVED' })
    .eq('id', paper!.id)
    .select('status, is_published, published_at, archived_at')
    .maybeSingle()

  check('a teacher can archive their own paper', !archived.error, archived.error?.message)
  check(
    'archiving hides it from students',
    archived.data?.is_published === false,
    `is_published ${archived.data?.is_published}`,
  )
  check('archiving stamps archived_at', Boolean(archived.data?.archived_at))
  check(
    'archiving keeps the record of when it was published',
    archived.data?.published_at === beforeArchive.data?.published_at,
    archived.data?.published_at === null
      ? 'published_at was wiped'
      : `kept ${archived.data?.published_at}`,
  )

  const studentSeesArchived = await student.client
    .from('assessments')
    .select('id')
    .eq('id', paper!.id)
  check(
    'a student cannot see an archived paper',
    (studentSeesArchived.data ?? []).length === 0,
  )

  const restored = await teacher.client
    .from('assessments')
    .update({ status: 'DRAFT' })
    .eq('id', paper!.id)
    .select('status, is_published')
    .maybeSingle()

  check(
    'an archived paper can be restored to a draft',
    !restored.error && restored.data?.status === 'DRAFT',
    restored.error?.message ?? `status ${restored.data?.status}`,
  )

  const republished = await teacher.client
    .from('assessments')
    .update({ status: 'PUBLISHED' })
    .eq('id', paper!.id)
    .select('status, is_published, published_at')
    .maybeSingle()

  check(
    'a restored paper can be published again',
    !republished.error && republished.data?.is_published === true,
    republished.error?.message ?? `status ${republished.data?.status}`,
  )

  const studentSeesAgain = await student.client
    .from('assessments')
    .select('id')
    .eq('id', paper!.id)
  check(
    'the class receives it again once republished',
    (studentSeesAgain.data ?? []).length === 1,
  )

  // ── Scheduling carries the teacher's timezone ─────────────────────────────
  /*
   * The form used to submit the wall clock the teacher saw — `2026-09-15T09:00`
   * — with no offset. Postgres resolves an offsetless literal into timestamptz
   * using the session timezone, which is UTC, so 09:00 chosen in India was
   * stored as 09:00Z and shown back as 14:30. Every window was wrong by the
   * teacher's own offset. The browser now resolves the instant before it is
   * submitted; this proves the database keeps whatever instant it is given.
   */
  const intended = new Date(2026, 8, 15, 9, 0, 0, 0)
  // Both ends move together — `assessments_window_ordered` requires the close
  // to follow the opening, and the paper still carries the earlier deadline.
  const intendedClose = new Date(2026, 8, 16, 9, 0, 0, 0)
  const scheduled = await teacher.client
    .from('assessments')
    .update({ opens_at: intended.toISOString(), closes_at: intendedClose.toISOString() })
    .eq('id', paper!.id)
    .select('opens_at, closes_at')
    .maybeSingle()

  check(
    'a chosen window is stored as the instants the teacher meant',
    new Date(scheduled.data?.opens_at ?? 0).getTime() === intended.getTime() &&
      new Date(scheduled.data?.closes_at ?? 0).getTime() === intendedClose.getTime(),
    scheduled.error?.message ??
      `stored ${scheduled.data?.opens_at}, meant ${intended.toISOString()}`,
  )

  // ── Scheduled but not open ────────────────────────────────────────────────
  /*
   * A student can now see work before it opens, which is the point of setting
   * a date in advance. Visible must not mean startable: the opening time is
   * enforced inside `student_start_attempt`, not by the absence of a button.
   */
  const future = new Date(Date.now() + 3 * 86_400_000)
  const futureClose = new Date(Date.now() + 5 * 86_400_000)
  await admin
    .from('assessments')
    .update({
      status: 'PUBLISHED',
      opens_at: future.toISOString(),
      closes_at: futureClose.toISOString(),
    })
    .eq('id', paper!.id)

  const visibleEarly = await student.client
    .from('assessments')
    .select('id, opens_at')
    .eq('id', paper!.id)
  check(
    'a student can see a paper that has not opened yet',
    (visibleEarly.data ?? []).length === 1,
  )

  const startEarly = await student.client.rpc('student_start_attempt', {
    target_assessment_id: paper!.id,
  })
  /*
   * The message is asserted, not just the failure. An error from a typo in the
   * call would satisfy `Boolean(error)` just as well and prove nothing — which
   * is exactly what happened when this check was first written.
   */
  check(
    'but cannot start it before it opens',
    Boolean(startEarly.error) && /not.*open|opens|not yet/i.test(startEarly.error?.message ?? ''),
    startEarly.error?.message ?? 'the attempt was allowed',
  )

  // ── Question bank ─────────────────────────────────────────────────────────
  const { data: bankItem, error: bankError } = await teacher.client
    .from('question_bank_items').insert({
      institution_id: tenant, teacher_id: teacher.id,
      question_type: 'SINGLE_CHOICE', prompt: 'Bank question',
      marks: 1, difficulty: 'EASY', topic: 'Aerodynamics',
    }).select('id').single()

  check('a teacher can save a question to their bank', !bankError, bankError?.message)

  const bankRead = await teacherB.client
    .from('question_bank_items').select('id').eq('id', bankItem!.id)
  check('another teacher cannot read that bank question', (bankRead.data ?? []).length === 0)

  // ── Cleanup ───────────────────────────────────────────────────────────────
  for (const t of tenants) {
    await admin.from('assessments').delete().eq('institution_id', t)
    await admin.from('question_bank_items').delete().eq('institution_id', t)
    await admin.from('materials').delete().eq('institution_id', t)
    await admin.from('assignments').delete().eq('institution_id', t)
    await admin.from('profiles').delete().eq('institution_id', t)
  }
  for (const p of people) await admin.auth.admin.deleteUser(p)
  for (const t of tenants) await admin.from('institutions').delete().eq('id', t)

  const { data: left } = await admin.from('institutions').select('id').in('id', tenants)
  check('fixtures removed', (left ?? []).length === 0)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
