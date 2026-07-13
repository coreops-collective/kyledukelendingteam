-- Lock writes to webhook_subscriptions behind SECURITY DEFINER RPCs.
--
-- Before this migration: the table's RLS policy was
--   for all to anon using (true) with check (true);
-- which means anyone holding the anon key (which ships in the JS bundle)
-- could insert / update / delete rows directly — enough to redirect
-- outbound webhook traffic to any URL of their choosing (data
-- exfiltration vector).
--
-- After this migration: anon can still SELECT (needed so the browser can
-- load the subscription list to fire from), but writes are gone. Every
-- write goes through a security-definer RPC (matches the pattern used
-- for the users table in migration 028).
--
-- The RPCs enforce a role check on the caller. The caller identifies
-- itself with p_caller_id — a bogus id fails the role check and the
-- write is rejected. Not cryptographically strong (attacker with the
-- anon key AND a valid admin user id can still call the RPC), but it's
-- a real bar because user ids are 16-char nanoids not published anywhere.
--
-- Additive-only: the table itself is untouched. Idempotent: safe to
-- re-run.
--
-- Run in Supabase SQL editor.

-- 1. Replace the wide-open policy with a select-only one.
drop policy if exists webhook_subscriptions_all on public.webhook_subscriptions;
drop policy if exists webhook_subscriptions_select on public.webhook_subscriptions;
create policy webhook_subscriptions_select on public.webhook_subscriptions
  for select to anon using (true);

-- Helper: does this user have admin/BM privileges? users.id is uuid; the
-- caller sends text (from the login RPC, which returns id as text), so
-- cast the column so this SQL function passes create-time typechecking
-- and lookups still work when the client sends the raw uuid string.
drop function if exists public._is_admin_user(text);
create or replace function public._is_admin_user(p_caller_id text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id::text = p_caller_id
      and role in ('branch_manager', 'admin')
  );
$$;
revoke all on function public._is_admin_user(text) from public;
grant execute on function public._is_admin_user(text) to anon, authenticated;

-- 2. Write RPCs. All check the caller's role first.
create or replace function public.create_webhook_subscription(
  p_caller_id text,
  p_event text,
  p_filter_status text,
  p_url text,
  p_active boolean,
  p_label text
)
returns table (
  id uuid, event text, filter_status text, url text,
  active boolean, label text,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public._is_admin_user(p_caller_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  insert into public.webhook_subscriptions (event, filter_status, url, active, label)
  values (p_event, p_filter_status, p_url, coalesce(p_active, true), p_label)
  returning webhook_subscriptions.id into new_id;
  return query
    select w.id, w.event, w.filter_status, w.url, w.active, w.label,
           w.created_at, w.updated_at
    from public.webhook_subscriptions w
    where w.id = new_id;
end;
$$;
revoke all on function public.create_webhook_subscription(text, text, text, text, boolean, text) from public;
grant execute on function public.create_webhook_subscription(text, text, text, text, boolean, text) to anon, authenticated;

create or replace function public.update_webhook_subscription(
  p_caller_id text,
  p_id uuid,
  p_event text,
  p_filter_status text,
  p_url text,
  p_active boolean,
  p_label text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin_user(p_caller_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  update public.webhook_subscriptions
  set event         = coalesce(p_event, event),
      filter_status = case when p_filter_status is null then filter_status else nullif(p_filter_status, '') end,
      url           = coalesce(p_url, url),
      active        = coalesce(p_active, active),
      label         = case when p_label is null then label else nullif(p_label, '') end,
      updated_at    = now()
  where id = p_id;
  return found;
end;
$$;
revoke all on function public.update_webhook_subscription(text, uuid, text, text, text, boolean, text) from public;
grant execute on function public.update_webhook_subscription(text, uuid, text, text, text, boolean, text) to anon, authenticated;

create or replace function public.delete_webhook_subscription(
  p_caller_id text,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_admin_user(p_caller_id) then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  delete from public.webhook_subscriptions where id = p_id;
  return found;
end;
$$;
revoke all on function public.delete_webhook_subscription(text, uuid) from public;
grant execute on function public.delete_webhook_subscription(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
