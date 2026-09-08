/**
 * A throwaway classroom for driving the assessment UI in a browser.
 *
 *     npm run fixture:assessment -- setup
 *     npm run fixture:assessment -- teardown
 *
 * Development only. It creates an institution, a teacher and a student, prints
 * a one-time sign-in link for each, and deletes everything on teardown.
 *
 * The links are single-use activation links for throwaway accounts on
 * `example.test` addresses — the same mechanism a real invitation uses, so what
 * is exercised in the browser is the real sign-in path rather than a bypass.
 */

import './load-env.mts'

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!.trim()
const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
const STATE = path.resolve(process.cwd(), '.assessment-fixture.json')

async function linkFor(email: string, next: string) {
  const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const token = recovery.data?.properties?.hashed_token
  if (!token) throw new Error(`link: ${recovery.error?.message}`)
  return `${appUrl}/auth/confirm?token_hash=${token}&type=recovery&next=${next}`
}

async function setup() {
  const suffix = randomBytes(3).toString('hex')

  const { data: approver } = await admin
    .from('profiles').select('id').eq('role', 'HQ_ADMIN').limit(1).maybeSingle()

  const { data: institution, error } = await admin.from('institutions').insert({
    slug: `zzui-assess-${suffix}`,
    name: `ZZ Assessment Demo ${suffix}`,
    institution_type: 'UNIVERSITY',
    category: 'PRIVATE',
    official_email: `office.${suffix}@example.test`,
    country: 'India',
    status: 'ACTIVE',
    approved_at: new Date().toISOString(),
    approved_by: approver?.id ?? null,
  }).select('id').single()

  if (error || !institution) throw new Error(`institution: ${error?.message}`)
  const tenant = institution.id

  const { data: year } = await admin.from('academic_years').insert({
    institution_id: tenant, name: `2026-27-${suffix}`,
    starts_on: '2026-07-01', ends_on: '2027-06-30', is_current: true,
  }).select('id').single()

  const { data: klass } = await admin.from('classes').insert({
    institution_id: tenant, academic_year_id: year!.id, name: `Aerospace Year 1`,
  }).select('id').single()

  await admin.from('subjects').insert({
    institution_id: tenant, code: `PHY-${suffix}`, name: 'Physics',
  })

  async function person(role: 'TEACHER' | 'STUDENT', label: string) {
    const email = `zzui.${label}.${suffix}@example.test`
    const invite = await admin.auth.admin.generateLink({ type: 'invite', email })
    const id = invite.data!.user!.id

    await admin.rpc('provision_profile', {
      user_id: id, user_email: email,
      full_name: role === 'TEACHER' ? 'Demo Teacher' : 'Demo Student',
      role, institution_id: tenant,
    })
    await admin.auth.admin.updateUserById(id, { app_metadata: { afi_role: role } })
    await admin.from('profiles').update({ status: 'ACTIVE' }).eq('id', id)

    return { id, email }
  }

  const teacher = await person('TEACHER', 'teacher')
  const student = await person('STUDENT', 'student')

  await admin.from('teachers').insert({
    profile_id: teacher.id, institution_id: tenant,
    employee_id: `T-${suffix}`, status: 'ACTIVE',
  })
  await admin.from('students').insert({
    profile_id: student.id, institution_id: tenant,
    student_code: `S-${suffix}`, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })
  await admin.from('teacher_class_assignments').insert({
    institution_id: tenant, teacher_id: teacher.id, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })
  await admin.from('student_enrollments').insert({
    institution_id: tenant, student_id: student.id, class_id: klass!.id,
    academic_year_id: year!.id, status: 'ACTIVE',
  })

  writeFileSync(
    STATE,
    JSON.stringify({ tenant, teacher: teacher.email, student: student.email }, null, 2),
  )

  console.log('TEACHER ' + (await linkFor(teacher.email, '/teacher/assessments')))
  console.log('STUDENT ' + (await linkFor(student.email, '/student/assessments')))
}

async function relink() {
  const state = JSON.parse(readFileSync(STATE, 'utf8'))
  console.log('TEACHER ' + (await linkFor(state.teacher, '/teacher/assessments')))
  console.log('STUDENT ' + (await linkFor(state.student, '/student/assessments')))
}

async function teardown() {
  if (!existsSync(STATE)) {
    console.log('no fixture')
    return
  }
  const state = JSON.parse(readFileSync(STATE, 'utf8'))

  /*
   * Content before people: `assignment_submissions.graded_by` is ON DELETE SET
   * NULL, and the coherence CHECK refuses a GRADED row without a grader, so
   * cascading a teacher's deletion into marked work is rejected.
   */
  for (const table of ['assessments', 'assignments', 'materials', 'question_bank_items'] as const) {
    await admin.from(table).delete().eq('institution_id', state.tenant)
  }

  const { data: members } = await admin
    .from('profiles').select('id').eq('institution_id', state.tenant)

  await admin.from('profiles').delete().eq('institution_id', state.tenant)
  for (const member of members ?? []) await admin.auth.admin.deleteUser(member.id)

  const { error } = await admin.from('institutions').delete().eq('id', state.tenant)
  console.log(error ? `institution: ${error.message}` : 'removed')
}

const command = process.argv[2]
if (command === 'setup') await setup()
else if (command === 'relink') await relink()
else if (command === 'teardown') await teardown()
else console.error('usage: setup | relink | teardown')
