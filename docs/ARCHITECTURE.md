# Aero Federation of India — Digital Institution & AI Education Platform

**System Architecture & Implementation Blueprint**
Version 1.0 · Status: approved for build · Target: `D:\AFI`

---

## 0. Context & environment constraints

| Item         | Finding                | Consequence                                                                     |
| ------------ | ---------------------- | ------------------------------------------------------------------------------- |
| `D:\AFI`     | Empty directory        | True greenfield. No legacy to preserve.                                         |
| Node         | v25.5.0                | Next.js App Router, Node runtime for server actions.                            |
| npm          | 11.8.0                 | Workspace-free single package.                                                  |
| Docker       | **Not available**      | No local Supabase stack. Development targets a **hosted Supabase dev project**. |
| Supabase CLI | Not installed globally | Installed as a devDependency; invoked via `npx supabase`.                       |

### What the missing Docker changes

Migrations are still authored as ordered SQL files under `supabase/migrations/` and are the single source of truth. They are applied with `npx supabase db push` against a linked hosted project. Three Supabase projects are assumed: `afi-dev`, `afi-staging`, `afi-prod`. Nothing is ever changed by hand in the dashboard — if a hotfix is applied there, it must be back-filled into a migration before the next deploy, or the next `db push` will fight it.

Because there is no local database to reset freely, migrations must be **strictly forward-only**: a migration that has been pushed is immutable, and corrections ship as a new migration.

---

## A. Complete system architecture

### A.1 Layer model

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│  React Client Components · shadcn/ui · Framer Motion · Recharts      │
│  Supabase browser client: session cookie only, Realtime subscribe,   │
│  direct-to-storage upload via server-minted signed upload URLs.      │
│  NEVER holds the service role key. NEVER decides authorization.      │
└───────────────┬──────────────────────────────────────────────────────┘
                │  RSC payload  ·  Server Action RPC  ·  Route Handlers
┌───────────────▼──────────────────────────────────────────────────────┐
│  NEXT.JS SERVER (Node runtime)                                       │
│                                                                      │
│  middleware.ts ── session refresh + coarse route guard               │
│         │                                                            │
│  app/**/page.tsx (Server Components)   app/**/actions.ts             │
│         └──────────────┬──────────────────────┘                      │
│                        ▼                                             │
│              lib/auth/session.ts   getSessionContext()               │
│                        ▼                                             │
│              lib/permissions/guard.ts   authorize()                  │
│                        ▼                                             │
│              services/*   business logic, no JSX, no UI imports      │
│                        ▼                                             │
│   lib/supabase/server.ts (RLS client, user JWT)                      │
│   lib/supabase/admin.ts  (service role — allowlisted call sites)     │
│   lib/ai/*   lib/email/*   lib/storage/*   lib/analytics/*           │
└───────────────┬───────────────────────┬──────────────────────────────┘
                │                       │
┌───────────────▼──────────┐  ┌─────────▼────────────────────────────┐
│  SUPABASE                │  │  EXTERNAL                            │
│  PostgreSQL + RLS        │  │  SMTP (Nodemailer)                   │
│  Auth (GoTrue)           │  │  AI provider (abstracted behind      │
│  Storage (private)       │  │  lib/ai — Anthropic default)         │
│  Realtime                │  │                                      │
│  pgvector (RAG)          │  │                                      │
└──────────────────────────┘  └──────────────────────────────────────┘
```

### A.2 The governing principle: dual enforcement

Every piece of data is protected **twice, independently**:

1. **Application layer** — `getSessionContext()` → `authorize()` → service. Produces good errors, enforces rate limits, assembles AI context, and covers rules RLS cannot express (cost ceilings, workflow state machines, cross-table invariants).
2. **Database layer** — Row Level Security on every table, `FORCE`d, deny-by-default. This is the backstop that survives an application bug, a forgotten check in a new route, or a future contributor who reaches for the database directly.

Neither layer may be the only defence. A service function relying solely on RLS, or an RLS policy that exists only because "the server checks it anyway", is a rejected review.

### A.3 Mutation lifecycle (canonical)

```
Client form  (react-hook-form + zod, client-side validation)
   │
   ▼  Server Action invocation
parseOrThrow(schema, rawInput)          ← the SAME zod schema, re-run on the server
   │                                       client validation is UX, never trust
   ▼
getSessionContext()                     ← user, profile, role, institutionId,
   │                                       permission set, status. Cached per request.
   ▼
authorize({ permission, resource })     ← centralised RBAC + tenant assertion
   │                                       throws ForbiddenError — never leaks existence
   ▼
service.doTheThing(ctx, input)          ← business logic; uses the RLS-scoped client
   │                                       tenant id comes from ctx, NEVER from input
   ▼
auditLog(ctx, action, resource, diff)
   ▼
enqueueEmail(...)  /  notify(...)       ← via email_outbox, never inline SMTP
   ▼
revalidatePath() / revalidateTag()
   ▼
ActionResult<T>  { ok: true, data } | { ok: false, code, message, fieldErrors? }
```

**Rule: `institution_id` is never accepted from the browser.** For every tenant-scoped mutation the institution is derived from `ctx.institutionId`. Where an HQ actor legitimately operates on a named institution, that id is an explicit, permission-gated parameter validated against `hq.institutions.manage`.

### A.4 Where the service role key is allowed

`lib/supabase/admin.ts` carries `import 'server-only'` and exports a client reachable only from inside an already-authorized service function. The complete allowlist:

| Operation                                                      | Why RLS cannot do it                       |
| -------------------------------------------------------------- | ------------------------------------------ |
| `auth.admin.createUser` for provisioning                       | Auth schema is not user-writable           |
| `auth.admin.generateLink` / `deleteUser`                       | Same                                       |
| HQ role assignment (bootstrap script only, never an HTTP path) | Deliberately excluded from the app surface |
| `email_outbox` worker draining                                 | Runs without a user session                |
| Nightly analytics rollups, at-risk recomputation               | System jobs, no user                       |
| Seed scripts                                                   | Dev only                                   |

Every other read and write in the application runs through the user-scoped client, under RLS.

### A.5 Multi-tenancy model

**Shared database, shared schema, row-level tenant discriminator.** Chosen over schema-per-tenant and database-per-tenant because the platform must scale to thousands of institutions — per-tenant schemas make migrations O(tenants) and connection pooling unworkable, and this model is what Supabase RLS is built for.

Two reinforcing mechanisms:

**1. Denormalised `institution_id` on every tenant-owned table.** Even where the tenant is derivable through joins (`exam_answers` → `exam_attempts` → `exams` → institution), the column is carried directly. This keeps every RLS policy a single indexed equality predicate instead of a correlated subquery — the difference between a fast platform and an unusable one at scale. The redundancy is a deliberate, guarded trade.

**2. Composite foreign keys that carry the tenant.** This is the structural half of the defence, and it makes cross-tenant contamination _impossible_ rather than merely _policed_:

```sql
-- parent exposes a tenant-qualified key
ALTER TABLE assignments ADD CONSTRAINT assignments_id_inst_uk
  UNIQUE (id, institution_id);

-- child must agree on the tenant to reference it at all
ALTER TABLE assignment_submissions
  ADD CONSTRAINT submissions_assignment_fk
  FOREIGN KEY (assignment_id, institution_id)
  REFERENCES assignments (id, institution_id) ON DELETE CASCADE;
```

A submission row physically cannot point at another institution's assignment — regardless of RLS, application bugs, or a compromised service-role path. Every parent/child pair in the tenant graph uses this pattern. `institution_id` is additionally `NOT NULL` and made immutable by trigger.

### A.6 Rendering strategy

- **Server Components by default.** Dashboards, tables, detail pages and analytics fetch on the server with the RLS client. No data-fetching `useEffect`.
- **Client Components only for genuine interaction**: forms, the exam engine, AI chat streaming, charts, command palette, URL-manipulating filters.
- **Streaming with Suspense** — every dashboard renders its shell instantly and streams heavy panels, so no page shows a blank screen. `loading.tsx` skeletons at every route segment.
- **Server Actions for all mutations**; Route Handlers reserved for SSE AI streaming, the email worker, cron jobs, and certificate verification.
- **Caching**: `unstable_cache` with tenant-scoped tags (`inst:{id}:students`) for expensive analytics; user-specific data is request-memoised only. **Tenant id is always part of the cache key** — a cache key without a tenant is a cross-tenant leak.

---

## B. Complete user & role hierarchy

### B.1 The chain

```
                    ┌───────────────────────────────┐
                    │ AEROFEDERATION HEAD QUARTERS  │  role: HQ_ADMIN, institution_id IS NULL
                    └──────────────┬────────────────┘  global read, approval authority
                           │ approves / suspends
                    ┌──────▼──────────────┐
                    │    INSTITUTION      │  ← the tenant boundary
                    └──────┬──────────────┘
          ┌────────────────┼─────────────────┐
          ▼                ▼                 ▼
  ┌───────────────┐ ┌────────────┐  ┌──────────────┐
  │ INSTITUTION_  │ │  TEACHER   │  │   STUDENT    │
  │    ADMIN      │ │            │  │              │
  └───────┬───────┘ └─────┬──────┘  └──────┬───────┘
          │ provisions ───┴────────────────┘
          │ manages academic structure
          ▼
   departments → programs → academic_years → classes → sections
                                              │
                                     subjects ─┴─ courses
```

### B.2 Identity model

`auth.users` (Supabase-owned) ←1:1→ `profiles` (application-owned, PK = `auth.users.id`).

`profiles` is the single authority for **who you are, what role you hold, and which tenant you belong to**. Role-specific detail lives in extension tables:

- `teachers` — PK `profile_id`; employee id, department, qualification, experience
- `students` — PK `profile_id`; student id, admission no, class, section, guardian
- Institution admins need no extension table; `profiles.role = 'INSTITUTION_ADMIN'` suffices.

Extension tables carry `institution_id` and bind to the profile with a composite FK `(profile_id, institution_id) → profiles(id, institution_id)`, so a teacher record can never attach to a profile in another tenant.

### B.3 RBAC — roles are bundles, permissions are the truth

Hardcoding role checks through the UI is the mistake that makes a platform unextensible. Instead:

```
roles(code, name, scope, is_system)          -- HQ_ADMIN, INSTITUTION_ADMIN, TEACHER, STUDENT
permissions(code, resource, action, scope)   -- 'institution.approve', 'exam.publish', ...
role_permissions(role_code, permission_code)
```

The UI asks `can(ctx, 'exam.publish')`, never `role === 'TEACHER'`. Adding `HQ_REVIEWER`, `DEPARTMENT_HEAD`, `PARENT` or `EXAMINER` later is two `INSERT`s and zero component changes.

Permission codes are `resource.action`, scoped `GLOBAL` (HQ only) or `TENANT`. The initial set (~90 codes) spans `institution.*`, `application.*`, `document.*`, `teacher.*`, `student.*`, `academic.*`, `class.*`, `assignment.*`, `exam.*`, `attendance.*`, `material.*`, `video.*`, `ai.*`, `analytics.*`, `certificate.*`, `event.*`, `announcement.*`, `audit.*`, `settings.*`.

The permission set resolves once per request in `getSessionContext()`, memoised with React `cache()`.

### B.4 Privilege-escalation prevention

RLS cannot express column-level immutability, so this is enforced by trigger — the strongest available guarantee:

```sql
-- SECURITY INVOKER is load-bearing. See the note below.
CREATE FUNCTION private.prevent_privilege_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user IN ('postgres','supabase_admin','supabase_auth_admin','service_role') THEN
    RETURN NEW;                       -- provisioning and administration only
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.institution_id IS DISTINCT FROM OLD.institution_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'privileged column is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
```

> **`SECURITY INVOKER` vs `SECURITY DEFINER` here is not stylistic.** This function was first written `SECURITY DEFINER`, under which `current_user` evaluates to the function *owner* rather than the caller — so the privileged-role bypass matched on **every** call and the trigger never blocked anything. Escalation attempts were only being stopped further downstream by a CHECK constraint and a foreign key, which is luck, not design. The function needs no elevated rights (it only compares `NEW` against `OLD`), so it must run as the invoker for its own check to mean what it says. This was caught by running the tests, not by reading the code, which is the argument for the harness in §D.5.
>
> The related function that genuinely *must* stay `SECURITY DEFINER` — `private.handle_new_auth_user()`, which writes into `public.profiles` — therefore keys its privileged-role check on **`session_user`** instead. `session_user` is the login role and is affected by neither `SECURITY DEFINER` nor `SET ROLE`: a DBA connection reads `postgres`, GoTrue reads `supabase_auth_admin`, PostgREST reads `authenticator`. Only the first is exempt.

> **Provisioning cannot be done by a trigger on `auth.users`, and this was measured, not assumed.**
>
> Migration 006 installs `on_auth_user_created` to build the profile whenever an account is provisioned. Against the hosted project, a direct SQL insert into `auth.users` carrying `app_metadata` fires it and produces a correct profile — but an account created through the **GoTrue admin API** produces no profile at all, while `raw_app_meta_data` visibly contains `afi_role` afterwards.
>
> GoTrue inserts the user row **first** and applies `app_metadata` in a **subsequent UPDATE**. An `AFTER INSERT` trigger therefore always observes empty metadata, has no role or tenant to act on, and correctly does nothing. This is not a permissions problem; re-installing the trigger does not fix it. Every account the application will ever create goes through that API.
>
> Migration 014 makes provisioning explicit: `public.provision_profile()` lives in a schema this project owns, is callable only by the service role, is idempotent, and refuses `HQ_ADMIN`. The trigger remains a backstop for direct SQL inserts, where it does work. The general lesson holds beyond this case — a step the platform cannot function without does not belong in a schema the project does not own, especially when its failure mode is silent.

**Account creation is provisioning-only, enforced in the database.** `handle_new_auth_user()` refuses any `auth.users` insert whose `app_metadata` carries no `afi_role`, and refuses `afi_role = 'HQ_ADMIN'` outright. The role and tenant are read from **`app_metadata`, never `user_metadata`** — app_metadata is writable only with the service role, while user_metadata is writable by the account holder through `auth.updateUser({ data })`. Trusting user_metadata there would hand every user a role-assignment primitive.

**Role extension tables bind by role *and* tenant.** `teachers`, `students` and `institution_admins` each carry a pinned literal column (`role_guard`) and reference `profiles (id, role, institution_id)`. A teacher record therefore cannot attach to a profile in another institution, and cannot attach to a profile that is not a `TEACHER` — both as foreign keys, not policies.

**Activation gets exactly one narrow exception.** Since `status` is immutable to the account holder, an invited user could never finish activating. `public.activate_own_account()` closes that loop: `SECURITY DEFINER`, no arguments (the subject is always `auth.uid()`), moves `INVITED → ACTIVE` only, and requires a confirmed email. It returns a `SUSPENDED` or `DEACTIVATED` status unchanged, so it cannot be used to revive a disabled account — which is the whole reason the immutability rule exists.

Plus: the `profiles` UPDATE policy restricts the row to `id = auth.uid()`; `HQ_ADMIN` is **not creatable through any HTTP surface**; and a `CHECK` constraint asserts `(role = 'HQ_ADMIN') = (institution_id IS NULL)`, so an HQ profile can never acquire a tenant and a tenant profile can never become HQ without also violating the constraint.

HQ bootstrap is a documented DBA procedure — `supabase/seed/bootstrap_hq_admin.sql`, run by an authorized operator, elevating an existing `auth.users` id created through the normal invite flow. This is the only path to `HQ_ADMIN`, and it lives outside the application entirely.

### B.5 Account status

`profiles.status ∈ (INVITED, ACTIVE, SUSPENDED, DEACTIVATED)`. Middleware and `getSessionContext()` reject any status other than `ACTIVE` on protected routes. `private.is_active()` checks **both** the profile and its institution, and is part of every tenant RLS predicate — so suspending an institution instantly and atomically revokes all of its users without touching a single user row.

---

## C. Complete database schema

Conventions on every table: `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (trigger-maintained), `deleted_at timestamptz` where soft deletion applies, `created_by uuid REFERENCES profiles(id)`. All tenant tables carry `institution_id uuid NOT NULL`. Enums are Postgres `ENUM` types. Every FK column is indexed. Search uses `tsvector` generated columns with GIN indexes.

### C.1 Identity, RBAC, tenancy

| Table                  | Key columns                                                                                                                                                                                                                                                            | Notes                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`             | `id` (= auth.users.id), `email` citext unique, `full_name`, `phone`, `role`, `institution_id`, `status`, `avatar_path`, `locale`, `last_login_at`                                                                                                                      | `UNIQUE (id, institution_id)` — the anchor for every composite tenant FK. `CHECK ((role='HQ_ADMIN') = (institution_id IS NULL))` |
| `roles`                | `code` PK, `name`, `scope`, `is_system`                                                                                                                                                                                                                                |                                                                                                                                  |
| `permissions`          | `code` PK, `resource`, `action`, `scope`, `description`                                                                                                                                                                                                                |                                                                                                                                  |
| `role_permissions`     | `(role_code, permission_code)` PK                                                                                                                                                                                                                                      |                                                                                                                                  |
| `institutions`         | `id`, `slug` unique, `name`, `type`, `category`, `official_email`, `official_phone`, `website`, `year_established`, `registration_number`, `description`, `field_of_work`, address block, `status`, `logo_path`, `approved_at/by`, `suspended_at`, `suspension_reason` | `status ∈ (PENDING, ACTIVE, SUSPENDED, DEACTIVATED)`                                                                             |
| `institution_settings` | `institution_id` PK, feature flags, AI quotas, grading scale, attendance thresholds                                                                                                                                                                                    | One row per tenant, created on approval                                                                                          |

### C.2 Institution onboarding

| Table                                    | Key columns                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `institution_applications`               | `id`, `application_ref` unique (`AFI-2026-7K3QP9`), `status`, Step 1–4 payload columns, `applicant_email` citext, `draft_token_hash`, `submitted_at`, `current_reviewer_id`, `institution_id` (set on approval), `search_tsv`                |
| `institution_application_status_history` | `application_id`, `from_status`, `to_status`, `actor_id`, `comments`, `required_actions jsonb`, `created_at`                                                                                                                                 |
| `institution_documents`                  | `id`, `application_id`, `institution_id` (nullable pre-approval), `document_type`, `original_filename`, `storage_path`, `mime_type`, `size_bytes`, `checksum_sha256`, `version`, `verification_status`, `reviewed_by/at`, `rejection_reason` |
| `application_access_tokens`              | `application_id`, `otp_hash`, `expires_at`, `consumed_at`, `attempt_count`, `ip_hash` — anti-enumeration for `/application-status`                                                                                                           |
| `invitations`                            | `id`, `email`, `institution_id`, `role`, `token_hash`, `expires_at`, `accepted_at`, `invited_by`, `revoked_at`                                                                                                                               |

### C.3 Academic structure

`departments` · `programs` · `academic_years` · `classes` · `sections` · `subjects` · `courses` — all tenant-scoped with composite FKs up the chain. `academic_years` carries `is_current boolean` with a partial unique index guaranteeing exactly one current year per institution. Not every institution must use every level: a corporate training organisation may use only programs → courses, and a school only classes → sections → subjects.

Join tables: `teacher_class_assignments`, `teacher_subject_assignments`, `teacher_course_assignments`, `student_enrollments` (`student_id, class_id, section_id, academic_year_id, status`), `course_enrollments`.

### C.4 Teaching & assessment

| Table                    | Notes                                                                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assignments`            | title, description, `course_id`, `class_id`, `section_id`, `due_at`, `max_marks`, `rubric jsonb`, `status ∈ (DRAFT, PUBLISHED, CLOSED, ARCHIVED)`, `ai_generated`, `ai_reviewed_by`                                                                 |
| `assignment_attachments` | storage-backed                                                                                                                                                                                                                                      |
| `assignment_submissions` | `assignment_id`, `student_id`, `submitted_at`, `is_late`, `attempt_no`, `text_body`, `status`                                                                                                                                                       |
| `submission_attachments` |                                                                                                                                                                                                                                                     |
| `assignment_grades`      | `submission_id` unique, `marks`, `rubric_breakdown jsonb`, `feedback`, `graded_by`, `graded_at`, `ai_suggested_marks`, `ai_confidence`, `ai_payload jsonb`, `ai_accepted` — AI suggestion and human decision are **separate columns**, never merged |
| `exams`                  | `course_id`, `class_id`, `duration_minutes`, `total_marks`, `passing_marks`, `starts_at`, `ends_at`, `attempts_allowed`, `shuffle_questions`, `shuffle_options`, `negative_marking`, `show_results_at`, `status`, `require_fullscreen`              |
| `exam_sections`          | ordering, section marks, instructions                                                                                                                                                                                                               |
| `questions`              | `exam_id` nullable (also the practice bank), `question_type`, `body`, `marks`, `difficulty`, `topic_id`, `explanation`, `correct_answer jsonb`, `ai_generated`                                                                                      |
| `question_options`       | `question_id`, `body`, `is_correct`, `order_index`                                                                                                                                                                                                  |
| `exam_attempts`          | `exam_id`, `student_id`, `attempt_no`, `started_at`, `submitted_at`, `auto_submitted`, `status`, `score`, `time_spent_seconds`, `question_order uuid[]`, `integrity_events jsonb`                                                                   |
| `exam_answers`           | `attempt_id`, `question_id`, `answer jsonb`, `is_correct`, `marks_awarded`, `time_spent_seconds`, `flagged_for_review`, `graded_by`, `ai_payload jsonb`                                                                                             |
| `attendance_sessions`    | `class_id`, `section_id`, `course_id`, `session_date`, `period`, `taken_by`, `finalised_at` — unique per (class, section, date, period)                                                                                                             |
| `attendance_records`     | `session_id`, `student_id`, `status ∈ (PRESENT, ABSENT, LATE, EXCUSED)`, `remarks`                                                                                                                                                                  |

### C.5 Content

`learning_materials` (storage-backed, `visibility`, `published_at`, tags, `search_tsv`) · `material_class_links` · `videos` (uploaded or external URL, duration, thumbnail, difficulty, topic) · `video_progress` (`student_id`, `video_id`, `seconds_watched`, `last_position`, `completed_at`) · `video_bookmarks`.

### C.6 AI

| Table               | Notes                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ai_conversations`  | `user_id`, `institution_id`, `mode` (LEARN / PRACTICE / QUIZ / REVISION / EXAM_PREP / SOCRATIC / MISTAKE_ANALYSIS / COPILOT), `subject_id`, `title`, `archived_at`                 |
| `ai_messages`       | `conversation_id`, `role`, `content`, `citations jsonb`, `token_in/out`, `model`, `latency_ms`                                                                                     |
| `ai_usage`          | `user_id`, `institution_id`, `role`, `feature`, `model`, tokens, `estimated_cost_usd`, `success`, `error_code` — monthly partitions                                                |
| `ai_insights`       | `institution_id`, `scope`, `subject_ref`, `insight`, `metrics jsonb`, `reasoning`, `confidence`, `recommended_action`, `acknowledged_by`                                           |
| `document_chunks`   | `institution_id`, `source_type`, `source_id`, `chunk_index`, `content`, `embedding vector(1536)`, `token_count` — HNSW index; retrieval **always** filters `institution_id` in SQL |
| `topics`            | `institution_id`, `subject_id`, `name`, `parent_topic_id` — the spine for mastery tracking                                                                                         |
| `learning_profiles` | `student_id` PK, `overall_mastery`, `learning_pace`, `preferred_difficulty`, `streak_days`, `last_active_at`, `signals jsonb`                                                      |
| `topic_mastery`     | `student_id`, `topic_id`, `mastery numeric(5,2)`, `attempts`, `correct`, `last_practiced_at`, `trend`                                                                              |
| `at_risk_flags`     | `student_id`, `signals jsonb`, `score`, `reasons text[]`, `raised_at`, `resolved_at` — explanation is mandatory, not optional                                                      |

### C.7 Engagement, records, governance

`achievements` · `student_achievements` · `certificates` (`certificate_no` unique, `verification_hash`, `issued_to`, `issued_by`, `storage_path`, `revoked_at`) · `events` · `event_registrations` · `announcements` (`audience_scope`, `priority`, `published_at`, `expires_at`) · `announcement_attachments` · `notifications` (`user_id`, `category`, `priority`, `title`, `body`, `deep_link`, `read_at`) · `email_outbox` (`to`, `template`, `payload jsonb`, `status`, `attempts`, `last_error`, `send_after`) · `audit_logs` (`actor_id`, `actor_role`, `institution_id`, `action`, `resource_type`, `resource_id`, `before jsonb`, `after jsonb`, `ip_hash`, `user_agent` — append-only, monthly partitions) · `system_settings` · `rate_limits`.

### C.8 Indexing strategy

Every RLS predicate column is indexed. Tenant tables get composite indexes leading with `institution_id` — e.g. `(institution_id, status, created_at DESC)` for list views — because every query is tenant-filtered and a leading tenant column makes the index selective from the first byte. Partial indexes exclude soft-deleted rows. `pg_trgm` + GIN for name search, `tsvector` for full-text, HNSW for embeddings.

---

## D. Row Level Security strategy

### D.1 Foundations

Every table gets `ENABLE ROW LEVEL SECURITY`. No table ships without policies — no policy means no access, which is the correct default.

**`FORCE ROW LEVEL SECURITY` is deliberately *not* applied.** This reverses the original intent, and the reason is worth recording. FORCE changes behaviour only for the table *owner*, and no API role is ever the owner — requests arrive as `anon` or `authenticated`, both already fully subject to RLS. What FORCE would actually break is the owner-context bypass that the `SECURITY DEFINER` helpers and triggers rely on to write status-history and audit rows. Compensating would mean giving those tables permissive INSERT policies instead, which is strictly worse: a permissive INSERT policy is reachable from the API, and owner context is not.

Helper functions live in a `private` schema not exposed through PostgREST, declared `SECURITY DEFINER STABLE SET search_path = ''` so they can read `profiles` without triggering recursive RLS evaluation:

```
private.auth_role()             -> text
private.auth_institution_id()   -> uuid
private.is_hq()                 -> boolean
private.has_permission(text)    -> boolean
private.is_active()             -> boolean   -- profile ACTIVE *and* institution ACTIVE
private.teaches_class(uuid)     -> boolean
private.teaches_course(uuid)    -> boolean
private.enrolled_in_class(uuid) -> boolean
private.owns_profile(uuid)      -> boolean
```

**Performance rule:** every helper call inside a policy is wrapped as `(SELECT private.auth_institution_id())`. Postgres then hoists it into an InitPlan and evaluates it once per statement rather than once per row. On a 200k-row table that is the difference between single-digit milliseconds and multiple seconds. Non-negotiable in every policy we write.

### D.2 Policy archetypes

Four shapes cover essentially the whole schema.

**1 — Tenant-scoped** (`classes`, `courses`, `assignments`, `learning_materials`, …)

```sql
CREATE POLICY tenant_select ON assignments FOR SELECT TO authenticated
USING (
  (SELECT private.is_active())
  AND ( (SELECT private.is_hq())
        OR institution_id = (SELECT private.auth_institution_id()) )
);
```

**2 — Owner-scoped** (`notifications`, `ai_conversations`, `video_progress`)

```sql
USING (user_id = (SELECT auth.uid()))
```

**3 — Relationship-scoped** (`exam_answers`, `attendance_records`, `assignment_submissions`)
Student sees own rows; teacher sees rows for classes they are assigned to; institution admin sees the tenant; HQ reads globally.

```sql
USING (
  institution_id = (SELECT private.auth_institution_id())
  AND (
    student_id = (SELECT auth.uid())
    OR (SELECT private.auth_role()) = 'INSTITUTION_ADMIN'
    OR (SELECT private.teaches_class(class_id))
  )
)
```

**4 — HQ-global** (`institution_applications`, `audit_logs`, global `ai_usage`)

```sql
USING ((SELECT private.is_hq()) AND (SELECT private.has_permission('audit.read')))
```

Additional invariants:

- **Separate policies per command** — never `FOR ALL`. Read access and write access are different questions.
- **`TO authenticated` on every policy.** A policy defaulting to `PUBLIC` is a bug.
- **`WITH CHECK` on every INSERT/UPDATE**, always pinning `institution_id = (SELECT private.auth_institution_id())`, so a tenant cannot write a row into another tenant even if it could somehow name one.
- **`audit_logs` and `ai_usage` have INSERT + SELECT policies only.** No UPDATE or DELETE policy exists for any role, which makes them append-only at the database level rather than by convention.

### D.3 Anonymous / public access

The public website needs data without a session. Rather than loosening table policies for `anon`, the public surface is served by `SECURITY DEFINER` RPCs returning only published, non-sensitive projections — `public_get_events()`, `public_get_announcements()`, `public_get_institution_directory()`, `public_get_platform_stats()` — plus `public_certificate_verify(hash)`, which returns holder name, title, issue date and validity and nothing else.

`anon` holds no direct SELECT on any base table. The public attack surface is a handful of auditable function signatures.

### D.4 Storage RLS

Every bucket is private. `storage.objects` policies key on the first path segment being the caller's institution:

```sql
CREATE POLICY inst_docs_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'institution-documents'
  AND ( (SELECT private.is_hq())
        OR (storage.foldername(name))[1] = (SELECT private.auth_institution_id())::text )
);
```

Downloads are served by short-TTL signed URLs minted server-side **after** the same `authorize()` check that guards the metadata row, so the path policy is the second lock, not the only one.

### D.5 Verification

RLS is not done until it is proven, and "proven" cannot mean reading the policies and agreeing with them. `tests/rls/` applies the **actual migration files** to an in-process PostgreSQL 18 (PGlite, WebAssembly), reproduces the parts of a Supabase project that live outside our migrations — the `anon` / `authenticated` / `service_role` roles, the `auth` schema and its `uid()` helper, the `storage` schema — and then issues statements the way PostgREST does: set the verified JWT claims, `SET LOCAL ROLE`, run, unwind.

This is a **test harness, not a second database**. `@electric-sql/pglite` is a devDependency, nothing under `app/`, `lib/` or `services/` imports it, and Supabase remains the only backend. What it buys is that an RLS regression fails a test run instead of reaching production, with no credentials and no Docker required in CI.

Denial tests are paired with **positive controls throughout**. "Returned zero rows" is only evidence of isolation if the same query returns rows for someone who is entitled to them; without the paired assertion, a broken query would pass every denial test in the suite.

The suite asserts that each of the eight required security cases returns zero rows or raises `42501`:

| #   | Case                                              | Expected         |
| --- | ------------------------------------------------- | ---------------- |
| 1   | Institution A reads Institution B                 | 0 rows           |
| 2   | Student A reads Student B                         | 0 rows           |
| 3   | Teacher A reaches another institution             | 0 rows           |
| 4   | User updates own `role`                           | `42501`          |
| 5   | User updates own `institution_id`                 | `42501`          |
| 6   | User self-assigns `HQ_ADMIN`                      | `42501`          |
| 7   | User fetches a foreign storage path               | 403              |
| 8   | Unauthorized user calls a protected Server Action | `ForbiddenError` |

These run in CI against the dev project and gate the phase.

---

## E. Authentication flow

### E.1 Design decision: no public self-signup

There is no "Create account" on the public site. Institutions _apply_ (creating no account), and every user account is _provisioned_ by an authority above them. This eliminates an entire class of tenant-assignment attacks: a user never chooses their institution or role, because both are written by the provisioning actor before the account can be used at all.

### E.2 Flows

**Activation (all provisioned users)**

```
Authority creates user
  → auth.admin.createUser(email, no password, email_confirm:false)
  → profiles row: role + institution_id + status INVITED
  → invitations row with token_hash (the raw token is never stored)
  → Nodemailer: /auth/activate?token=…   (72 h TTL, single use)
  → user sets password (zod: min 12 chars, complexity, breach check)
  → auth.admin.updateUserById(password, email_confirm:true)
  → profiles.status = ACTIVE, invitations.accepted_at = now()
  → audit: USER_ACTIVATED
```

Temporary passwords are never generated, never emailed, never displayed.

**Login** — `signInWithPassword` → middleware refresh → `getSessionContext()` → status and institution checks → redirect by role. Failed attempts are audited and rate-limited per email+IP (5 per 15 min, exponential backoff).

**Password reset** — Supabase `resetPasswordForEmail` with our own Nodemailer template through a custom redirect. The response is identical whether or not the email exists.

**Session** — `@supabase/ssr` cookie-based, refreshed in `middleware.ts` on every request. Middleware performs only cheap coarse guarding (is there a session; does the URL prefix match the role claim); authoritative checks always re-run in the Server Component or Action, because middleware runs on cached/edge paths and must never be the sole gate.

**Route guard matrix**

| Prefix            | Requires                                               |
| ----------------- | ------------------------------------------------------ |
| `/hq/**`          | `HQ_ADMIN` + ACTIVE                                    |
| `/institution/**` | `INSTITUTION_ADMIN` + ACTIVE + institution ACTIVE      |
| `/teacher/**`     | `TEACHER` + ACTIVE + institution ACTIVE                |
| `/student/**`     | `STUDENT` + ACTIVE + institution ACTIVE                |
| `/(auth)/**`      | anonymous — authenticated users redirect to their home |
| public routes     | open                                                   |

**MFA** — architecturally reserved: Supabase TOTP factors with `aal2` required for `/hq/**`, gated behind a system setting. Not implemented in v1, and not faked in the UI.

---

## F. Institution application flow

### F.1 Steps and persistence

Seven steps: Organization → Address → Representative → Institution detail → Documents → Review → Submit. The draft is server-persisted from Step 1 against an `institution_applications` row in `DRAFT`, addressed by an httpOnly `afi_draft` cookie holding a token whose hash is stored on the row. An applicant can close the tab and return; nobody else can resume their draft.

`application_ref` is generated on submission as `AFI-{YYYY}-{6-char Crockford base32}` from a sequence plus checksum — unguessable, and readable over the phone.

### F.2 Status machine

```
DRAFT ──submit──► SUBMITTED ──pickup──► UNDER_REVIEW
                                          │
        ┌─────────────────────────────────┼───────────────────────┐
        ▼                                 ▼                       ▼
 DOCUMENTS_REQUIRED            RESUBMISSION_REQUIRED           APPROVED
        │                                 │                       │
        └────── applicant responds ───────┘                  (institution
                       │                                      provisioned)
                       ▼
                  UNDER_REVIEW ──────────────────► REJECTED   SUSPENDED ⇄ APPROVED
```

Transitions are validated by a single `transition()` function against an explicit allowed-transitions map; an invalid transition is a 409, not a silent no-op. Every transition writes `institution_application_status_history` with actor, comments and required actions, and queues the matching email. That history is exactly what the applicant sees on `/application-status`.

### F.3 Anti-enumeration on tracking

Knowing an application ID must not be enough. `/application-status` requires **application ref + registered email**, then emails a 6-digit OTP (15 min TTL, 5 attempts, hashed at rest, constant-time comparison) which exchanges for a 30-minute signed tracking session cookie. Responses are uniform and timing-normalised whether or not the pair exists, so the endpoint cannot be used to discover which institutions have applied. Rate limits: 5 lookups per hour per IP, 10 per day per email.

---

## G. Teacher & student provisioning

```
INSTITUTION_ADMIN (ctx.institutionId = X)
        │  authorize('teacher.create')
        ▼
services/teachers/create.ts
        │  input zod-validated; any institutionId in the payload is IGNORED
        │  tenant := ctx.institutionId   ← always
        ▼
admin.auth.admin.createUser(email)          [service role, allowlisted]
        ▼
INSERT profiles (id, role='TEACHER', institution_id := X, status='INVITED')
        ▼
INSERT teachers (profile_id, institution_id := X, employee_id, …)
        │  composite FK guarantees the two agree
        ▼
INSERT invitations (token_hash, expires_at)
        ▼
INSERT email_outbox (template='teacher_activation')
        ▼
audit_logs: TEACHER_CREATED
```

Students follow the identical shape, with class/section/program assignment likewise validated to belong to `ctx.institutionId` before use. Because tenancy comes from the session and is re-asserted by both the composite FK and the RLS `WITH CHECK`, there is no request shape — malformed, malicious, or replayed — that lands a user in the wrong institution. Neither a teacher nor a student can change their institution from their dashboard: the column is trigger-immutable.

Rollback: a failure after `createUser` triggers a compensating `deleteUser`, and orphaned auth users are additionally reaped nightly. Bulk CSV student import reuses the same service function per row inside a batch report, so it inherits every guarantee.

---

## H. AI architecture

### H.1 Layering

```
lib/ai/
  provider/            AIProvider interface + anthropic.ts (default), openai.ts
  services/
    chat.ts            AIChatService        streaming tutor + copilot
    embedding.ts       AIEmbeddingService   chunking + vectorisation
    assessment.ts      AIAssessmentService  assignment / exam / question generation
    grading.ts         AIGradingService     rubric-based scoring suggestions
    insight.ts         AIInsightService     institution intelligence, at-risk
  rag/
    scope.ts           RetrievalScope resolution (authorization-first)
    retrieve.ts        tenant-filtered hybrid vector + keyword search
    assemble.ts        context packing under a token budget
  guardrails/
    sanitize.ts        untrusted-content wrapping, injection stripping
    validate.ts        structured-output schema validation
  usage/
    track.ts           ai_usage writes
    limits.ts          per-role / per-institution quota enforcement
  prompts/             versioned, reviewable system prompts
```

Components never import a provider SDK. Swapping providers is a config change plus one adapter file.

### H.2 Authorization-first retrieval — the core safety property

The AI is never the thing that decides what it may see. Retrieval scope is computed from the session _before_ the model is invoked, and applied as a SQL predicate, not a post-filter:

```
getSessionContext()
   ▼
resolveRetrievalScope(ctx)   → { institutionId, classIds[], courseIds[],
                                 subjectIds[], materialIds[], allowGlobalAfi }
   ▼
retrieve(scope, query)       → SELECT … FROM document_chunks
                               WHERE institution_id = scope.institutionId
                                 AND source_id = ANY(scope.materialIds)
                               ORDER BY embedding <=> $1 LIMIT k
   ▼
assemble(chunks, budget)     → context block, each chunk tagged with its source
   ▼
provider.stream(system, context, userMessage)
   ▼
validate + persist (ai_messages, ai_usage)
```

The model receives text, never identifiers it could use to fetch more, and never a tool that reads the database without passing through `resolveRetrievalScope`. Cross-tenant retrieval is therefore not a prompt-engineering problem — it is structurally unreachable.

### H.3 Guardrails

- **Prompt injection** — retrieved material is untrusted input. It is wrapped in explicit delimiters; the system prompt states that delimited content is reference data and never instructions; imperative override patterns are stripped; outputs are schema-validated before use.
- **Grading integrity** — AI writes only to `ai_suggested_*` columns. `assignment_grades.marks` is only ever written by a human action carrying `graded_by`. Suggestions surface with rubric breakdown and a confidence indicator; accept / modify / reject is recorded. The system never silently finalises an academic grade.
- **Generation review gate** — AI-produced assignments and exams are created in `DRAFT` with `ai_generated = true`. Publishing requires an explicit human action that stamps `ai_reviewed_by`.
- **Insights** — every insight carries supporting metrics, reasoning, and a recommended action. At-risk flags always render _why_. No automated disciplinary action, ever.
- **Privacy** — a redaction layer strips emails, phone numbers, guardian details and identifiers from context before dispatch. Only the minimum educational payload leaves the platform. Credentials and tokens are structurally absent from every context builder.

### H.4 Cost control

Per-request token ceilings; per-feature model selection (cheap model for classification and embedding, strong model for tutoring and grading); per-user, per-institution and per-feature quotas from `institution_settings`; sliding-window rate limits; response caching for deterministic generations; graceful degradation with a clear message rather than a silent failure. Every call writes an `ai_usage` row whether it succeeds or fails, so HQ and institution dashboards report reality rather than optimism.

### H.5 Aerospace specialisation

The aerospace capability is a **content and prompt layer, not a hardcoded curriculum**: an AFI-curated global topic taxonomy (aerodynamics, structures, propulsion, flight mechanics, avionics, materials, systems, space technology, UAV, manufacturing, supporting mathematics and physics) plus subject-specific system prompts tuned for step-by-step derivations, equations, and technical terminology. Institutions remain free to define their own curriculum; the aerospace pack is available, not imposed. Every aerospace response carries a standing boundary: this is educational assistance and never real-world operational aviation guidance.

---

## I. Storage architecture

Buckets, all **private**: `institution-documents`, `teacher-documents`, `student-documents`, `learning-materials`, `videos`, `assignment-submissions`, `certificates`, `profile-images`, `event-assets`.

Path convention — tenant first, always:

```
{institution_id}/{entity_type}/{entity_id}/{uuid}.{ext}
```

Pre-approval application documents, where no institution exists yet, live at `applications/{application_id}/{uuid}.{ext}` under a policy scoped to the draft token and HQ reviewers, and migrate under the institution prefix on approval.

**Upload path** — client requests a signed upload URL from a Server Action → the action authorizes, validates declared MIME and size against a per-bucket allowlist, writes a `PENDING` metadata row, returns the signed URL → client uploads directly to Storage (never through our server, so large video uploads don't occupy a Node process) → client confirms → server verifies the object, records checksum and size, flips the row to `READY`. A reaper clears `PENDING` rows older than 24 h and objects with no metadata row.

**Download path** — Server Action authorizes against the metadata row → mints a signed URL with a short TTL (60 s documents, 5 min video) → returns it. Storage paths are never rendered into HTML and never appear in public JSON.

A virus-scanning hook sits between upload confirmation and `READY` — unimplemented in v1, but the state machine is already in place so it can be added without a schema change.

---

## J. Nodemailer architecture

```
lib/email/
  transporter.ts    pooled singleton, server-only, env-driven
  render.ts         React Email → HTML + plain text
  templates/        one component per message, sharing an AFI layout
  send.ts           enqueue(template, to, payload)   ← what callers use
  worker.ts         drains email_outbox with retry + backoff
```

**Emails are queued, never sent inline.** A Server Action writes to `email_outbox` and returns; a worker drains it. An SMTP outage therefore cannot fail an institution approval or make a user-facing action hang, and every message is retryable and auditable. The worker is a Route Handler protected by a shared secret, invoked by a scheduler (Vercel Cron, or `pg_cron` → `net.http_post`), with exponential backoff and a poison-message threshold.

Templates: application received · under review · documents required · approved · rejected · institution activation · teacher activation · student activation · password reset · assignment notification · exam notification · result notification · certificate issued · announcements · application-status OTP.

Rules enforced by construction: SMTP credentials are read only in `server-only` modules and never reach the client; no permanent password is ever transmitted; every link is single-use, expiring, and hash-stored; every template renders a legible plain-text alternative.

---

## K. Route structure

```
app/
  (public)/
    page.tsx                          home
    about/  institutions/  institutions/[slug]/
    events/  events/[slug]/
    announcements/  announcements/[slug]/
    contact/
  apply/                              7-step wizard, route per step, server-persisted
  application-status/                 verify → track
  verify/[certificateId]/
  (auth)/
    login/  forgot-password/  reset-password/  activate/  auth/callback/
  hq/                                 COMMAND CENTRE
    dashboard · applications[/id] · institutions[/id] · teachers · students ·
    academics · analytics · ai-intelligence · documents · certificates ·
    events · announcements · audit · settings
  institution/                        OPERATIONS CENTRE
    dashboard · health · teachers[/id] · students[/id] ·
    academics/{departments,programs,years,classes,sections,subjects,courses} ·
    assignments · exams · attendance · materials · videos ·
    analytics · ai-usage · announcements · events · certificates · settings
  teacher/                            TEACHING & AI WORKSPACE
    dashboard · classes[/id] · students · attendance ·
    assignments[/id/submissions] · exams[/id/{builder,results}] ·
    materials · videos · ai/{copilot,generate,grading} · analytics ·
    announcements · notifications · profile
  student/                            PERSONAL LEARNING ENVIRONMENT
    home · ai-classroom[/conversationId] · classes · assignments[/id] ·
    exams[/id/attempt] · practice · materials · videos[/id] · attendance ·
    performance · achievements · certificates · notifications · profile
  api/
    ai/chat/route.ts                  SSE streaming
    email/worker/route.ts             secret-protected
    cron/{rollups,at-risk,reaper}/route.ts
    storage/signed-url/route.ts
```

Route groups give each role its own layout, navigation and information architecture while sharing one design language.

---

## L. Project folder structure

```
D:\AFI
├── app/                    (as above)
├── components/
│   ├── ui/                 shadcn primitives
│   ├── layout/             shells, nav, command palette, breadcrumbs
│   ├── public/  hq/  institution/  teacher/  student/
│   ├── ai/                 chat, streaming message, citation chips, mode switcher
│   ├── forms/              field wrappers, multi-step machinery, submit button
│   ├── tables/             DataTable + column kit, filters, pagination
│   └── charts/             typed Recharts wrappers on the AFI palette
├── lib/
│   ├── supabase/           client.ts · server.ts · admin.ts · middleware.ts · types.ts
│   ├── auth/               session.ts · guards.ts · activation.ts
│   ├── permissions/        definitions.ts · can.ts · guard.ts
│   ├── tenant/             context.ts · assert.ts
│   ├── ai/                 (as §H)
│   ├── email/              (as §J)
│   ├── storage/            buckets.ts · upload.ts · signed.ts · validate.ts
│   ├── validation/         zod schemas shared by client and server
│   ├── security/           rate-limit.ts · tokens.ts · hashing.ts · audit.ts
│   ├── analytics/          metric queries, rollups
│   └── utils/
├── services/               institutions · applications · teachers · students ·
│                           academics · assignments · exams · attendance ·
│                           materials · videos · ai · notifications ·
│                           certificates · events · analytics · audit
├── supabase/
│   ├── migrations/         ordered, forward-only, immutable once pushed
│   └── seed/               dev seed + bootstrap_hq_admin.sql
├── tests/                  unit/ · integration/ · rls/ · e2e/
├── types/                  database.generated.ts + domain types
├── docs/                   ARCHITECTURE.md · RUNBOOK.md · SECURITY.md
└── config files
```

**Rule: components render, services decide, lib provides capability.** A component that queries the database directly, or a service that imports JSX, is a defect.

---

## M. Implementation roadmap

Each phase ends with `npm run lint && npm run typecheck && npm run build` plus its own tests green. A broken phase is never carried forward.

| #   | Phase                    | Key deliverables                                                                                                | Exit criteria                                         |
| --- | ------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | Initialization           | Next.js + TS + Tailwind + shadcn, dependencies, folder skeleton, env contract, git                              | Clean build, app boots                                |
| 2   | Architecture scaffolding | Supabase clients, session context, RBAC utilities, guard pipeline, `ActionResult`, error classes, design tokens | Typecheck green, guard unit-tested                    |
| 3   | Schema                   | Full DDL, enums, constraints, composite FKs, triggers, indexes                                                  | Schema pushed to dev                                  |
| 4   | Migrations               | Ordered migration set, generated types, seed data                                                               | `db push` reproducible from zero                      |
| 5   | RLS                      | Helpers, policies for every table, storage policies                                                             | RLS matrix suite green (all 8 cases)                  |
| 6   | Authentication           | Login, activation, reset, middleware, route guards, auth auditing                                               | Full auth E2E                                         |
| 7   | Public website           | Home, about, directory, events, announcements, contact, design system                                           | Real DB-driven stats; responsive at all 7 breakpoints |
| 8   | Institution application  | 7-step wizard, drafts, uploads, submission, OTP-gated tracking                                                  | Apply → track E2E                                     |
| 9   | HQ dashboard             | Command centre, application review, approve/reject/request, provisioning                                        | Approval provisions a live institution                |
| 10  | Institution dashboard    | Operations centre, health metrics, teacher & student management                                                 | Provisioned users can log in                          |
| 11  | Teacher dashboard        | Workspace shell, classes, students                                                                              |                                                       |
| 12  | Student dashboard        | Learning environment shell, home                                                                                |                                                       |
| 13  | Academic system          | Departments → courses, teacher assignment, enrolments, bulk import                                              |                                                       |
| 14  | Assignments              | Create, publish, submit, grade, feedback                                                                        | Full assignment E2E                                   |
| 15  | Exam engine              | Builder, timed attempt, autosave, auto-submit, navigator, scoring, integrity events                             | Timed exam E2E including recovery                     |
| 16  | AI Classroom             | Provider abstraction, RAG, 7 modes, streaming, usage tracking                                                   | Cross-tenant retrieval provably fails                 |
| 17  | Teacher AI Copilot       | Lesson plans, assignment/exam/question generation with review gate                                              | Nothing publishes without a human                     |
| 18  | AI grading               | Rubric scoring, confidence, accept/modify/reject                                                                | AI never writes final marks                           |
| 19  | Analytics                | Teacher, institution, HQ analytics; AI insights; explained at-risk flags                                        | Metrics reconcile against source rows                 |
| 20  | Documents & certificates | Verified document workflow, issuance, public verification                                                       |                                                       |
| 21  | Events & notifications   | Events, registrations, announcements, notification centre, email worker                                         |                                                       |
| 22  | Audit & security         | Audit centre, rate limits, security headers, hardening, threat review                                           | Security suite green                                  |
| 23  | Testing                  | Unit, integration, RLS, E2E across all four roles                                                               | CI green                                              |
| 24  | Performance              | Query plans, indexes, pagination, caching, bundle budget, media optimisation                                    | Budgets met                                           |
| 25  | Production readiness     | Error surfaces, runbook, backups, monitoring, final UI and a11y review                                          | Launch checklist signed off                           |

### Explicitly out of scope for v1

Live classroom (WebRTC, streaming, screen share) is **not** implemented and is not simulated. It appears as a clearly labelled `Coming Soon` surface with no fake controls. The architecture reserves `class_sessions` and a provider-adapter seam so it can be added without schema surgery. Parent portal, mobile app, AI voice and vision, advanced proctoring, research/internship/placement modules and digital badges are likewise reserved, not stubbed.

---

## Decisions taken, and why

1. **Shared-schema multi-tenancy with composite tenant FKs.** Per-tenant schemas do not scale to thousands of institutions. Composite FKs make cross-tenant references structurally impossible rather than merely policed — a guarantee no amount of application code can match.
2. **No public signup.** Every account is provisioned from above, so tenant and role are written before first use and can never be self-selected.
3. **Role immutability by trigger, not policy.** RLS has no column-level granularity; a `BEFORE UPDATE` trigger is the only airtight place to forbid `role` / `institution_id` / `status` changes.
4. **Queued email.** SMTP is the least reliable dependency in the system; it must never be able to fail a database transaction or block a user action.
5. **Authorization-first RAG.** Scope is resolved from the session and applied as a SQL predicate before the model is called. The model is never a participant in access control.
6. **AI suggestions and human decisions in separate columns.** Academic integrity requires the record to show what the machine proposed and what a person decided.
7. **Denormalised `institution_id` everywhere.** Deliberate redundancy bought for index-friendly single-predicate RLS, protected by immutability triggers and composite FKs.
8. **`(SELECT fn())` wrapping in policies.** An InitPlan optimisation that is the difference between a platform that scales and one that does not.
9. **Anthropic as the default AI provider behind an abstraction.** Strong reasoning for tutoring and grading, with the choice kept reversible.
10. **Hosted Supabase dev project.** Forced by the absence of Docker — and it imposes strictly forward-only migration discipline, which is the right habit for production anyway.
