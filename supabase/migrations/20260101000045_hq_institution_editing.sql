-- ============================================================================
-- 045 · HQ may correct an institution's details
-- ============================================================================
-- `institutions_update_hq` already permits the row to be updated by anyone
-- holding `institution.suspend`, and that policy has no column restriction — so
-- the capability was already there. What was missing was a permission that
-- says what it is.
--
-- Suspending an institution and correcting its registered address are different
-- acts with different consequences, and an audit trail that records both as
-- "held institution.suspend" tells a reader nothing. So the edit gets its own
-- GLOBAL permission, granted to HQ, and the policy accepts either.
--
-- Note what this does NOT do. It is an oversight capability, not a takeover:
-- HQ still holds no tenant permissions, cannot enter an institution's
-- workspace, and cannot act as one of its administrators. Editing the
-- federation's own record of an institution is HQ's business; running the
-- institution is not.
-- ============================================================================

insert into public.permissions (code, resource, action, scope, description)
values ('institution.update_all', 'institution', 'update_all', 'GLOBAL',
        'Correct any institution''s registered details')
on conflict (code) do nothing;

/*
 * HQ_ADMIN is granted every GLOBAL permission by migration 003, but that grant
 * ran once against the rows that existed then. A permission added later needs
 * granting explicitly.
 */
insert into public.role_permissions (role_code, permission_code)
values ('HQ_ADMIN', 'institution.update_all')
on conflict do nothing;

drop policy if exists institutions_update_hq on public.institutions;

create policy institutions_update_hq on public.institutions
  for update to authenticated
  using (
    (select private.has_permission('institution.suspend'))
    or (select private.has_permission('institution.update_all'))
  )
  with check (
    (select private.has_permission('institution.suspend'))
    or (select private.has_permission('institution.update_all'))
  );

comment on policy institutions_update_hq on public.institutions is
  'HQ may change an institution''s standing (institution.suspend) or correct its details (institution.update_all). Neither grants any tenant capability.';
