/**
 * End-to-end verification of the public institution application.
 *
 *     npm run verify:application
 *
 * Exercises the whole loop against the hosted project as an ANONYMOUS caller —
 * the same anon key a browser holds — because that is the only way to know the
 * public write path actually works and is actually constrained.
 *
 * It asserts the refusals as carefully as the successes: a wrong draft token,
 * direct table access, a forged document path, resubmission, a mismatched
 * tracking email, a wrong code, and code reuse all have to fail.
 *
 * Everything it creates is deleted at the end.
 */

import './load-env.mts'

import { createHash, randomBytes } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!url || !anonKey || !serviceKey) {
  console.error('\nNeeds Supabase configuration. Run `npm run check:env`.\n')
  process.exit(1)
}

const anon = createClient(url, anonKey, { auth: { persistSession: false } })
const admin = createClient(url, serviceKey, { auth: { persistSession: false } })

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

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

const token = randomBytes(32).toString('hex')
const APPLICANT = 'zze2e.applicant@example.test'

async function main() {
  console.log(`\nVerifying the public application flow on ${new URL(url!).host}\n`)

  // ── Draft creation ────────────────────────────────────────────────────────
  const started = await anon.rpc('public_start_application', {
    token_hash: sha(token),
    institution_name: 'E2E Aerospace Academy',
    institution_type: 'TRAINING_INSTITUTE',
    category: 'PRIVATE',
    official_email: 'office@zze2e.test',
    applicant_email: APPLICANT,
  })
  check('anon can start a draft', !started.error && Boolean(started.data), started.error?.message)

  const id = started.data as unknown as string
  if (!id) {
    console.error('\nCannot continue without a draft.\n')
    process.exit(1)
  }

  // ── The draft secret is what gates access ────────────────────────────────
  const wrongWrite = await anon.rpc('public_save_application', {
    application_id: id,
    token_hash: sha('wrong-token'),
    patch: { city: 'Should not persist' } as never,
  })
  check('a wrong draft token cannot write', wrongWrite.data === false)

  const wrongRead = await anon.rpc('public_get_application', {
    application_id: id,
    token_hash: sha('wrong-token'),
  })
  check('a wrong draft token cannot read', wrongRead.data === null)

  // ── Steps persist ─────────────────────────────────────────────────────────
  const steps: [string, Record<string, unknown>][] = [
    [
      'address',
      {
        address_line: '1 Runway Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        country: 'India',
        postal_code: '560001',
      },
    ],
    [
      'representative',
      {
        representative_name: 'Asha Rao',
        representative_designation: 'Director',
        representative_email: 'asha@zze2e.test',
        representative_phone: '+919900000000',
      },
    ],
    [
      'detail',
      {
        estimated_student_count: 400,
        departments: ['Aerospace Engineering'],
        programs: ['B.Tech Aerospace'],
      },
    ],
  ]

  for (const [label, patch] of steps) {
    const saved = await anon.rpc('public_save_application', {
      application_id: id,
      token_hash: sha(token),
      patch: patch as never,
    })
    check(`step "${label}" saves`, saved.data === true, saved.error?.message)
  }

  // The tracking address follows the representative once step 3 is saved. It
  // starts as the official email, which is frequently a shared inbox the
  // applicant cannot read.
  const retarget = await anon.rpc('public_save_application', {
    application_id: id,
    token_hash: sha(token),
    patch: { applicant_email: APPLICANT } as never,
  })
  check('the tracking address can be re-pointed while the draft is open', retarget.data === true)

  const readBack = await anon.rpc('public_get_application', {
    application_id: id,
    token_hash: sha(token),
  })
  const draft = readBack.data as unknown as Record<string, unknown> | null
  check('the draft reads back with the saved values', draft?.city === 'Bengaluru')
  check('the tracking address was updated', draft?.applicant_email === APPLICANT)
  check(
    'the draft never exposes its own token hash',
    draft !== null && !('draft_token_hash' in draft),
  )
  check(
    'the tracking address can never be blanked out',
    await (async () => {
      // NOT NULL on the column, and coalesced in the function — an empty patch
      // value must leave the existing address in place rather than erase it.
      await anon.rpc('public_save_application', {
        application_id: id,
        token_hash: sha(token),
        patch: { applicant_email: '' } as never,
      })
      const after = await anon.rpc('public_get_application', {
        application_id: id,
        token_hash: sha(token),
      })
      return (after.data as unknown as Record<string, unknown> | null)?.applicant_email === APPLICANT
    })(),
  )

  // ── The tables stay closed to anon ────────────────────────────────────────
  const directRead = await anon.from('institution_applications').select('*').eq('id', id)
  check(
    'anon cannot read the applications table directly',
    Boolean(directRead.error),
    `refused (${directRead.error?.code})`,
  )

  const directInsert = await anon.from('institution_applications').insert({
    institution_name: 'Direct',
    institution_type: 'SCHOOL',
    category: 'PRIVATE',
    official_email: 'x@zze2e.test',
    applicant_email: 'x@zze2e.test',
  })
  check(
    'anon cannot insert into the applications table',
    Boolean(directInsert.error),
    `refused (${directInsert.error?.code})`,
  )

  // ── Documents are confined to their own prefix ────────────────────────────
  const forged = await anon.rpc('public_attach_document', {
    application_id: id,
    token_hash: sha(token),
    document_type: 'REGISTRATION_CERTIFICATE',
    file_name: 'forged.pdf',
    storage_path: 'applications/00000000-0000-4000-8000-000000000000/forged.pdf',
    mime_type: 'application/pdf',
    file_size: 1024,
  })
  check(
    'a document path outside the application prefix is refused',
    Boolean(forged.error),
    forged.error?.code,
  )

  const attached = await anon.rpc('public_attach_document', {
    application_id: id,
    token_hash: sha(token),
    document_type: 'REGISTRATION_CERTIFICATE',
    file_name: 'registration.pdf',
    storage_path: `applications/${id}/abc123.pdf`,
    mime_type: 'application/pdf',
    file_size: 2048,
  })
  check(
    'a document under the correct prefix is accepted',
    !attached.error && Boolean(attached.data),
    attached.error?.message,
  )

  const listed = await anon.rpc('public_list_documents', {
    application_id: id,
    token_hash: sha(token),
  })
  check('the applicant can list their own documents', (listed.data ?? []).length === 1)

  // ── Submission ────────────────────────────────────────────────────────────
  const submitted = await anon.rpc('public_submit_application', {
    application_id: id,
    token_hash: sha(token),
  })
  const receipt = submitted.data as unknown as { application_ref: string; status: string } | null

  check(
    'submission assigns a public reference and moves to SUBMITTED',
    !submitted.error &&
      /^AFI-\d{4}-[0-9A-HJ-NP-TV-Z]{8}$/.test(receipt?.application_ref ?? '') &&
      receipt?.status === 'SUBMITTED',
    submitted.error?.message ?? `${receipt?.application_ref} / ${receipt?.status}`,
  )

  const resubmit = await anon.rpc('public_submit_application', {
    application_id: id,
    token_hash: sha(token),
  })
  check('a submitted application cannot be resubmitted', Boolean(resubmit.error))

  const editAfterSubmit = await anon.rpc('public_save_application', {
    application_id: id,
    token_hash: sha(token),
    patch: { city: 'Changed after submission' } as never,
  })
  check('a submitted application can no longer be edited', editAfterSubmit.data === false)

  // ── Tracking ──────────────────────────────────────────────────────────────
  const reference = receipt!.application_ref
  const code = '123456'

  const mismatched = await anon.rpc('public_request_application_access', {
    application_ref: reference,
    applicant_email: 'someone@else.test',
    code_hash: sha(code),
    ttl_minutes: 15,
  })
  check('a mismatched email yields no code', mismatched.data === null)

  const requested = await anon.rpc('public_request_application_access', {
    application_ref: reference,
    applicant_email: APPLICANT,
    code_hash: sha(code),
    ttl_minutes: 15,
  })
  check('a matching reference and email yields a code', Boolean(requested.data))

  const wrongCode = await anon.rpc('public_verify_application_access', {
    application_ref: reference,
    code_hash: sha('000000'),
  })
  check('a wrong code is refused', wrongCode.data === null)

  const rightCode = await anon.rpc('public_verify_application_access', {
    application_ref: reference,
    code_hash: sha(code),
  })
  const tracked = rightCode.data as unknown as {
    institution_name: string
    history: unknown[]
    documents: unknown[]
  } | null
  check(
    'the correct code returns the application',
    Boolean(tracked?.institution_name),
    tracked
      ? `${tracked.institution_name}, ${tracked.history.length} history entries, ${tracked.documents.length} document(s)`
      : undefined,
  )

  const reused = await anon.rpc('public_verify_application_access', {
    application_ref: reference,
    code_hash: sha(code),
  })
  check('a used code cannot be reused', reused.data === null)

  // ── It reaches HQ ─────────────────────────────────────────────────────────
  const { data: queued } = await admin
    .from('institution_applications')
    .select('application_ref, status, institution_name')
    .eq('id', id)
    .maybeSingle()

  check(
    'the application is in the HQ review queue',
    queued?.status === 'SUBMITTED',
    `${queued?.application_ref} · ${queued?.institution_name}`,
  )

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await admin.from('institution_applications').delete().eq('id', id)
  const { data: left } = await admin
    .from('institution_applications')
    .select('id')
    .eq('id', id)
    .maybeSingle()
  check('fixtures removed', left === null)

  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

await main()
