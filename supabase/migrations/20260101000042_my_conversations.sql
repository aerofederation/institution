-- ============================================================================
-- 042 · The conversation list, with the other person's name
-- ============================================================================
-- `conversations` carries two profile ids and no names, and the obvious join to
-- `profiles` does not work in both directions. `profiles_select` lets a teacher
-- read a student they teach, but gives a student no access to a teacher's
-- record at all — deliberately, since students cannot browse the roster.
--
-- So a student joining `profiles` would get their own conversations back with
-- the other participant's name blank. The alternatives were to widen
-- `profiles_select`, or to snapshot names onto the conversation and let them go
-- stale. This does neither: the list is assembled here, for whoever is asking,
-- with the same participant test the SELECT policy uses.
--
-- The function is SECURITY DEFINER, so the `where` clause below is load-bearing
-- rather than decorative. It is the only thing standing between a caller and
-- somebody else's threads, and it is written to match `conversations_select`.
-- ============================================================================

create or replace function public.my_conversations()
returns table (
  id                   uuid,
  counterpart_id       uuid,
  counterpart_name     text,
  counterpart_role     text,
  last_message_at      timestamptz,
  last_message_preview text,
  last_sender_id       uuid,
  unread_count         bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    case when c.teacher_id = (select auth.uid()) then c.student_id else c.teacher_id end,
    other.full_name,
    case when c.teacher_id = (select auth.uid()) then 'STUDENT' else 'TEACHER' end,
    c.last_message_at,
    c.last_message_preview,
    c.last_sender_id,
    (
      select count(*)
      from public.messages m
      where m.conversation_id = c.id
        and m.sender_id <> (select auth.uid())
        and m.read_at is null
    )
  from public.conversations c
  join public.profiles other
    on other.id = case
         when c.teacher_id = (select auth.uid()) then c.student_id
         else c.teacher_id
       end
  -- The participant test. Everything above depends on this being right.
  where (select auth.uid()) in (c.teacher_id, c.student_id)
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

comment on function public.my_conversations() is
  'The caller''s own conversations with the other participant''s name and unread count. SECURITY DEFINER, so its WHERE clause is the boundary and mirrors conversations_select.';

revoke all on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;

/*
 * The header of one thread. Same reasoning, same boundary — a caller who is not
 * in the conversation gets no row rather than a name they should not see.
 */
create or replace function public.my_conversation(target_id uuid)
returns table (
  id               uuid,
  counterpart_id   uuid,
  counterpart_name text,
  counterpart_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    case when c.teacher_id = (select auth.uid()) then c.student_id else c.teacher_id end,
    other.full_name,
    case when c.teacher_id = (select auth.uid()) then 'STUDENT' else 'TEACHER' end
  from public.conversations c
  join public.profiles other
    on other.id = case
         when c.teacher_id = (select auth.uid()) then c.student_id
         else c.teacher_id
       end
  where c.id = target_id
    and (select auth.uid()) in (c.teacher_id, c.student_id);
$$;

comment on function public.my_conversation(uuid) is
  'One conversation the caller participates in, with the other person''s name. Returns nothing to a non-participant.';

revoke all on function public.my_conversation(uuid) from public, anon;
grant execute on function public.my_conversation(uuid) to authenticated;
