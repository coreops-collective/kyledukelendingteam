-- 058_lock_down_users_table.sql
--
-- Phase 3 of the hardening plan, plus the email guard that today's outage
-- earned its way onto the front of the queue.
--
-- ==================================================================
-- WHAT THIS CLOSES
--
-- public.users carries full INSERT/UPDATE/DELETE grants for `anon` and
-- `authenticated`, plus a policy (users_auth_all) with USING(true) and
-- WITH CHECK(true). Any signed-in user can therefore:
--
--     PATCH /rest/v1/users?id=eq.<self>   {"role":"admin"}
--
-- and become an admin. They can also rewrite anyone's password_hash, delete
-- rows, and read every hash for offline cracking. Phase 1 verified callers
-- at the FUNCTION layer; this is the table layer underneath it, and it is
-- the actual self-promotion path.
--
-- Verified safe before writing: EVERY client write to public.users already
-- goes through a SECURITY DEFINER RPC (create_user, set_user_password,
-- change_password, set_user_role, delete_user, update_user_profile). The
-- only direct table access from the app is a SELECT in
-- src/lib/auth.js:101 (loadProfileByEmail, columns id,name,email,role).
-- SECURITY DEFINER functions bypass grants and RLS, so revoking client
-- write access breaks nothing.
--
-- ==================================================================
-- THE EMAIL GUARD
--
-- On 2026-09-18 two public.users emails were edited without the matching
-- auth.users change. Login authenticates against auth.users then resolves
-- the profile from public.users BY EMAIL, so the mismatch produced
-- "Invalid login credentials" for the new address and a null role for the
-- old one. Both admins were affected; with Setup gated on admin and
-- admin-set-user-password disabled, a full lockout was one sign-out away.
--
-- update_user_profile happily writes `email`, and it is what the Setup edit
-- form calls. It now refuses an email change outright. Changing a login
-- address is a two-table operation (auth.users + auth.identities) and does
-- not belong behind a profile form.
--
-- ==================================================================
-- DELIBERATELY NOT IN THIS MIGRATION
--
-- No caller guard on update_user_profile. /team has NO role gate — not in
-- App.jsx, not in the sidebar, not inside the view — and Team.jsx:479 edits
-- team birthdays and spouse dates through this same RPC. Requiring admin
-- would silently remove a capability Abel plausibly uses day to day and
-- that nobody asked to remove. Who may edit whose profile is a Phase 4
-- decision; this migration only stops the email field moving.
--
-- The Kim-cannot-act-on-Kyle rule is also Phase 4. _require_admin() here is
-- the coarse gate (branch_manager + admin); the per-target matrix layers on
-- top of it.
--
-- ==================================================================
-- REVERSAL (exact — run in this order):
--
--   -- 1. restore the wide-open policy and grants
--   drop policy if exists users_auth_select on public.users;
--   create policy users_auth_all on public.users
--     for all to authenticated using (true) with check (true);
--   grant select, insert, update, delete on public.users to anon, authenticated;
--
--   -- 2. drop the guards (bodies below are the verbatim originals)
--   create or replace function public.set_user_password(p_target_id text, p_new_password text)
--   returns boolean language plpgsql security definer set search_path to 'public','extensions'
--   as $$ begin update public.users set password_hash = crypt(p_new_password, gen_salt('bf', 10)), password = null where id = p_target_id::uuid; return found; end; $$;
--
--   create or replace function public.set_user_role(p_target_id text, p_new_role text)
--   returns boolean language plpgsql security definer set search_path to 'public'
--   as $$ begin if p_new_role not in ('branch_manager','admin','loan_officer_assistant','loan_officer') then return false; end if; update public.users set role = p_new_role where id = p_target_id::uuid; return found; end; $$;
--
--   create or replace function public.delete_user(p_target_id text)
--   returns boolean language plpgsql security definer set search_path to 'public'
--   as $$ begin delete from public.users where id = p_target_id::uuid; return found; end; $$;
--
--   -- update_user_profile and create_user originals are in migration 028/040.
--   drop function if exists public._require_admin();
--   drop function if exists public._caller_app_user();
--
-- NOTE: if _require_admin() misbehaves, only user administration degrades.
-- Login, every data read, and every other page keep working. But none of the
-- three staff can run SQL — recovery needs the Supabase dashboard.
-- ==================================================================
--
-- Re-runnable: every statement is IF EXISTS / OR REPLACE / IF NOT EXISTS.

-- ── Caller identity ────────────────────────────────────────────────
-- Derived from the JWT, never from a parameter. Supabase Auth is live, so
-- auth.jwt()->>'email' is issuer-signed and cannot be forged. The existing
-- _is_admin_user(p_caller_id) takes a client-supplied id and is therefore
-- useless as a guard; it is left in place but unused.
--
-- auth.users and public.users are joined only by email, so a unique index on
-- lower(email) keeps that join single-valued. Verified: no duplicates today.
create unique index if not exists users_email_lower_key
  on public.users (lower(email));

create or replace function public._caller_app_user()
returns public.users
language sql stable security definer set search_path to 'public'
as $$
  select u.* from public.users u
   where lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
   order by u.created_at nulls last, u.id
   limit 1;
$$;

create or replace function public._require_admin()
returns public.users
language plpgsql stable security definer set search_path to 'public'
as $$
declare caller public.users;
begin
  caller := public._caller_app_user();
  if caller.id is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- coalesce is load-bearing: `NULL not in (...)` evaluates to NULL, and
  -- IF NULL does not branch, so without it a user whose role is NULL would
  -- pass straight through the guard.
  if coalesce(caller.role, '') not in ('branch_manager', 'admin') then
    raise exception 'admin privileges required' using errcode = '42501';
  end if;
  return caller;
end;
$$;

-- FROM PUBLIC, not from the named roles. PostgreSQL grants EXECUTE on a newly
-- created function to PUBLIC by default, and revoking from anon/authenticated
-- leaves that PUBLIC grant in place — the revoke is a no-op and the helpers
-- stay callable by everyone. That matters most for _caller_app_user: it is
-- SECURITY DEFINER and returns a whole public.users row, so it bypasses the
-- column grants below and would hand a caller their own password_hash.
--
-- _is_admin_user from an earlier migration shows the intended end state:
-- postgres=X | service_role=X, with no PUBLIC entry.
revoke execute on function public._caller_app_user() from public;
revoke execute on function public._require_admin()   from public;

-- ── Guards on the four RPCs with no legitimate non-admin use ───────
create or replace function public.set_user_password(p_target_id text, p_new_password text)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare caller public.users;
begin
  caller := public._require_admin();
  if length(coalesce(p_new_password, '')) < 12 then
    raise exception 'password must be at least 12 characters' using errcode = '22023';
  end if;
  update public.users
     set password_hash = crypt(p_new_password, gen_salt('bf', 10)), password = null
   where id = p_target_id::uuid;
  return found;
end;
$$;

create or replace function public.set_user_role(p_target_id text, p_new_role text)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare caller public.users;
begin
  caller := public._require_admin();
  if p_new_role not in ('branch_manager','admin','loan_officer_assistant','loan_officer') then
    return false;
  end if;
  -- Never let the team demote its way to zero admins.
  if p_new_role not in ('branch_manager','admin')
     and (select count(*) from public.users
           where role in ('branch_manager','admin') and id <> p_target_id::uuid) = 0 then
    raise exception 'cannot demote the last admin' using errcode = '23514';
  end if;
  update public.users set role = p_new_role where id = p_target_id::uuid;
  return found;
end;
$$;

create or replace function public.delete_user(p_target_id text)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare caller public.users;
begin
  caller := public._require_admin();
  if caller.id = p_target_id::uuid then
    raise exception 'you cannot delete your own account' using errcode = '23514';
  end if;
  if (select count(*) from public.users
       where role in ('branch_manager','admin') and id <> p_target_id::uuid) = 0 then
    raise exception 'cannot delete the last admin' using errcode = '23514';
  end if;
  delete from public.users where id = p_target_id::uuid;
  return found;
end;
$$;

-- Signature and body kept byte-for-byte as they are in production, with only
-- the guard and the role check prepended.
--
-- NOTE, and it is not a small one: this function is ALREADY BROKEN and this
-- migration deliberately does not fix it. `new_id` is built as
-- 'u_' || substr(...) — a text value — and inserted into public.users.id,
-- which is uuid. That raises `invalid input syntax for type uuid` every time,
-- so Add User does not work and has not for some time. Repairing it means
-- changing what ids new users get, which deserves its own change with its own
-- testing rather than riding along inside a security migration.
create or replace function public.create_user(
  p_name text, p_email text, p_password text, p_role text,
  p_initials text, p_nmls text, p_phone text)
returns table(id text, name text, email text, role text,
              initials text, nmls text, phone text)
language plpgsql security definer set search_path to 'public', 'extensions'
as $$
declare
  caller public.users;
  new_id text := 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14);
begin
  caller := public._require_admin();
  if p_role not in ('branch_manager','admin','loan_officer_assistant','loan_officer') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;
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

-- ── Email guard ────────────────────────────────────────────────────
-- No caller guard here on purpose (see the header). The email column simply
-- stops moving through this path.
create or replace function public.update_user_profile(
  p_target_id text, p_name text, p_email text, p_initials text, p_nmls text,
  p_phone text, p_birthday date, p_spouse_name text, p_spouse_birthday date,
  p_marriage_anniversary date, p_work_anniversary date)
returns boolean language plpgsql security definer set search_path to 'public'
as $$
declare v_current_email text;
begin
  select email into v_current_email from public.users where id = p_target_id::uuid;

  -- The Setup form posts every field on save, so an unchanged email arrives
  -- here on every edit. Only an actual change is refused.
  if p_email is not null and lower(p_email) is distinct from lower(v_current_email) then
    raise exception
      'Login email cannot be changed here. It must be updated in Supabase Auth (auth.users AND auth.identities) at the same time, or the account can no longer sign in.'
      using errcode = '42501';
  end if;

  update public.users
     set name                 = coalesce(p_name, name),
         -- email deliberately omitted
         initials             = coalesce(p_initials, initials),
         nmls                 = coalesce(p_nmls, nmls),
         phone                = coalesce(p_phone, phone),
         birthday             = coalesce(p_birthday, birthday),
         spouse_name          = coalesce(p_spouse_name, spouse_name),
         spouse_birthday      = coalesce(p_spouse_birthday, spouse_birthday),
         marriage_anniversary = coalesce(p_marriage_anniversary, marriage_anniversary),
         work_anniversary     = coalesce(p_work_anniversary, work_anniversary)
   where id = p_target_id::uuid;
  return found;
end;
$$;

-- ── Self-service password change, bound to the caller ──────────────
-- Previously any authenticated user could aim this at any address they knew
-- the current password for. Now it can only target the caller's own account.
-- Body kept as it is in production; only the self-binding guard is added.
--
-- NOTE: this one is very likely broken too, and again is left alone on
-- purpose. `target_id` is declared text while public.users.id is uuid, so
-- `where id = target_id` has no matching operator and raises. Same reasoning
-- as create_user — a real fix belongs in its own change with a test, not
-- smuggled into a security migration.
create or replace function public.change_password(
  p_email text, p_current_password text, p_new_password text)
returns boolean language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  target_id text;
begin
  if lower(coalesce(p_email, '')) is distinct from lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'you can only change your own password' using errcode = '42501';
  end if;
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

-- ── Table lockdown ─────────────────────────────────────────────────
-- Writes now only reach public.users through the guarded SECURITY DEFINER
-- functions above, which bypass these grants.
-- `revoke all` rather than naming privileges: the relacl is arwdDxtm, so
-- listing insert/update/delete/truncate leaves x (REFERENCES) and t (TRIGGER)
-- in place. Not reachable over PostgREST today, but a lockdown shouldn't
-- leave residue. SELECT is re-granted per column below.
revoke all on public.users from anon, authenticated;

drop policy if exists users_auth_all on public.users;
drop policy if exists users_auth_select on public.users;
create policy users_auth_select on public.users
  for select to authenticated using (true);

-- Hide the hashes. A table-level GRANT SELECT covers every column, so the
-- grant has to be dropped and re-issued per column — revoking the two
-- columns alone would be a no-op. The `revoke all` above already dropped the
-- table-level SELECT, so this only has to re-issue the columns.
--
-- Safe because loadProfileByEmail (src/lib/auth.js:101) selects
-- id,name,email,role explicitly and is the app's ONLY direct read; list_users
-- is SECURITY DEFINER and bypasses grants entirely, as do the Netlify
-- functions via the service role. Verified in review: nothing in src/,
-- netlify/ or scripts/ does select('*') on users.
grant select (
  id, name, email, role, initials, nmls, phone,
  created_at, updated_at, birthday, spouse_name, spouse_birthday,
  marriage_anniversary, work_anniversary
) on public.users to authenticated;

notify pgrst, 'reload schema';
