-- Email delivery + notification rules + send log
-- Run this in Supabase SQL Editor.

-- 1) Singleton email settings (one row, id=1).
--    app_password stored encrypted ("enc:v1:..."); never returned to browser.
create table if not exists email_settings (
  id int primary key default 1,
  username text default '',
  app_password text default '',
  from_name text default '',
  reply_to_email text default '',
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  last_error_at timestamptz,
  last_error text,
  last_success_at timestamptz,
  updated_at timestamptz default now(),
  constraint email_settings_singleton check (id = 1)
);

insert into email_settings (id)
  values (1)
  on conflict (id) do nothing;

-- 2) Notification rules — "when event X fires, notify role R or user U".
create table if not exists notification_rules (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  role text,
  user_id uuid references users(id) on delete cascade,
  extra_email text,
  subject_template text default '',
  body_template text default '',
  enabled boolean default true,
  created_at timestamptz default now(),
  check (role is not null or user_id is not null or extra_email is not null)
);

create index if not exists notification_rules_event_idx on notification_rules(event_type) where enabled;

-- 3) Audit log of sends.
create table if not exists notification_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_email text not null,
  subject text,
  status text not null,
  error text,
  context jsonb,
  sent_at timestamptz default now()
);

-- 4) RLS: anon key can read email_settings (username/from/reply_to only —
--    app_password stays server-side) and notification_rules. Writes
--    happen through Netlify functions using the service role key.
alter table email_settings enable row level security;
alter table notification_rules enable row level security;
alter table notification_log enable row level security;

drop policy if exists email_settings_select_anon on email_settings;
create policy email_settings_select_anon on email_settings for select to anon using (true);

drop policy if exists notification_rules_select_anon on notification_rules;
create policy notification_rules_select_anon on notification_rules for select to anon using (true);

-- Writes: service role bypasses RLS automatically (no policy needed).
