# Aero Federation of India — Digital Institution & AI Education Platform

A multi-tenant platform connecting AEROFEDERATION HEAD QUARTERS, registered institutions, institution
administrators, teachers and students — covering institution onboarding and
verification, academic management, assignments, timed examinations, attendance,
learning materials, a video library, AI-assisted teaching and learning,
analytics, certificates, events and audit.

## Status

Foundation complete: project initialization, database schema, migrations, Row Level
Security, authentication and the security foundation. 24 tables, 108 policies,
9 private storage buckets, 112 passing tests. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full system design and
the phase-by-phase roadmap.

## Getting started

```bash
cp .env.example .env.local   # then fill in the values
npm install
npm run dev
```

Development runs against a **hosted Supabase project** (Docker is not required
and no local stack is assumed). Link it once, then apply migrations:

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_REF"
npm run db:push
npm run db:types
```

## Scripts

| Command            | Purpose                                                   |
| ------------------ | --------------------------------------------------------- |
| `npm run dev`      | Development server                                        |
| `npm run verify`   | `lint` + `typecheck` + `build` — the gate for every phase |
| `npm test`         | Unit, integration and RLS suites                          |
| `npm run test:e2e` | Playwright end-to-end suites                              |
| `npm run db:push`  | Apply migrations to the linked Supabase project           |
| `npm run db:types` | Regenerate `types/database.generated.ts`                  |
| `npm run db:seed`  | Load development seed data                                |

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system architecture, database
  schema, RLS strategy, auth and provisioning flows, AI architecture, roadmap
- [`AGENTS.md`](AGENTS.md) — engineering conventions

## Security posture

Institution data is isolated by shared-schema multi-tenancy with a row-level
tenant discriminator, enforced simultaneously by Row Level Security, composite
foreign keys that carry the tenant, column-immutability triggers, and an
application-layer authorization pipeline. Details in `docs/ARCHITECTURE.md`
§§A.5, B.4, D.
