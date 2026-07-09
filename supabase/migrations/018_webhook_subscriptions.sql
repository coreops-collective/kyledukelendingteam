-- Webhook subscriptions. Kyle's team wants to push status changes and
-- new leads out to Go High Level so GHL can run the actual drip
-- campaigns. Each row is one subscription: when EVENT fires with a
-- payload matching FILTER_STATUS (optional), POST the payload JSON to
-- URL.
--
-- Fired client-side from the browser that triggers the event. GHL
-- webhook URLs accept POST from any origin — no proxy needed.
-- Run in Supabase SQL editor.

create table if not exists webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  event text not null,                    -- 'loan.status_changed' | 'loan.created' | 'partner.created'
  filter_status text,                     -- optional: only fire when new status matches this
  url text not null,
  active boolean default true,
  label text,                             -- freeform display name ("10-day of pain start")
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists webhook_subscriptions_event_idx
  on webhook_subscriptions(event) where active;

alter table webhook_subscriptions enable row level security;

drop policy if exists webhook_subscriptions_all on webhook_subscriptions;
create policy webhook_subscriptions_all on webhook_subscriptions
  for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
