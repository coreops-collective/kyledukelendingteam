-- Lock the public.users table behind RLS and route login through a
-- SECURITY DEFINER RPC so passwords never leave the database.
--
-- Before this migration: the client did
--   select * from users;
-- and matched email/password in JavaScript. RLS off → passwords readable
-- by anyone holding the anon key (which ships in the JS bundle). RLS on →
-- nobody could read the table at all and login broke.
--
-- After this migration: anon has NO direct read access to users. Login goes
-- through public.login(p_email, p_password), which runs as the function
-- owner (security definer), so it bypasses RLS internally and returns ONLY
-- the matching row's non-password fields. A wrong password returns zero
-- rows — the password never crosses the wire.
--
-- Run in the Supabase SQL editor.

-- 1. Make sure RLS is on for the users table.
alter table public.users enable row level security;

-- 2. Drop any prior version of the login function so the signature stays clean.
drop function if exists public.login(text, text);

-- 3. The login RPC: returns the matching user (without the password column)
--    or zero rows if the credentials don't match. Email match is case-insensitive
--    to mirror the existing client behavior.
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
set search_path = public
as $$
  select u.id, u.name, u.email, u.role, u.initials, coalesce(u.nmls, ''), coalesce(u.phone, '')
  from public.users u
  where lower(u.email) = lower(p_email)
    and u.password = p_password
  limit 1;
$$;

-- 4. Lock down execution: only anon (the unauthenticated browser client) and
--    authenticated clients may invoke it. PUBLIC is revoked so no one else
--    can elevate via this function.
revoke all on function public.login(text, text) from public;
grant execute on function public.login(text, text) to anon, authenticated;

-- 5. Tell PostgREST to refresh its schema cache so the new RPC is callable
--    immediately without restarting the API.
notify pgrst, 'reload schema';
