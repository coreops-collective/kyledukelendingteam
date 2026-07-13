-- Per-IP rate limiting for Netlify functions. Each function calls
-- rate_limit_bump on entry; the RPC upserts a counter row keyed by
-- (ip, endpoint, minute-window) and returns true if the caller is
-- still under the requested per-minute cap, false if they've blown it.
--
-- Fail-open in the function: if the RPC errors or Supabase is down,
-- the function proceeds without a rate limit. That's the right choice
-- for a small-team internal app where availability > lockout — we'd
-- rather Kyle send an email during a Supabase incident than block
-- legitimate use because we couldn't reach the counter table.
--
-- Cleanup: the table grows one row per (ip, endpoint) per minute. A
-- cron-friendly delete of rows older than 24h keeps it bounded. Left as
-- a manual query for now — traffic is tiny so this can wait.
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

create table if not exists public.function_rate_limits (
  ip           text        not null,
  endpoint     text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (ip, endpoint, window_start)
);

create index if not exists function_rate_limits_window_idx
  on public.function_rate_limits(window_start);

alter table public.function_rate_limits enable row level security;

-- Anon has no direct access; the RPC below is the only path in.
drop policy if exists function_rate_limits_none on public.function_rate_limits;
create policy function_rate_limits_none on public.function_rate_limits
  for select to anon using (false);

-- Bump the counter for the current minute. Returns true if the caller
-- is still under the per-minute limit, false if they've exceeded it.
--   p_ip:           client IP (x-forwarded-for or nf-client-connection-ip)
--   p_endpoint:     short identifier for the endpoint being called
--   p_per_minute:   max allowed requests per minute
create or replace function public.rate_limit_bump(
  p_ip text,
  p_endpoint text,
  p_per_minute integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  bucket timestamptz := date_trunc('minute', now());
  new_count integer;
begin
  if p_ip is null or p_ip = '' or p_endpoint is null or p_endpoint = '' then
    return true; -- can't identify caller; don't block
  end if;
  insert into public.function_rate_limits (ip, endpoint, window_start, count)
  values (p_ip, p_endpoint, bucket, 1)
  on conflict (ip, endpoint, window_start)
    do update set count = public.function_rate_limits.count + 1
  returning count into new_count;
  return new_count <= greatest(coalesce(p_per_minute, 60), 1);
end;
$$;
revoke all on function public.rate_limit_bump(text, text, integer) from public;
grant execute on function public.rate_limit_bump(text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
