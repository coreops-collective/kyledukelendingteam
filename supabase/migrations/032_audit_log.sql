-- Regulator-friendly audit trail. One row per business-meaningful
-- action: who did it, what they did, which record, when, and enough
-- detail JSON to reconstruct the change.
--
-- Actions we care about (client-driven, written via public.audit_write):
--   auth.login_success / auth.login_failed
--   user.created / user.updated / user.deleted / user.role_changed
--   user.password_reset (admin-initiated) / user.password_changed (user rotation)
--   loan.created / loan.status_changed / loan.deleted / loan.updated
--   task.completed / task.deleted / task.created
--   partner.created / partner.deleted / partner.updated
--   webhook.created / webhook.updated / webhook.deleted
--   settings.email_delivery_updated
--
-- Storage strategy: append-only. No update, no delete via the app.
-- RLS blocks selects for anon; only privileged operators (via SQL
-- editor / service role) can read the log. That's the right posture
-- for an audit trail — visibility is a decision for later.
--
-- Idempotent. Run in Supabase SQL editor.

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_id      text,
  actor_email   text,
  action        text not null,
  entity_type   text,
  entity_id     text,
  details       jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_actor_created_idx
  on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_entity_idx
  on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_action_idx
  on public.audit_log (action, created_at desc);

alter table public.audit_log enable row level security;

-- Anon has no direct access; the RPC below is the only write path in,
-- and reads happen server-side (SQL editor / service role) or via a
-- future admin RPC that we'll add when there's actually a UI for it.
drop policy if exists audit_log_none on public.audit_log;
create policy audit_log_none on public.audit_log
  for select to anon using (false);

-- Append-only write. Trusts the caller's actor identity — the client
-- fills it from the current session. That's the same trust model as
-- the rest of the app (short of migrating to Supabase Auth JWTs), and
-- the value here is having the trail, not preventing an attacker who
-- already has the anon key from lying about who they were.
create or replace function public.audit_write(
  p_actor_id    text,
  p_actor_email text,
  p_action      text,
  p_entity_type text,
  p_entity_id   text,
  p_details     jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_action is null or p_action = '' then
    return null;
  end if;
  insert into public.audit_log (actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    nullif(p_actor_id, ''),
    nullif(p_actor_email, ''),
    p_action,
    nullif(p_entity_type, ''),
    nullif(p_entity_id, ''),
    p_details
  )
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.audit_write(text, text, text, text, text, jsonb) from public;
grant execute on function public.audit_write(text, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
