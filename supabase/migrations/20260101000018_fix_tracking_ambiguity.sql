-- ============================================================================
-- 018 · Resolve parameter/column ambiguity in the tracking functions
-- ============================================================================
-- Both tracking functions failed at runtime with:
--
--   column reference "application_ref" is ambiguous
--
-- The parameter is named `application_ref` and so is the column. Qualifying the
-- column as `a.application_ref` is not enough: the OTHER side of the comparison
-- —  bare `application_ref` inside `upper(btrim(...))` — is still ambiguous once
-- the table is in scope, and PL/pgSQL refuses rather than guessing.
--
-- The parameters are qualified with the function name instead of being renamed.
-- PostgREST addresses arguments by name, so renaming them would change the
-- public API and break every caller; `function_name.parameter` disambiguates
-- while leaving the signature untouched.
--
-- Worth noting how this surfaced: PL/pgSQL does not resolve identifiers when a
-- function is created, only when its body executes. Migration 016 applied
-- cleanly and the fault appeared on the first real call — which is why the
-- end-to-end script exercises these functions as an anonymous caller rather
-- than trusting that a successful migration means working code.
-- ============================================================================

create or replace function public.public_request_application_access(
  application_ref text,
  applicant_email text,
  code_hash       text,
  ttl_minutes     integer default 15
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.institution_applications;
  recent integer;
begin
  if code_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid code' using errcode = '22023';
  end if;

  select * into target
    from public.institution_applications a
   where a.application_ref = upper(btrim(public_request_application_access.application_ref))
     and a.applicant_email = lower(btrim(public_request_application_access.applicant_email))
     and a.deleted_at is null;

  -- No match: return NULL rather than raising. The caller responds identically
  -- either way, so this cannot be walked to discover which institutions have
  -- applied to the federation.
  if target.id is null then
    return null;
  end if;

  select count(*) into recent
    from public.application_access_tokens t
   where t.application_id = target.id
     and t.created_at > now() - interval '1 hour';

  if recent >= 5 then
    return null;
  end if;

  insert into public.application_access_tokens (application_id, code_hash, expires_at)
  values (
    target.id,
    public_request_application_access.code_hash,
    now() + make_interval(mins => greatest(1, least(ttl_minutes, 60)))
  );

  return target.id;
end;
$$;

create or replace function public.public_verify_application_access(
  application_ref text,
  code_hash       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.institution_applications;
  token  public.application_access_tokens;
begin
  select * into target
    from public.institution_applications a
   where a.application_ref = upper(btrim(public_verify_application_access.application_ref))
     and a.deleted_at is null;

  if target.id is null then
    return null;
  end if;

  select * into token
    from public.application_access_tokens t
   where t.application_id = target.id
     and t.consumed_at is null
     and t.expires_at > now()
   order by t.created_at desc
   limit 1
   for update;

  if token.id is null then
    return null;
  end if;

  -- Five attempts per code. A six-digit code cannot be brute-forced inside its
  -- fifteen-minute life at that rate.
  if token.attempt_count >= 5 then
    return null;
  end if;

  if token.code_hash <> public_verify_application_access.code_hash then
    update public.application_access_tokens
       set attempt_count = attempt_count + 1
     where id = token.id;
    return null;
  end if;

  update public.application_access_tokens set consumed_at = now() where id = token.id;

  return jsonb_build_object(
    'id', target.id,
    'application_ref', target.application_ref,
    'institution_name', target.institution_name,
    'institution_type', target.institution_type,
    'status', target.status,
    'submitted_at', target.submitted_at,
    'created_at', target.created_at,
    'updated_at', target.updated_at,
    'city', target.city,
    'state', target.state,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'to_status', h.to_status,
               'from_status', h.from_status,
               'comments', h.comments,
               'actor_kind', h.actor_kind,
               'created_at', h.created_at
             ) order by h.created_at)
        from public.institution_application_status_history h
       where h.application_id = target.id
    ), '[]'::jsonb),
    'documents', coalesce((
      select jsonb_agg(jsonb_build_object(
               'document_type', d.document_type,
               'file_name', d.file_name,
               'verification_status', d.verification_status,
               'rejection_reason', d.rejection_reason
             ) order by d.created_at)
        from public.institution_documents d
       where d.institution_application_id = target.id and d.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function
  public.public_request_application_access(text, text, text, integer),
  public.public_verify_application_access(text, text)
from public;

grant execute on function
  public.public_request_application_access(text, text, text, integer),
  public.public_verify_application_access(text, text)
to anon, authenticated, service_role;
