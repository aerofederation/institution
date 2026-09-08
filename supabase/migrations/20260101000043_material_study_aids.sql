-- ============================================================================
-- 043 · AI study aids for published material
-- ============================================================================
-- A student opens a piece of material and gets a summary, the key points, and
-- practice questions with answers to test themselves against.
--
-- One aid per material, shared by everyone the material was published to —
-- not one per student. The input is the teacher's material, which is identical
-- for the whole class, so per-student generation would produce the same text
-- sixty times and bill for it sixty times. The first student to ask pays for
-- the call; the rest read what is already there.
--
-- That sharing is why the read rule is "can you read the material" rather than
-- "did you generate it". `private.can_read_material()` mirrors
-- `materials_select` exactly, so an aid is never visible to somebody who could
-- not open the thing it summarises.
--
-- The aid is explicitly not assessment. It writes no marks, and the questions
-- it produces are practice — the student sees the answers immediately, which is
-- the opposite of how `assessments` works and is the point.
-- ============================================================================

/*
 * The material visibility test, in one place.
 *
 * Written to match `materials_select` as redefined in migration 024. If that
 * policy changes, this must change with it — which is why it is a function
 * rather than the condition copied into three policies below.
 */
create or replace function private.can_read_material(target_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.materials m
    where m.id = target_material_id
      and (
        m.teacher_id = (select auth.uid())
        or private.oversees_teaching(m.institution_id)
        or (
          m.is_published
          and m.deleted_at is null
          and private.is_active()
          and m.institution_id = private.auth_institution_id()
          and private.has_permission('material.read')
          and private.receives_content(m.class_id, m.section_id)
        )
      )
  );
$$;

comment on function private.can_read_material(uuid) is
  'Whether the caller may read a material. Mirrors materials_select from migration 024; change both together.';

create table public.material_study_aids (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  material_id     uuid not null,

  -- What the model produced, kept as structured data rather than one blob so
  -- the page can render it and the PDF can lay it out.
  summary         text not null check (length(btrim(summary)) between 1 and 8000),
  key_points      text[] not null default '{}',
  questions       jsonb not null default '[]'::jsonb,

  /*
   * What the model was actually given. A summary built from a PDF and one built
   * from the teacher's one-line description are not the same thing, and the
   * student is told which they are looking at rather than left to assume.
   */
  source_kind     text not null check (source_kind in ('NOTE', 'PDF', 'IMAGE', 'DESCRIPTION')),

  model           text not null,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),

  requested_by    uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),

  -- One per material. The unique constraint is what makes the read-through
  -- cache safe when two students press at the same moment.
  constraint study_aids_material_uk unique (material_id),
  constraint study_aids_id_institution_uk unique (id, institution_id),
  constraint study_aids_material_fk
    foreign key (material_id, institution_id)
    references public.materials (id, institution_id) on delete cascade
);

comment on table public.material_study_aids is
  'An AI summary and practice questions for one published material, shared by everyone who can read that material.';

alter table public.material_study_aids enable row level security;

create policy study_aids_select on public.material_study_aids
  for select to authenticated
  using ((select private.can_read_material(material_id)));

/*
 * A student may create one, because a student is who asks for it. They cannot
 * create one for a material they cannot read, which is the only thing that
 * matters here — the content is derived from that material and nothing else.
 */
create policy study_aids_insert on public.material_study_aids
  for insert to authenticated
  with check (
    (select private.is_active())
    and institution_id = (select private.auth_institution_id())
    and requested_by = (select auth.uid())
    and (select private.can_read_material(material_id))
  );

/*
 * No UPDATE policy at all. An aid is a record of what the model said about a
 * material at a point in time; editing it would make the attribution a lie.
 * Regenerating means deleting and asking again, which only the owning teacher
 * may do — a student cannot make their class pay for a second call, and cannot
 * discard a summary their classmates are using.
 */
create policy study_aids_delete_owner on public.material_study_aids
  for delete to authenticated
  using (
    exists (
      select 1
      from public.materials m
      where m.id = material_id
        and m.teacher_id = (select auth.uid())
    )
  );

create index study_aids_material_idx on public.material_study_aids (material_id);
