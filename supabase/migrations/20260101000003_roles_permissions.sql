-- ============================================================================
-- 003 · Roles, permissions and their mapping
-- ============================================================================
-- Roles are rows, not an enum, so a future role (HQ_REVIEWER, DEPARTMENT_HEAD,
-- PARENT, EXAMINER) is an INSERT rather than a migration against every table
-- that references it.
--
-- Authorization is answered by PERMISSION, never by role. Application code asks
-- `can(ctx, 'teacher.create')`; it never branches on `role === 'TEACHER'`. A
-- role is only a named bundle of permissions.
--
-- This is system reference data, so it lives in the migration rather than the
-- development seed: the platform is not coherent without it.
-- ============================================================================

create table public.roles (
  code          text primary key
                check (code ~ '^[A-Z][A-Z0-9_]{2,39}$'),
  name          text not null,
  description   text,
  scope         public.authority_scope not null,
  -- System roles are referenced by name in provisioning logic and cannot be
  -- deleted through the application.
  is_system     boolean not null default false,
  rank          smallint not null default 100,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.roles is
  'Named bundles of permissions. Extensible without a schema change.';
comment on column public.roles.rank is
  'Lower rank means broader authority. Used only for ordering in UI, never for authorization.';

create table public.permissions (
  code          text primary key
                check (code ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  resource      text not null,
  action        text not null,
  scope         public.authority_scope not null,
  description   text not null,
  created_at    timestamptz not null default now(),
  unique (resource, action)
);

comment on table public.permissions is
  'The authorization vocabulary. Codes are resource.action and are stable API.';

create table public.role_permissions (
  role_code       text not null references public.roles (code) on delete cascade,
  permission_code text not null references public.permissions (code) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (role_code, permission_code)
);

create index roles_scope_idx on public.roles (scope);
create index permissions_resource_idx on public.permissions (resource);
create index role_permissions_permission_idx on public.role_permissions (permission_code);

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

-- ----------------------------------------------------------------------------
-- The four founding roles
-- ----------------------------------------------------------------------------
insert into public.roles (code, name, description, scope, is_system, rank) values
  ('HQ_ADMIN', 'AFI HQ Administrator',
   'Federation-level authority. Reviews institution applications, monitors the whole network. Assigned only through authorized database administration.',
   'GLOBAL', true, 10),
  ('INSTITUTION_ADMIN', 'Institution Administrator',
   'Manages one institution: its profile, staff, students and academic structure.',
   'TENANT', true, 20),
  ('TEACHER', 'Teacher',
   'Teaches assigned classes and subjects within one institution.',
   'TENANT', true, 30),
  ('STUDENT', 'Student',
   'Learns within one institution. Sees their own records and authorized institution content.',
   'TENANT', true, 40);

-- ----------------------------------------------------------------------------
-- Permission catalogue
--
-- Scoped to what exists in and immediately after Phase 2. Later phases add
-- their own permission rows in their own migrations rather than declaring
-- permissions for features that do not yet exist.
-- ----------------------------------------------------------------------------
insert into public.permissions (code, resource, action, scope, description) values
  -- Federation-level institution governance
  ('institution.read_all',   'institution', 'read_all',   'GLOBAL', 'View every institution in the federation'),
  ('institution.approve',    'institution', 'approve',    'GLOBAL', 'Approve an institution application and provision the tenant'),
  ('institution.reject',     'institution', 'reject',     'GLOBAL', 'Reject an institution application'),
  ('institution.suspend',    'institution', 'suspend',    'GLOBAL', 'Suspend or reactivate an institution'),
  ('institution.read',       'institution', 'read',       'TENANT', 'View own institution profile'),
  ('institution.update',     'institution', 'update',     'TENANT', 'Edit own institution profile'),

  -- Applications
  ('application.read_all',   'application', 'read_all',   'GLOBAL', 'View every institution application'),
  ('application.review',     'application', 'review',     'GLOBAL', 'Take an application under review and record decisions'),
  ('application.request_documents', 'application', 'request_documents', 'GLOBAL', 'Ask an applicant for further documents'),

  -- Documents
  ('document.read_all',      'document',    'read_all',   'GLOBAL', 'View documents belonging to any institution'),
  ('document.verify',        'document',    'verify',     'GLOBAL', 'Mark a document verified or rejected'),
  ('document.read',          'document',    'read',       'TENANT', 'View own institution documents'),
  ('document.upload',        'document',    'upload',     'TENANT', 'Upload documents for own institution'),

  -- Staff
  ('teacher.read_all',       'teacher',     'read_all',   'GLOBAL', 'View teachers across the federation'),
  ('teacher.read',           'teacher',     'read',       'TENANT', 'View teachers in own institution'),
  ('teacher.create',         'teacher',     'create',     'TENANT', 'Provision a teacher account'),
  ('teacher.update',         'teacher',     'update',     'TENANT', 'Edit a teacher record'),
  ('teacher.suspend',        'teacher',     'suspend',    'TENANT', 'Suspend or reactivate a teacher'),

  -- Students
  ('student.read_all',       'student',     'read_all',   'GLOBAL', 'View students across the federation'),
  ('student.read',           'student',     'read',       'TENANT', 'View students in own institution'),
  ('student.read_assigned',  'student',     'read_assigned', 'TENANT', 'View students in classes the teacher is assigned to'),
  ('student.create',         'student',     'create',     'TENANT', 'Provision a student account'),
  ('student.update',         'student',     'update',     'TENANT', 'Edit a student record'),
  ('student.suspend',        'student',     'suspend',    'TENANT', 'Suspend or reactivate a student'),

  -- Academic structure
  ('academic.read',          'academic',    'read',       'TENANT', 'View academic structure'),
  ('academic.manage',        'academic',    'manage',     'TENANT', 'Create and edit departments, programs, years, classes, sections, subjects and courses'),
  ('academic.read_all',      'academic',    'read_all',   'GLOBAL', 'View academic structure across the federation'),

  -- Own profile
  ('profile.read_self',      'profile',     'read_self',  'TENANT', 'View own profile'),
  ('profile.update_self',    'profile',     'update_self','TENANT', 'Edit own non-privileged profile fields'),

  -- Notifications
  ('notification.read_self',  'notification', 'read_self',  'TENANT', 'Read own notifications'),
  ('notification.broadcast',  'notification', 'broadcast',  'TENANT', 'Send notifications within own institution'),

  -- Governance
  ('audit.read',             'audit',       'read',       'GLOBAL', 'Read the federation audit log'),
  ('audit.read_tenant',      'audit',       'read_tenant','TENANT', 'Read own institution audit trail'),
  ('settings.read',          'settings',    'read',       'GLOBAL', 'Read platform settings'),
  ('settings.manage',        'settings',    'manage',     'GLOBAL', 'Change platform settings');

-- ----------------------------------------------------------------------------
-- Role → permission mapping
-- ----------------------------------------------------------------------------

-- HQ holds every GLOBAL permission plus the self-scoped basics. It is
-- deliberately NOT granted tenant write permissions: HQ oversees institutions,
-- it does not operate them.
insert into public.role_permissions (role_code, permission_code)
select 'HQ_ADMIN', code from public.permissions where scope = 'GLOBAL'
union all
select 'HQ_ADMIN', code from public.permissions
where code in ('profile.read_self', 'profile.update_self', 'notification.read_self');

insert into public.role_permissions (role_code, permission_code)
select 'INSTITUTION_ADMIN', code from public.permissions
where code in (
  'institution.read', 'institution.update',
  'document.read', 'document.upload',
  'teacher.read', 'teacher.create', 'teacher.update', 'teacher.suspend',
  'student.read', 'student.create', 'student.update', 'student.suspend',
  'academic.read', 'academic.manage',
  'profile.read_self', 'profile.update_self',
  'notification.read_self', 'notification.broadcast',
  'audit.read_tenant'
);

insert into public.role_permissions (role_code, permission_code)
select 'TEACHER', code from public.permissions
where code in (
  'institution.read',
  'student.read_assigned',
  'academic.read',
  'profile.read_self', 'profile.update_self',
  'notification.read_self'
);

insert into public.role_permissions (role_code, permission_code)
select 'STUDENT', code from public.permissions
where code in (
  'institution.read',
  'academic.read',
  'profile.read_self', 'profile.update_self',
  'notification.read_self'
);
