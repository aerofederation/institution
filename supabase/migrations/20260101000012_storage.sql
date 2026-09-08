-- ============================================================================
-- 012 · Supabase Storage — buckets and object policies
-- ============================================================================
-- Every bucket is PRIVATE. Nothing here is served from a public URL; downloads
-- go through a short-lived signed URL minted server-side after the same
-- authorization check that guards the metadata row. The path policies below are
-- the second lock, not the only one.
--
-- Path convention, tenant first, always:
--
--     {institution_id}/{entity_type}/{entity_id}/{uuid}.{ext}
--
-- Making the tenant the FIRST path segment is what allows a policy to be a
-- cheap string comparison against the caller's own institution instead of a
-- join. Pre-approval application documents, which have no institution yet, use
-- the reserved prefix `applications/{application_id}/...`.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('institution-documents',  'institution-documents',  false,  26214400,   -- 25 MiB
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),

  ('teacher-documents',      'teacher-documents',      false,  26214400,
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),

  ('student-documents',      'student-documents',      false,  26214400,
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),

  ('learning-materials',     'learning-materials',     false, 209715200,   -- 200 MiB
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'application/vnd.ms-powerpoint',
           'application/vnd.openxmlformats-officedocument.presentationml.presentation',
           'application/vnd.ms-excel',
           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
           'text/plain', 'text/csv', 'application/zip',
           'audio/mpeg', 'audio/wav', 'audio/ogg']),

  ('videos',                 'videos',                 false, 2147483648,  -- 2 GiB
     array['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska']),

  ('assignment-submissions', 'assignment-submissions', false, 104857600,   -- 100 MiB
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
           'application/msword',
           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
           'text/plain', 'application/zip']),

  ('certificates',           'certificates',           false,  10485760,   -- 10 MiB
     array['application/pdf', 'image/png']),

  ('profile-images',         'profile-images',         false,   5242880,   -- 5 MiB
     array['image/jpeg', 'image/png', 'image/webp']),

  ('event-assets',           'event-assets',           false,  52428800,   -- 50 MiB
     array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ============================================================================
-- Object policies
--
-- Generated per bucket so all nine are provably identical in shape. The tenant
-- test is always `(storage.foldername(name))[1] = auth_institution_id()::text`,
-- with the institution read from the caller's profile — never from the request.
-- ============================================================================
do $$
declare
  b text;
begin
  foreach b in array array[
    'institution-documents', 'teacher-documents', 'student-documents',
    'learning-materials', 'videos', 'assignment-submissions',
    'certificates', 'profile-images', 'event-assets'
  ]
  loop
    -- %1$I is the policy name (bucket names contain hyphens, so it must be
    -- quoted as an identifier); %2$L is the bucket id as a string literal.

    -- Read: HQ oversight, or a live member of the owning tenant.
    execute format($fmt$
      create policy %1$I on storage.objects
        for select to authenticated
        using (
          bucket_id = %2$L
          and (
            (select private.is_hq())
            or (
              (select private.is_active())
              and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
            )
          )
        );
    $fmt$, b || '_read', b);

    -- Write: only into your own tenant's prefix.
    execute format($fmt$
      create policy %1$I on storage.objects
        for insert to authenticated
        with check (
          bucket_id = %2$L
          and (select private.is_active())
          and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
        );
    $fmt$, b || '_insert', b);

    execute format($fmt$
      create policy %1$I on storage.objects
        for update to authenticated
        using (
          bucket_id = %2$L
          and (select private.is_active())
          and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
        )
        with check (
          bucket_id = %2$L
          and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
        );
    $fmt$, b || '_update', b);

    execute format($fmt$
      create policy %1$I on storage.objects
        for delete to authenticated
        using (
          bucket_id = %2$L
          and (select private.is_active())
          and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
        );
    $fmt$, b || '_delete', b);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Pre-approval application documents.
--
-- These are uploaded before any institution or account exists, so they live
-- under `applications/{application_id}/` and cannot be covered by the tenant
-- rule above. HQ reviewers need to read them; nobody else does.
--
-- The anonymous applicant's own upload path is deliberately NOT opened here.
-- It is issued in Phase 8 as a server-minted signed upload URL bound to one
-- object, so `anon` never receives a standing write grant on the bucket.
-- ----------------------------------------------------------------------------
create policy application_documents_read_hq on storage.objects
  for select to authenticated
  using (
    bucket_id = 'institution-documents'
    and (storage.foldername(name))[1] = 'applications'
    and (select private.has_permission('document.read_all'))
  );

-- ----------------------------------------------------------------------------
-- HQ has no institution, so HQ avatars have no tenant prefix to match. They use
-- the reserved `hq/` prefix instead.
-- ----------------------------------------------------------------------------
create policy profile_images_hq on storage.objects
  for all to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = 'hq'
    and (select private.is_hq())
  )
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = 'hq'
    and (select private.is_hq())
  );
