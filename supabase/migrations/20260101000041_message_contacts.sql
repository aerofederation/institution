-- ============================================================================
-- 041 · Who am I allowed to message?
-- ============================================================================
-- A teacher can already list their students: `students_select` admits a row
-- through `private.teaches_student()`, so `listTaughtStudents` needs no help.
--
-- The other direction has no such path. `teachers_select` requires
-- `teacher.read`, which a student does not hold and should not — that
-- permission exposes every member of staff in the institution, and a student
-- needs to see exactly the handful who teach them. Widening it to make a
-- contact list work would trade a real boundary for a convenience.
--
-- So the list is computed here instead, for both directions, by the same
-- pairing rule the conversation INSERT policy enforces. The function returns
-- only people the caller may actually open a conversation with, which means the
-- picker cannot offer a name the database will then refuse.
-- ============================================================================

create or replace function public.my_message_contacts()
returns table (
  profile_id uuid,
  full_name  text,
  subtitle   text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me      uuid := (select auth.uid());
  -- `profiles.role` is text referencing `roles(code)`, not an enum.
  my_role text;
begin
  if me is null then
    return;
  end if;

  -- The caller's own role and standing, read from their profile rather than
  -- from anything the request carried.
  select p.role into my_role
  from public.profiles p
  where p.id = me and p.status = 'ACTIVE';

  if my_role is null then
    return;
  end if;

  if my_role = 'TEACHER' then
    return query
    select
      s.profile_id,
      pr.full_name,
      coalesce(c.name, '') ||
        case when sec.name is not null then ' · ' || sec.name else '' end
    from public.student_enrollments se
    join public.teacher_class_assignments tca
      on tca.class_id = se.class_id
     and tca.academic_year_id = se.academic_year_id
     and (tca.section_id is null or tca.section_id = se.section_id)
    join public.students s on s.profile_id = se.student_id
    join public.profiles pr on pr.id = s.profile_id
    left join public.classes c on c.id = se.class_id
    left join public.sections sec on sec.id = se.section_id
    where tca.teacher_id = me
      and tca.status = 'ACTIVE'
      and se.status = 'ACTIVE'
      and pr.status = 'ACTIVE'
      and s.deleted_at is null
    group by s.profile_id, pr.full_name, c.name, sec.name
    order by pr.full_name;

  elsif my_role = 'STUDENT' then
    return query
    select
      t.profile_id,
      pr.full_name,
      coalesce(c.name, '')
    from public.student_enrollments se
    join public.teacher_class_assignments tca
      on tca.class_id = se.class_id
     and tca.academic_year_id = se.academic_year_id
     and (tca.section_id is null or tca.section_id = se.section_id)
    join public.teachers t on t.profile_id = tca.teacher_id
    join public.profiles pr on pr.id = t.profile_id
    left join public.classes c on c.id = se.class_id
    where se.student_id = me
      and se.status = 'ACTIVE'
      and tca.status = 'ACTIVE'
      and pr.status = 'ACTIVE'
      and t.deleted_at is null
    group by t.profile_id, pr.full_name, c.name
    order by pr.full_name;
  end if;
end;
$$;

comment on function public.my_message_contacts() is
  'The people the caller may open a direct conversation with: a teacher''s students, or a student''s teachers. Same pairing rule as the conversations INSERT policy.';

revoke all on function public.my_message_contacts() from public, anon;
grant execute on function public.my_message_contacts() to authenticated;
