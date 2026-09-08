-- ============================================================================
-- 044 · A document material must be able to exist before its file does
-- ============================================================================
-- `materials_payload_coherent` required a DOCUMENT row to carry
-- `storage_path` and `file_name` from the moment it was inserted:
--
--     (material_type = 'DOCUMENT' and storage_path is not null and file_name is not null)
--
-- The file cannot be there at insert. Its storage path is
-- `{institution}/materials/{material_id}/...`, which needs the id of a row that
-- does not exist yet, so the upload can only happen after the insert. The
-- constraint forbade the insert until after the upload, and the upload could
-- not happen until after the insert.
--
-- The result was that creating a study material of type "File upload" failed
-- every single time, with a message about the shape of the row. The form's own
-- hint — "Save first, then attach the file from the list" — described a path
-- that did not exist: the save it asked for was the step being refused. No
-- DOCUMENT material had ever been created in this database.
--
-- What the constraint was protecting is still worth protecting: a student
-- should never be shown a document with nothing behind it. That is a statement
-- about *published* rows, not about every row, so it is now written that way. A
-- draft may be waiting for its file; a published one may not.
-- ============================================================================

alter table public.materials
  drop constraint materials_payload_coherent;

alter table public.materials
  add constraint materials_payload_coherent check (
    (
      material_type = 'DOCUMENT'
      and (
        -- A draft may be waiting for its upload.
        is_published = false
        -- Published means the file is really there.
        or (storage_path is not null and file_name is not null)
      )
    )
    or (material_type = 'LINK' and external_url is not null)
    or (material_type = 'NOTE' and description is not null)
  );

comment on constraint materials_payload_coherent on public.materials is
  'The row must describe something usable. A DOCUMENT may be an unpublished draft awaiting its file, but a published one must carry it.';
