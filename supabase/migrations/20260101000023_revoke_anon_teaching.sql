-- ============================================================================
-- 023 · Close the anon grants that arrive with every new table
-- ============================================================================
-- Supabase ships `ALTER DEFAULT PRIVILEGES` that grant `anon`, `authenticated`
-- and `service_role` full table privileges on anything created in `public`.
-- Migration 011 revoked them from `anon` — but a revoke applies to the tables
-- that exist when it runs, not to tables created afterwards.
--
-- So the eight tables in migration 020 arrived with `anon` holding SELECT,
-- INSERT, UPDATE and DELETE, `assessment_options` — the answer key — among
-- them. RLS still stood in front of every row and there is no `anon` policy on
-- any of those tables, so nothing was actually reachable. But "no privilege"
-- and "a privilege that policies happen to neutralise" are different
-- guarantees, and this platform's invariant is the first one: `anon` reads the
-- public site through SECURITY DEFINER projections and holds nothing else.
--
-- The revoke is repeated here for the new tables, and the default itself is
-- changed so the next migration to add a table does not reopen it.
-- ============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- Stops it recurring. Applies to objects created from now on by the role that
-- runs migrations, which is how every table in this schema comes into being.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

/*
 * `authenticated` keeps its table privileges: RLS is what constrains it, and
 * the policies in 011 and 021 are written on that basis. Revoking here would
 * lock every signed-in user out of the application entirely.
 *
 * Function grants are untouched. The public application RPCs
 * (`public_start_application` and the rest) are granted to `anon` on purpose —
 * they are the only way an unauthenticated visitor reaches any data, and each
 * one decides for itself what it will project.
 */
