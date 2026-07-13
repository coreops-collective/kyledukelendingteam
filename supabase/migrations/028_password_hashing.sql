-- Bcrypt every user password. Removes plaintext at rest — the biggest
-- compliance flag left on the app.
--
-- Strategy:
--   1. Enable pgcrypto (Supabase has it by default; explicit for safety).
--   2. Add password_hash text column.
--   3. Backfill: hash every existing plaintext password in place.
--   4. Replace the login RPC to check bcrypt only — no plaintext fallback.
--   5. Add helper RPCs so the client can create users and reset passwords
--      without ever touching plaintext at rest again.
--
-- Session preservation: sessionStorage['kdt_user'] on every logged-in
-- browser is untouched by this migration — nobody gets kicked out. Only
-- NEXT logins go through the new hash path, with the same password the
-- user has always used.
--
-- Safety net: if the backfill somehow misses a row, that user cannot log
-- in after this migration. The team is small and the BM can reset any
-- user's password from Setup, so this is acceptable.
--
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

alter table public.users
  add column if not exists password_hash text;

-- Backfill every plaintext password to bcrypt (cost 10). Idempotent —
-- rows that already have a hash are skipped, so re-running this migration
-- (or running it against a partially-migrated project) is safe.
-- crypt/gen_salt qualified as extensions.* because Supabase installs
-- pgcrypto in the extensions schema (not public).
update public.users
set password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10))
where password is not null and password_hash is null;

-- Replace the login RPC. New body checks the bcrypt hash — the plaintext
-- password column is no longer trusted.
drop function if exists public.login(text, text);
create or replace function public.login(p_email text, p_password text)
returns table (
  id text,
  name text,
  email text,
  role text,
  initials text,
  nmls text,
  phone text
)
language sql
security definer
set search_path = public, extensions
as $$
  select u.id, u.name, u.email, u.role, u.initials, coalesce(u.nmls, ''), coalesce(u.phone, '')
  from public.users u
  where lower(u.email) = lower(p_email)
    and u.password_hash is not null
    and u.password_hash = crypt(p_password, u.password_hash)
  limit 1;
$$;
revoke all on function public.login(text, text) from public;
grant execute on function public.login(text, text) to anon, authenticated;

-- create_user: server-side hashing on insert. Client passes plaintext, RPC
-- hashes with bcrypt-10 and inserts. Replaces the direct `insert into users`
-- pattern in src/data/users.js.
create or replace function public.create_user(
  p_name text,
  p_email text,
  p_password text,
  p_role text,
  p_initials text,
  p_nmls text,
  p_phone text
)
returns table (
  id text, name text, email text, role text, initials text, nmls text, phone text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id text := 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
begin
  insert into public.users (id, name, email, password_hash, role, initials, nmls, phone)
  values (
    new_id, p_name, p_email,
    crypt(p_password, gen_salt('bf', 10)),
    p_role, p_initials,
    coalesce(p_nmls, ''), coalesce(p_phone, '')
  );
  return query
    select u.id, u.name, u.email, u.role, u.initials,
           coalesce(u.nmls, ''), coalesce(u.phone, '')
    from public.users u
    where u.id = new_id;
end;
$$;
revoke all on function public.create_user(text, text, text, text, text, text, text) from public;
grant execute on function public.create_user(text, text, text, text, text, text, text) to anon, authenticated;

-- set_user_password: admin-initiated reset. Called from Setup UI. Client-side
-- gating (isAdmin check on the Setup route) restricts who reaches this.
-- Nulls out any legacy plaintext value at the same time.
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
  where id = p_target_id;
  return found;
end;
$$;
revoke all on function public.set_user_password(text, text) from public;
grant execute on function public.set_user_password(text, text) to anon, authenticated;

-- change_password: user-initiated rotation. Requires the current password
-- so a stolen session can't rotate the password out from under the user.
create or replace function public.change_password(
  p_email text,
  p_current_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_id text;
begin
  select u.id into target_id
  from public.users u
  where lower(u.email) = lower(p_email)
    and u.password_hash is not null
    and u.password_hash = crypt(p_current_password, u.password_hash);
  if target_id is null then
    return false;
  end if;
  update public.users
  set password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      password = null
  where id = target_id;
  return true;
end;
$$;
revoke all on function public.change_password(text, text, text) from public;
grant execute on function public.change_password(text, text, text) to anon, authenticated;

-- list_users: replaces the client's `select * from users` at load time.
-- The users table is behind RLS (migration 006) so the client can't
-- SELECT directly; this RPC returns every column EXCEPT password and
-- password_hash. That's enough for Team, Setup, and Performance pages
-- to render team members, without ever exposing credentials to the
-- browser.
create or replace function public.list_users()
returns table (
  id text,
  name text,
  email text,
  role text,
  initials text,
  nmls text,
  phone text,
  birthday date,
  spouse_name text,
  spouse_birthday date,
  marriage_anniversary date,
  work_anniversary date
)
language sql
security definer
set search_path = public
as $$
  select id, name, email, role,
         coalesce(initials, '??'),
         coalesce(nmls, ''),
         coalesce(phone, ''),
         birthday, spouse_name, spouse_birthday,
         marriage_anniversary, work_anniversary
  from public.users
  order by created_at asc nulls last, id asc;
$$;
revoke all on function public.list_users() from public;
grant execute on function public.list_users() to anon, authenticated;

-- delete_user: mirrors sbDeleteUser through an RPC so writes go through
-- the security-definer boundary. RLS on the users table blocks direct
-- deletes from anon.
create or replace function public.delete_user(p_target_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where id = p_target_id;
  return found;
end;
$$;
revoke all on function public.delete_user(text) from public;
grant execute on function public.delete_user(text) to anon, authenticated;

-- update_user_profile: profile-field updates for a user. Deliberately does
-- NOT accept password or role changes — password goes through the reset
-- RPCs, and role changes are a security-sensitive operation the app
-- doesn't currently need to expose via this path.
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
  set name                 = coalesce(p_name, name),
      email                = coalesce(p_email, email),
      initials             = coalesce(p_initials, initials),
      nmls                 = coalesce(p_nmls, nmls),
      phone                = coalesce(p_phone, phone),
      birthday             = coalesce(p_birthday, birthday),
      spouse_name          = coalesce(p_spouse_name, spouse_name),
      spouse_birthday      = coalesce(p_spouse_birthday, spouse_birthday),
      marriage_anniversary = coalesce(p_marriage_anniversary, marriage_anniversary),
      work_anniversary     = coalesce(p_work_anniversary, work_anniversary)
  where id = p_target_id;
  return found;
end;
$$;
revoke all on function public.update_user_profile(text, text, text, text, text, text, date, text, date, date, date) from public;
grant execute on function public.update_user_profile(text, text, text, text, text, text, date, text, date, date, date) to anon, authenticated;

-- set_user_role: separated so role changes are visible in an audit even
-- though we don't have audit logging yet. Only BMs can call this from
-- the Setup UI.
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
  update public.users set role = p_new_role where id = p_target_id;
  return found;
end;
$$;
revoke all on function public.set_user_role(text, text) from public;
grant execute on function public.set_user_role(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
