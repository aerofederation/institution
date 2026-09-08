-- ============================================================================
-- 002 · Enumerated types
-- ============================================================================
-- Enums are used for closed sets that change only with a schema migration.
-- Roles are deliberately NOT an enum: they live in a table so a new role can be
-- added without a migration, which is what keeps the RBAC design extensible.
-- ============================================================================

-- Scope of a role or permission: does it act across the federation, or only
-- inside one institution?
create type public.authority_scope as enum ('GLOBAL', 'TENANT');

-- Lifecycle of a user account.
create type public.user_status as enum (
  'INVITED',      -- provisioned, activation link issued, no password set yet
  'ACTIVE',
  'SUSPENDED',    -- reversible, set by an administrator
  'DEACTIVATED'   -- end of life; retained for referential integrity
);

-- Lifecycle of an institution once it exists as a tenant.
create type public.institution_status as enum (
  'PENDING',      -- record created, provisioning not finished
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED'
);

create type public.institution_type as enum (
  'SCHOOL',
  'COLLEGE',
  'UNIVERSITY',
  'POLYTECHNIC',
  'ENGINEERING_INSTITUTION',
  'TRAINING_INSTITUTE',
  'RESEARCH_INSTITUTION',
  'AEROSPACE_INSTITUTION',
  'AVIATION_INSTITUTION',
  'CORPORATE_ORGANIZATION',
  'CORPORATE_TRAINING_ORGANIZATION',
  'GOVERNMENT_ORGANIZATION',
  'NGO',
  'EDUCATIONAL_ORGANIZATION',
  'OTHER'
);

create type public.institution_category as enum (
  'GOVERNMENT',
  'PRIVATE',
  'AIDED',
  'UNAIDED',
  'AUTONOMOUS',
  'DEEMED',
  'PUBLIC_SECTOR',
  'NON_PROFIT',
  'OTHER'
);

-- The application state machine. Transitions are validated by
-- private.assert_application_transition(); see migration 006.
create type public.application_status as enum (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCUMENTS_REQUIRED',
  'RESUBMISSION_REQUIRED',
  'APPROVED',
  'REJECTED',
  'SUSPENDED'
);

create type public.document_type as enum (
  'REGISTRATION_CERTIFICATE',
  'ACCREDITATION_CERTIFICATE',
  'AFFILIATION_LETTER',
  'RECOGNITION_ORDER',
  'TAX_DOCUMENT',
  'AUTHORIZATION_LETTER',
  'IDENTITY_PROOF',
  'ADDRESS_PROOF',
  'INFRASTRUCTURE_PROOF',
  'OTHER'
);

create type public.verification_status as enum (
  'PENDING',
  'VERIFIED',
  'REJECTED'
);

-- Generic active/inactive marker for academic structure and assignment rows.
create type public.record_status as enum (
  'ACTIVE',
  'INACTIVE',
  'ARCHIVED'
);

create type public.academic_year_status as enum (
  'UPCOMING',
  'ACTIVE',
  'COMPLETED',
  'ARCHIVED'
);

create type public.enrollment_status as enum (
  'ACTIVE',
  'COMPLETED',
  'WITHDRAWN',
  'TRANSFERRED',
  'SUSPENDED'
);

create type public.notification_priority as enum (
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT'
);

create type public.notification_category as enum (
  'ACCOUNT',
  'INSTITUTION',
  'APPLICATION',
  'ACADEMIC',
  'ASSIGNMENT',
  'EXAM',
  'RESULT',
  'ATTENDANCE',
  'CERTIFICATE',
  'ANNOUNCEMENT',
  'EVENT',
  'SYSTEM'
);
