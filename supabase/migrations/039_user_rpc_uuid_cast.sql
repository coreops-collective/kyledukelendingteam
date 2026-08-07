-- 039_user_rpc_uuid_cast.sql
--
-- The delete_user + set_user_password + change_password RPCs were
-- written when public.users.id was still text. It's been uuid for
-- ages, and modern Postgres refuses `uuid = text` without an explicit
-- cast. Every admin operation from the Setup page comes back as
-- "operator does not exist: uuid = text" — Kim couldn't save her
-- password, Missy couldn't be deleted, etc.
--
-- Fix: cast p_target_id::uuid on the WHERE. Rewrites are equivalent
-- otherwise. All three RPCs stay SECURITY DEFINER; the search_path
-- and function signatures are unchanged so no client changes are
-- needed alongside this migration.
--
-- Safe to re-run — `create or replace function` just swaps the body.

create or replace function public.delete_user(p_target_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where id = p_target_id::uuid;
  return found;
end;
$$;
revoke all on function public.delete_user(text) from public;
grant execute on function public.delete_user(text) to anon, authenticated;

create or replace function public.set_user_password(
  p_target_id text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update public.users
     set password_hash = crypt(p_new_password, gen_salt('bf', 10)),
         password = null
   where id = p_target_id::uuid;
  return found;
end;
$$;
revoke all on function public.set_user_password(text, text) from public;
grant execute on function public.set_user_password(text, text) to anon, authenticated;

-- update_user_profile has the same shape. Cast so profile edits stop
-- failing with the same error.
create or replace function public.update_user_profile(
  p_target_id text,
  p_name text,
  p_email text,
  p_initials text,
  p_nmls text,
  p_phone text,
  p_birthday date,
  p_spouse_name text,
  p_spouse_birthday date,
  p_marriage_anniversary date,
  p_work_anniversary date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
     set name              = coalesce(p_name,              name),
         email             = coalesce(p_email,             email),
         initials          = coalesce(p_initials,          initials),
         nmls              = coalesce(p_nmls,              nmls),
         phone             = coalesce(p_phone,             phone),
         birthday          = coalesce(p_birthday,          birthday),
         spouse_name       = coalesce(p_spouse_name,       spouse_name),
         spouse_birthday   = coalesce(p_spouse_birthday,   spouse_birthday),
         marriage_anniversary = coalesce(p_marriage_anniversary, marriage_anniversary),
         work_anniversary  = coalesce(p_work_anniversary,  work_anniversary)
   where id = p_target_id::uuid;
  return found;
end;
$$;
revoke all on function public.update_user_profile(text, text, text, text, text, text, date, text, date, date, date) from public;
grant execute on function public.update_user_profile(text, text, text, text, text, text, date, text, date, date, date) to anon, authenticated;

-- set_user_role has the same shape too. Cast so admins can promote /
-- demote from Setup without hitting the type error.
create or replace function public.set_user_role(
  p_target_id text,
  p_new_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_role not in ('branch_manager', 'admin', 'loan_officer') then
    return false;
  end if;
  update public.users set role = p_new_role where id = p_target_id::uuid;
  return found;
end;
$$;
revoke all on function public.set_user_role(text, text) from public;
grant execute on function public.set_user_role(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
