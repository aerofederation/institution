// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createTestDatabase, seedFixtures, type Fixtures, type TestDatabase } from './harness'

/**
 * Tenant isolation and privilege-escalation suite.
 *
 * Every test runs against the real migration files applied to a real
 * PostgreSQL instance, as `authenticated` with a JWT subject — the same
 * conditions PostgREST creates for an API request.
 *
 * Positive controls are interleaved deliberately. "Returned zero rows" is only
 * evidence of isolation if the same query returns rows for someone who IS
 * entitled to them; otherwise a broken query would pass every denial test.
 */

let t: TestDatabase
let f: Fixtures

beforeAll(async () => {
  t = await createTestDatabase()
  f = await seedFixtures(t)
}, 120_000)

afterAll(async () => {
  await t?.close()
})

/** Asserts a statement was refused by the database, not silently ignored. */
async function expectDenied(run: () => Promise<unknown>, code = '42501') {
  await expect(run()).rejects.toMatchObject({ code })
}

describe('Test A · an institution cannot read another institution', () => {
  it('denies reading the other institution record', async () => {
    const rows = await t.asUser(f.alpha.adminId, 'select id from public.institutions where id = $1', [
      f.beta.institutionId,
    ])
    expect(rows).toHaveLength(0)
  })

  it('denies reading the other institution profiles', async () => {
    const rows = await t.asUser(
      f.alpha.adminId,
      'select id from public.profiles where institution_id = $1',
      [f.beta.institutionId],
    )
    expect(rows).toHaveLength(0)
  })

  it('denies reading the other institution teachers, students and classes', async () => {
    for (const table of ['teachers', 'students', 'classes', 'sections', 'academic_years']) {
      const rows = await t.asUser(
        f.alpha.adminId,
        `select 1 from public.${table} where institution_id = $1`,
        [f.beta.institutionId],
      )
      expect(rows, `${table} leaked across tenants`).toHaveLength(0)
    }
  })

  it('positive control: the same administrator sees their own institution', async () => {
    const own = await t.asUser(f.alpha.adminId, 'select id from public.institutions where id = $1', [
      f.alpha.institutionId,
    ])
    expect(own).toHaveLength(1)

    const students = await t.asUser(f.alpha.adminId, 'select profile_id from public.students')
    expect(students).toHaveLength(2)
  })

  it('an unqualified select returns only the caller tenant rows', async () => {
    const rows = await t.asUser<{ institution_id: string }>(
      f.alpha.adminId,
      'select institution_id from public.students',
    )
    expect(rows.every((r) => r.institution_id === f.alpha.institutionId)).toBe(true)
  })
})

describe('Test B · a user cannot modify institution_id to escape their tenant', () => {
  it('denies moving their own profile to another institution', async () => {
    await expectDenied(() =>
      t.asUser(f.alpha.adminId, 'update public.profiles set institution_id = $1 where id = $2', [
        f.beta.institutionId,
        f.alpha.adminId,
      ]),
    )
  })

  it('denies moving an owned record into another tenant', async () => {
    await expectDenied(() =>
      t.asUser(f.alpha.adminId, 'update public.classes set institution_id = $1 where id = $2', [
        f.beta.institutionId,
        f.alpha.classId,
      ]),
    )
  })

  it('denies inserting a row stamped with another tenant', async () => {
    const rows = await t.asUser(
      f.alpha.adminId,
      `insert into public.departments (institution_id, code, name)
       values ($1, 'X', 'Smuggled') returning id`,
      [f.beta.institutionId],
    ).catch((error: { code?: string }) => error)

    // The WITH CHECK clause rejects the row outright.
    expect(rows).toMatchObject({ code: '42501' })
  })

  it('positive control: the same edit inside the caller tenant succeeds', async () => {
    const rows = await t.asUser(
      f.alpha.adminId,
      `insert into public.departments (institution_id, code, name)
       values ($1, 'PROP', 'Propulsion') returning id`,
      [f.alpha.institutionId],
    )
    expect(rows).toHaveLength(1)
  })
})

describe('Test C · a student cannot read another student', () => {
  it('denies reading a classmate profile', async () => {
    const rows = await t.asUser(f.alpha.studentId, 'select id from public.profiles where id = $1', [
      f.alpha.otherStudentId,
    ])
    expect(rows).toHaveLength(0)
  })

  it('denies reading a classmate student record', async () => {
    const rows = await t.asUser(
      f.alpha.studentId,
      'select profile_id from public.students where profile_id = $1',
      [f.alpha.otherStudentId],
    )
    expect(rows).toHaveLength(0)
  })

  it('denies reading a classmate enrolment', async () => {
    const rows = await t.asUser(
      f.alpha.studentId,
      'select id from public.student_enrollments where student_id = $1',
      [f.alpha.otherStudentId],
    )
    expect(rows).toHaveLength(0)
  })

  it('positive control: a student reads their own records', async () => {
    const profile = await t.asUser(f.alpha.studentId, 'select id from public.profiles')
    expect(profile).toHaveLength(1)

    const enrolments = await t.asUser(f.alpha.studentId, 'select id from public.student_enrollments')
    expect(enrolments).toHaveLength(1)
  })
})

describe('Test D · a teacher cannot reach another institution', () => {
  it('denies reading foreign students, classes and profiles', async () => {
    for (const query of [
      'select 1 from public.students where institution_id = $1',
      'select 1 from public.classes where institution_id = $1',
      'select 1 from public.profiles where institution_id = $1',
      'select 1 from public.teacher_class_assignments where institution_id = $1',
    ]) {
      const rows = await t.asUser(f.alpha.teacherId, query, [f.beta.institutionId])
      expect(rows, query).toHaveLength(0)
    }
  })

  it('a teacher sees only students they actually teach', async () => {
    const rows = await t.asUser<{ profile_id: string }>(
      f.alpha.teacherId,
      'select profile_id from public.students',
    )
    // Both fixture students share the teacher's assigned class and section.
    expect(rows.map((r) => r.profile_id).sort()).toEqual(
      [f.alpha.studentId, f.alpha.otherStudentId].sort(),
    )
  })

  it('a teacher with no class assignment sees no students at all', async () => {
    const rows = await t.asUser(f.alpha.unassignedTeacherId, 'select profile_id from public.students')
    expect(rows).toHaveLength(0)
  })

  it('denies a teacher writing into another institution', async () => {
    await expectDenied(() =>
      t.asUser(
        f.alpha.teacherId,
        `insert into public.subjects (institution_id, code, name) values ($1, 'HACK', 'Hack')`,
        [f.beta.institutionId],
      ),
    )
  })
})

describe('Test E · no user can escalate their own privileges', () => {
  it('denies self-assignment of HQ_ADMIN', async () => {
    for (const userId of [f.alpha.adminId, f.alpha.teacherId, f.alpha.studentId]) {
      await expectDenied(() =>
        t.asUser(userId, `update public.profiles set role = 'HQ_ADMIN' where id = $1`, [userId]),
      )
    }
  })

  it('denies changing role to any other role', async () => {
    await expectDenied(() =>
      t.asUser(f.alpha.studentId, `update public.profiles set role = 'TEACHER' where id = $1`, [
        f.alpha.studentId,
      ]),
    )
  })

  it('denies any self-service change of account status', async () => {
    await expectDenied(() =>
      t.asUser(f.alpha.studentId, `update public.profiles set status = 'DEACTIVATED' where id = $1`, [
        f.alpha.studentId,
      ]),
    )
  })

  it('denies changing the authenticated email out from under Auth', async () => {
    await expectDenied(() =>
      t.asUser(f.alpha.studentId, `update public.profiles set email = 'new@alpha.test' where id = $1`, [
        f.alpha.studentId,
      ]),
    )
  })

  it('refuses HQ_ADMIN creation through the Auth provisioning path', async () => {
    await expectDenied(() =>
      t.sql(
        `insert into auth.users (email, raw_app_meta_data)
         values ('sneaky@alpha.test', jsonb_build_object(
           'afi_role', 'HQ_ADMIN', 'afi_institution_id', $1::text))`,
        [f.alpha.institutionId],
      ),
    )
  })

  it('refuses provisioning into a tenant with no institution named', async () => {
    await expectDenied(() =>
      t.sql(
        `insert into auth.users (email, raw_app_meta_data)
         values ('tenantless@alpha.test', jsonb_build_object('afi_role', 'TEACHER'))`,
      ),
    )
  })

  it('refuses provisioning with an unknown role', async () => {
    await expect(
      t.sql(
        `insert into auth.users (email, raw_app_meta_data)
         values ('bogus@alpha.test', jsonb_build_object(
           'afi_role', 'SUPER_ADMIN', 'afi_institution_id', $1::text))`,
        [f.alpha.institutionId],
      ),
    ).rejects.toMatchObject({ code: '22023' })
  })

  /*
   * An auth user created without provisioning metadata — a Supabase dashboard
   * invite, or a signup if one were ever enabled by mistake — gets no profile.
   * The account exists and is completely inert, which is what makes it safe to
   * let the INSERT succeed rather than aborting it.
   */
  describe('an auth user with no provisioning metadata', () => {
    let inertUserId: string

    beforeAll(async () => {
      const [row] = await t.sql<{ id: string }>(
        `insert into auth.users (email, email_confirmed_at) values ('walkin@nowhere.test', now())
         returning id`,
      )
      inertUserId = row.id
    })

    it('is created without a profile', async () => {
      const rows = await t.sql('select id from public.profiles where id = $1', [inertUserId])
      expect(rows).toHaveLength(0)
    })

    it('can read nothing at all', async () => {
      for (const table of ['institutions', 'profiles', 'students', 'teachers', 'classes']) {
        const rows = await t.asUser(inertUserId, `select 1 from public.${table}`)
        expect(rows, `${table} was readable by a profile-less account`).toHaveLength(0)
      }
    })

    it('resolves to no role, no tenant and not active', async () => {
      // Evaluated as the owner, because `authenticated` cannot reach the
      // private schema at all — see the next test.
      const [row] = await t.sql<{ role: string | null; tenant: string | null; active: boolean }>(
        `select private.auth_role() as role,
                private.auth_institution_id() as tenant,
                private.is_active() as active`,
      )
      expect(row.role).toBeNull()
      expect(row.tenant).toBeNull()
      expect(row.active).toBe(false)
    })

    it('cannot call the security helpers directly — the private schema is closed', async () => {
      await expectDenied(
        () => t.asUser(inertUserId, 'select private.auth_institution_id()'),
        '42501',
      )
    })

    it('cannot create a profile for itself', async () => {
      await expectDenied(() =>
        t.asUser(
          inertUserId,
          `insert into public.profiles (id, email, full_name, role, institution_id, status)
           values ($1, 'walkin@nowhere.test', 'Walk In', 'HQ_ADMIN', null, 'ACTIVE')`,
          [inertUserId],
        ),
      )
    })
  })

  it('the privilege-escalation trigger runs as the invoker, so its role check is real', async () => {
    const [fn] = await t.sql<{ prosecdef: boolean }>(
      `select p.prosecdef
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'prevent_privilege_escalation'`,
    )
    expect(fn.prosecdef).toBe(false)
  })

  it('positive control: a user may still edit their own descriptive fields', async () => {
    await t.asUser(f.alpha.studentId, `update public.profiles set phone = '+911234567890' where id = $1`, [
      f.alpha.studentId,
    ])
    const [row] = await t.asUser<{ phone: string }>(
      f.alpha.studentId,
      'select phone from public.profiles where id = $1',
      [f.alpha.studentId],
    )
    expect(row.phone).toBe('+911234567890')
  })
})

describe('Test F · unauthenticated access is refused everywhere', () => {
  const protectedTables = [
    'profiles',
    'institutions',
    'institution_applications',
    'institution_documents',
    'teachers',
    'students',
    'classes',
    'sections',
    'departments',
    'academic_years',
    'student_enrollments',
    'teacher_class_assignments',
    'notifications',
    'audit_logs',
  ]

  it('anon has no privilege on any protected table', async () => {
    for (const table of protectedTables) {
      await expect(
        t.asAnon(`select 1 from public.${table} limit 1`),
        `anon could read ${table}`,
      ).rejects.toMatchObject({ code: '42501' })
    }
  })

  it('anon cannot write either', async () => {
    await expectDenied(() =>
      t.asAnon(`insert into public.institutions (slug, name, institution_type, category, official_email)
                values ('x', 'X', 'SCHOOL', 'PRIVATE', 'x@x.test')`),
    )
  })
})

describe('Test G · private storage objects are not reachable across tenants', () => {
  const alphaPath = () => `${f.alpha.institutionId}/institution/registration.pdf`
  const applicationPath = 'applications/00000000-0000-0000-0000-000000000001/proof.pdf'

  beforeAll(async () => {
    await t.sql(
      `insert into storage.objects (bucket_id, name) values ('institution-documents', $1), ('institution-documents', $2)`,
      [alphaPath(), applicationPath],
    )
  })

  it('every bucket is private', async () => {
    const rows = await t.sql(`select id from storage.buckets where public`)
    expect(rows).toHaveLength(0)
  })

  it('denies a foreign tenant reading the object', async () => {
    const rows = await t.asUser(
      f.beta.adminId,
      `select name from storage.objects where name = $1`,
      [alphaPath()],
    )
    expect(rows).toHaveLength(0)
  })

  it('denies a student of another institution reading it', async () => {
    const rows = await t.asUser(f.beta.studentId, `select name from storage.objects where name = $1`, [
      alphaPath(),
    ])
    expect(rows).toHaveLength(0)
  })

  it('denies anonymous reads', async () => {
    // storage.objects keeps its table grants for anon (Supabase relies on them
    // for public buckets), so refusal here is an empty result set rather than a
    // privilege error. Every bucket is private, so anon matches no policy.
    const rows = await t.asAnon(`select name from storage.objects`)
    expect(rows).toHaveLength(0)
  })

  it('denies writing into another tenant prefix', async () => {
    await expectDenied(() =>
      t.asUser(
        f.beta.adminId,
        `insert into storage.objects (bucket_id, name) values ('institution-documents', $1)`,
        [`${f.alpha.institutionId}/institution/forged.pdf`],
      ),
    )
  })

  it('positive control: the owning tenant reads its own object', async () => {
    const rows = await t.asUser(f.alpha.adminId, `select name from storage.objects where name = $1`, [
      alphaPath(),
    ])
    expect(rows).toHaveLength(1)
  })

  it('pre-approval application documents are readable only by HQ', async () => {
    const asHq = await t.asUser(f.hqId, `select name from storage.objects where name = $1`, [
      applicationPath,
    ])
    expect(asHq).toHaveLength(1)

    const asTenant = await t.asUser(f.alpha.adminId, `select name from storage.objects where name = $1`, [
      applicationPath,
    ])
    expect(asTenant).toHaveLength(0)
  })
})

describe('HQ oversight works, and is bounded', () => {
  it('HQ reads across every institution', async () => {
    const institutions = await t.asUser(f.hqId, 'select id from public.institutions')
    expect(institutions.length).toBeGreaterThanOrEqual(2)

    const students = await t.asUser(f.hqId, 'select profile_id from public.students')
    expect(students.length).toBeGreaterThanOrEqual(4)
  })

  it('HQ cannot read a tenant private notifications', async () => {
    await t.sql(
      `insert into public.notifications (user_id, institution_id, category, title)
       values ($1, $2, 'ACADEMIC', 'Private to the student')`,
      [f.alpha.studentId, f.alpha.institutionId],
    )
    const rows = await t.asUser(f.hqId, 'select id from public.notifications')
    expect(rows).toHaveLength(0)
  })
})

describe('Suspending an institution revokes its users at once', () => {
  it('a suspended tenant loses access without any user row changing', async () => {
    const before = await t.asUser(f.beta.adminId, 'select profile_id from public.students')
    expect(before).toHaveLength(2)

    await t.sql(
      `update public.institutions
          set status = 'SUSPENDED', suspended_at = now(), suspension_reason = 'compliance review'
        where id = $1`,
      [f.beta.institutionId],
    )

    const after = await t.asUser(f.beta.adminId, 'select profile_id from public.students')
    expect(after).toHaveLength(0)

    // Restored, so ordering between test files cannot matter.
    await t.sql(`update public.institutions set status = 'ACTIVE', suspended_at = null,
                 suspension_reason = null where id = $1`, [f.beta.institutionId])

    const restored = await t.asUser(f.beta.adminId, 'select profile_id from public.students')
    expect(restored).toHaveLength(2)
  })
})

describe('The audit log cannot be rewritten', () => {
  it('has no UPDATE or DELETE policy for any role', async () => {
    const rows = await t.sql<{ cmd: string }>(
      `select cmd from pg_policies where schemaname = 'public' and tablename = 'audit_logs'`,
    )
    const commands = rows.map((r) => r.cmd)
    expect(commands).not.toContain('UPDATE')
    expect(commands).not.toContain('DELETE')
  })

  it('refuses metadata containing credential-shaped keys', async () => {
    await expect(
      t.sql(
        `insert into public.audit_logs (action, entity_type, metadata)
         values ('LOGIN', 'profile', '{"attempt": {"password": "hunter2"}}'::jsonb)`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('accepts metadata that carries no secrets', async () => {
    const rows = await t.sql(
      `insert into public.audit_logs (action, entity_type, metadata)
       values ('LOGIN_FAILED', 'profile', '{"reason": "bad_credentials"}'::jsonb) returning id`,
    )
    expect(rows).toHaveLength(1)
  })
})

describe('Composite foreign keys make cross-tenant references impossible', () => {
  it('refuses a section pointing at a class in another institution', async () => {
    await expect(
      t.sql(
        `insert into public.sections (institution_id, class_id, name)
         values ($1, $2, 'Smuggled')`,
        [f.beta.institutionId, f.alpha.classId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })

  /** A freshly provisioned STUDENT profile in alpha with no extension row yet. */
  let spareStudentProfile: string

  beforeAll(async () => {
    const [row] = await t.sql<{ id: string }>(
      `insert into auth.users (email, raw_app_meta_data)
       values ('spare-student@alpha.test', jsonb_build_object(
         'afi_role', 'STUDENT',
         'afi_institution_id', $1::text,
         'afi_full_name', 'Spare Student'))
       returning id`,
      [f.alpha.institutionId],
    )
    spareStudentProfile = row.id
  })

  it('refuses a teacher record attached to a profile of the wrong role', async () => {
    await expect(
      t.sql(
        `insert into public.teachers (profile_id, institution_id, employee_id)
         values ($1, $2, 'T-999')`,
        [spareStudentProfile, f.alpha.institutionId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('refuses a student record attached to a profile in another institution', async () => {
    await expect(
      t.sql(
        `insert into public.students (profile_id, institution_id, student_code)
         values ($1, $2, 'S-999')`,
        [spareStudentProfile, f.beta.institutionId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })

  it('positive control: the same record is accepted in the right tenant and role', async () => {
    const rows = await t.sql(
      `insert into public.students (profile_id, institution_id, student_code)
       values ($1, $2, 'S-900') returning profile_id`,
      [spareStudentProfile, f.alpha.institutionId],
    )
    expect(rows).toHaveLength(1)
  })

  it('holds even against the migration owner, which bypasses RLS entirely', async () => {
    // This insert runs as `postgres`, which is not subject to RLS at all. The
    // composite foreign key rejects it anyway: alpha's student is not a student
    // of beta, so the (student_id, institution_id) pair has no referent.
    await expect(
      t.sql(
        `insert into public.student_enrollments (institution_id, student_id, class_id, academic_year_id)
         values ($1, $2, $3, $4)`,
        [f.beta.institutionId, f.alpha.studentId, f.beta.classId, f.beta.academicYearId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
  })
})

describe('The application state machine is enforced by the database', () => {
  let applicationId: string

  beforeAll(async () => {
    const [row] = await t.sql<{ id: string }>(
      `insert into public.institution_applications
         (institution_name, institution_type, category, official_email, applicant_email)
       values ('Test Aerospace Academy', 'TRAINING_INSTITUTE', 'PRIVATE',
               'contact@testacademy.test', 'rep@testacademy.test')
       returning id`,
    )
    applicationId = row.id
  })

  it('generates a non-sequential public reference distinct from the primary key', async () => {
    const [row] = await t.sql<{ application_ref: string; id: string }>(
      'select application_ref, id from public.institution_applications where id = $1',
      [applicationId],
    )
    expect(row.application_ref).toMatch(/^AFI-\d{4}-[0-9A-HJ-NP-TV-Z]{8}$/)
    expect(row.application_ref).not.toContain(row.id)
  })

  it('records creation in the status history', async () => {
    const rows = await t.sql(
      'select to_status from public.institution_application_status_history where application_id = $1',
      [applicationId],
    )
    expect(rows).toHaveLength(1)
  })

  it('refuses an illegal transition', async () => {
    await expect(
      t.sql(`update public.institution_applications set status = 'APPROVED' where id = $1`, [
        applicationId,
      ]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('permits a legal transition and traces it', async () => {
    await t.sql(
      `update public.institution_applications set status = 'SUBMITTED', submitted_at = now() where id = $1`,
      [applicationId],
    )
    await t.sql(`update public.institution_applications set status = 'UNDER_REVIEW' where id = $1`, [
      applicationId,
    ])

    const history = await t.sql<{ from_status: string; to_status: string }>(
      `select from_status, to_status from public.institution_application_status_history
        where application_id = $1 order by created_at`,
      [applicationId],
    )
    expect(history.map((h) => h.to_status)).toEqual(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW'])
  })

  it('treats REJECTED as terminal', async () => {
    await t.sql(
      `update public.institution_applications
          set status = 'REJECTED', decided_at = now(), decision_reason = 'incomplete'
        where id = $1`,
      [applicationId],
    )
    await expect(
      t.sql(`update public.institution_applications set status = 'UNDER_REVIEW' where id = $1`, [
        applicationId,
      ]),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
