-- ============================================================================
-- 040 · Direct messaging between one teacher and one student
-- ============================================================================
-- A conversation has exactly two participants and no third party can read it.
-- Not the other students, not the other teachers, not the institution
-- administrator, not HQ. That is stronger than the rest of this schema, where
-- an administrator can generally see their institution's teaching, and it is
-- deliberate: a private message between two named people is not institutional
-- content.
--
-- The pairing rule is the load-bearing part. A conversation may only exist
-- between a teacher and a student the teacher actually teaches, decided by the
-- same ACTIVE-assignment-meets-ACTIVE-enrolment rule as everything else. So a
-- teacher cannot open a channel to an arbitrary child in the institution, and a
-- student cannot open one to an arbitrary member of staff.
--
-- Both participants are profile ids. `teachers.profile_id` and
-- `students.profile_id` are the primary keys of those tables, so `teacher_id`
-- and `student_id` are directly comparable to `auth.uid()` and the policies
-- need no join to establish who is asking.
-- ============================================================================

-- ── Permission ──────────────────────────────────────────────────────────────
-- Messaging is participant-scoped, so this permission does not decide who may
-- read what — the policies below do. It exists so the surface can be withdrawn
-- from a role without dropping the tables.

insert into public.permissions (code, resource, action, scope, description)
values ('message.participate', 'message', 'participate', 'TENANT',
        'Hold direct conversations with the teachers or students one is paired with')
on conflict (code) do nothing;

insert into public.role_permissions (role_code, permission_code)
select r, 'message.participate'
from unnest(array['TEACHER', 'STUDENT']) as r
on conflict do nothing;

-- ── Who is paired with whom ─────────────────────────────────────────────────
/*
 * `private.teaches_student()` already answers this, but only about the caller:
 * it hard-codes `tca.teacher_id = auth.uid()`. A student opening a conversation
 * needs the same question asked about somebody else — "does this teacher teach
 * me" — so the pair is parameterised here and the existing helper is left
 * alone.
 */
create or replace function private.teacher_teaches_student(
  target_teacher_id uuid,
  target_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.student_enrollments se
    join public.teacher_class_assignments tca
      on tca.class_id = se.class_id
     and tca.academic_year_id = se.academic_year_id
     and (tca.section_id is null or tca.section_id = se.section_id)
    where se.student_id = target_student_id
      and se.status = 'ACTIVE'
      and tca.teacher_id = target_teacher_id
      and tca.status = 'ACTIVE'
  );
$$;

comment on function private.teacher_teaches_student(uuid, uuid) is
  'Whether a named teacher reaches a named student through an ACTIVE assignment matching an ACTIVE enrolment. Parameterised so a student can ask it about a teacher.';

-- ── Conversations ───────────────────────────────────────────────────────────

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,

  teacher_id      uuid not null,
  student_id      uuid not null,
  started_by      uuid not null references public.profiles (id) on delete cascade,

  /*
   * Denormalised so the conversation list renders without reading messages.
   * Maintained by a trigger, never written by a client — participants hold no
   * UPDATE policy on this table.
   */
  last_message_at      timestamptz,
  last_message_preview text check (last_message_preview is null or length(last_message_preview) <= 200),
  last_sender_id       uuid,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One thread per pair. A second "New chat" press reopens the first.
  constraint conversations_pair_uk unique (teacher_id, student_id),
  constraint conversations_id_institution_uk unique (id, institution_id),
  constraint conversations_distinct_ck check (teacher_id <> student_id),

  /*
   * Composite, carrying institution_id. A teacher and a student from different
   * institutions cannot be placed in one conversation even by the service role,
   * because there is no row in `teachers` or `students` to satisfy both halves.
   */
  constraint conversations_teacher_fk
    foreign key (teacher_id, institution_id)
    references public.teachers (profile_id, institution_id) on delete cascade,
  constraint conversations_student_fk
    foreign key (student_id, institution_id)
    references public.students (profile_id, institution_id) on delete cascade
);

create index conversations_teacher_idx on public.conversations (teacher_id, last_message_at desc nulls last);
create index conversations_student_idx on public.conversations (student_id, last_message_at desc nulls last);

comment on table public.conversations is
  'A private thread between one teacher and one student who are actually paired by teaching. Readable only by those two.';

-- ── Messages ────────────────────────────────────────────────────────────────

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  institution_id  uuid not null references public.institutions (id) on delete cascade,
  conversation_id uuid not null,
  sender_id       uuid not null references public.profiles (id) on delete cascade,

  body            text check (body is null or length(body) <= 4000),

  -- Attachment. The object itself lives in `message-attachments`, under a
  -- prefix keyed by conversation so the storage policy can scope to the pair.
  storage_path    text,
  file_name       text check (file_name is null or length(file_name) between 1 and 255),
  mime_type       text check (mime_type is null or length(mime_type) <= 128),
  file_size       integer check (file_size is null or file_size between 1 and 26214400),

  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A message is text, or a file, or both — never neither.
  constraint messages_content_ck check (
    (body is not null and length(btrim(body)) > 0) or storage_path is not null
  ),
  -- An attachment is all four columns or none of them, so a half-written row
  -- cannot render as a broken download.
  constraint messages_attachment_ck check (
    (storage_path is null and file_name is null and mime_type is null and file_size is null)
    or (storage_path is not null and file_name is not null and mime_type is not null and file_size is not null)
  ),

  constraint messages_id_institution_uk unique (id, institution_id),
  constraint messages_conversation_fk
    foreign key (conversation_id, institution_id)
    references public.conversations (id, institution_id) on delete cascade
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
-- Drives the unread badge; partial so it stays small as history grows.
create index messages_unread_idx on public.messages (conversation_id, sender_id)
  where read_at is null;

comment on table public.messages is
  'One message in a conversation. Readable and writable only by the two participants; the body is immutable once sent.';

-- ── Am I in this conversation? ──────────────────────────────────────────────
/*
 * SECURITY DEFINER because the message policies consult `conversations`, and a
 * participant reaching a message must not depend on their also passing the
 * conversation SELECT policy — that would make the two policies load-bearing
 * for each other and any future edit to one silently change the other.
 */
create or replace function private.in_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = target_conversation_id
      and (select auth.uid()) in (c.teacher_id, c.student_id)
  );
$$;

comment on function private.in_conversation(uuid) is
  'Whether the caller is one of the two participants in a conversation.';

/*
 * The storage policy has only a path to work with, and a folder segment is
 * text. Casting it inline would raise 22P02 on a malformed name rather than
 * denying access, and Postgres gives no ordering guarantee that would let a
 * regex test upstream of the cast protect it — so the cast is done here, where
 * it can fail closed.
 */
create or replace function private.in_conversation_path(folder text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conversation_id uuid;
begin
  begin
    conversation_id := folder::uuid;
  exception when others then
    return false;
  end;

  return private.in_conversation(conversation_id);
end;
$$;

comment on function private.in_conversation_path(text) is
  'Participant test for a storage path segment. A segment that is not a uuid denies rather than raising.';

-- ── Triggers ────────────────────────────────────────────────────────────────

create trigger conversations_set_updated_at before update on public.conversations
  for each row execute function private.set_updated_at();
create trigger conversations_freeze_institution before update on public.conversations
  for each row execute function private.freeze_institution_id();

create trigger messages_set_updated_at before update on public.messages
  for each row execute function private.set_updated_at();
create trigger messages_freeze_institution before update on public.messages
  for each row execute function private.freeze_institution_id();

/*
 * A sent message is a record of what was said. The UPDATE policy exists only so
 * the recipient can mark it read; this refuses every other column change, so
 * neither participant can rewrite history after the fact.
 */
create or replace function private.guard_message_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.conversation_id is distinct from old.conversation_id
  or new.sender_id       is distinct from old.sender_id
  or new.body            is distinct from old.body
  or new.storage_path    is distinct from old.storage_path
  or new.file_name       is distinct from old.file_name
  or new.mime_type       is distinct from old.mime_type
  or new.file_size       is distinct from old.file_size
  or new.created_at      is distinct from old.created_at then
    raise exception 'a message cannot be edited once it has been sent'
      using errcode = '42501';
  end if;

  -- Only the recipient marks a message read; a sender doing so would make the
  -- other person's read receipt a fiction.
  if new.read_at is distinct from old.read_at
     and new.sender_id = (select auth.uid()) then
    raise exception 'a sender cannot mark their own message read'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger messages_guard_columns before update on public.messages
  for each row execute function private.guard_message_columns();

/*
 * Keeps the conversation list current. SECURITY DEFINER because participants
 * hold no UPDATE policy on `conversations` and should not: the summary is
 * derived from what was actually sent, not something a client may assert.
 */
create or replace function private.touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_sender_id  = new.sender_id,
      last_message_preview = coalesce(
        nullif(left(btrim(new.body), 200), ''),
        new.file_name
      )
  where id = new.conversation_id;

  return new;
end;
$$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function private.touch_conversation();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.conversations enable row level security;
alter table public.messages      enable row level security;

/*
 * No HQ clause and no administrator clause anywhere below. Oversight of an
 * institution does not extend to reading two named people's private messages,
 * and the absence is the policy.
 */

create policy conversations_select on public.conversations
  for select to authenticated
  using (
    (select private.is_active())
    and (select auth.uid()) in (teacher_id, student_id)
  );

create policy conversations_insert on public.conversations
  for insert to authenticated
  with check (
    (select private.is_active())
    and (select private.has_permission('message.participate'))
    and institution_id = (select private.auth_institution_id())
    -- You can only start a conversation you are in.
    and (select auth.uid()) in (teacher_id, student_id)
    -- And only with somebody you are actually paired with by teaching.
    and (select private.teacher_teaches_student(teacher_id, student_id))
  );

create policy messages_select on public.messages
  for select to authenticated
  using (
    (select private.is_active())
    and (select private.in_conversation(conversation_id))
  );

create policy messages_insert on public.messages
  for insert to authenticated
  with check (
    (select private.is_active())
    and (select private.has_permission('message.participate'))
    and institution_id = (select private.auth_institution_id())
    -- The sender is whoever is asking. There is no path by which a client
    -- can post as somebody else.
    and sender_id = (select auth.uid())
    and (select private.in_conversation(conversation_id))
  );

-- Marking read. The guard trigger above limits this to `read_at`.
create policy messages_update_read on public.messages
  for update to authenticated
  using (
    (select private.is_active())
    and (select private.in_conversation(conversation_id))
  )
  with check (
    (select private.in_conversation(conversation_id))
  );

-- ── Realtime ────────────────────────────────────────────────────────────────
/*
 * Delivery without a refresh. Realtime re-runs the SELECT policy above for each
 * subscriber before forwarding a row, so a subscription that asked for somebody
 * else's conversation receives nothing — the filter in the client is a
 * convenience, not the boundary.
 */
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
    alter publication supabase_realtime add table public.conversations;
  end if;
end $$;

-- `postgres_changes` sends only the primary key on UPDATE and DELETE unless the
-- table replicates its full row. Read receipts need the whole row to be useful.
alter table public.messages      replica identity full;
alter table public.conversations replica identity full;

-- ── Attachments ─────────────────────────────────────────────────────────────
/*
 * A separate bucket, because the shared buckets in migration 012 are scoped to
 * the tenant: every active member of an institution can read every object in
 * them. That is right for study material and wrong for a private message, so
 * these objects are scoped to the two participants instead.
 *
 * Path: {institution_id}/{conversation_id}/{uuid}.{ext}
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('message-attachments', 'message-attachments', false, 26214400,  -- 25 MiB
    array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'text/plain', 'text/csv'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy message_attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-attachments'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
    and (select private.in_conversation_path((storage.foldername(name))[2]))
  );

create policy message_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-attachments'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
    and (select private.in_conversation_path((storage.foldername(name))[2]))
  );

/*
 * No UPDATE policy: an attachment is part of a sent message, and replacing the
 * object underneath one would rewrite what the other person received.
 */
create policy message_attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-attachments'
    and (select private.is_active())
    and (storage.foldername(name))[1] = (select private.auth_institution_id())::text
    and (select private.in_conversation_path((storage.foldername(name))[2]))
  );
