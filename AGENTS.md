# AFI Platform — engineering conventions

Read `docs/ARCHITECTURE.md` before changing anything structural. It is the
authority; this file is the short form.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Framer Motion (`motion`) · Supabase (Postgres, Auth, Storage, RLS, Realtime) ·
Nodemailer · AI behind a provider abstraction.

## Non-negotiable rules

1. **Dual enforcement.** Every data path is guarded twice: the application layer
   (`getSessionContext()` → `authorize()` → service) _and_ Row Level Security.
   Never rely on only one.
2. **`institution_id` never comes from the browser.** Tenancy is read from the
   session context. HQ actors pass an institution id only through an explicitly
   permission-gated parameter.
3. **The service role key is allowlisted.** It lives in `lib/supabase/admin.ts`
   behind `server-only` and may be used only for the operations listed in
   `docs/ARCHITECTURE.md` §A.4.
4. **Permissions, not roles.** Ask `can(ctx, 'exam.publish')`. Never branch on
   `role === 'TEACHER'` in a component.
5. **Components render, services decide, `lib/` provides capability.** A
   component that queries the database, or a service that imports JSX, is a bug.
6. **Validate on the server with the same zod schema.** Client validation is UX.
7. **Email is queued, never sent inline.** Write to `email_outbox`.
8. **AI never decides authorization** and never writes a final grade.
9. **No fake UI.** A button either performs its real operation or the surface is
   labelled `Coming Soon`. No hardcoded dashboard metrics.
10. **Migrations are forward-only.** A pushed migration is immutable; corrections
    ship as a new file.

## Commands

```bash
npm run dev        # development server
npm run verify     # lint + typecheck + build — must pass before every commit
npm test           # unit / integration / RLS suites
npm run test:e2e   # Playwright
npm run db:push    # apply migrations to the linked Supabase project
npm run db:types   # regenerate types/database.generated.ts
```

## Layout

`app/` routes (grouped per role) · `components/` presentation ·
`lib/` capability · `services/` business logic · `supabase/` migrations & seed ·
`tests/` unit, integration, rls, e2e · `docs/` architecture, runbook, security.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
