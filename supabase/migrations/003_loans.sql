-- Persist the LOANS array. We store each loan as a jsonb blob keyed by id
-- so schema drift in the JS model doesn't require repeated migrations.
-- Run in Supabase SQL editor.

create table if not exists loans (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table loans enable row level security;

-- Anon can read (dashboard is single-tenant).
drop policy if exists loans_select_anon on loans;
create policy loans_select_anon on loans for select to anon using (true);

-- Anon can insert/update/delete too (dashboard is single-tenant, no user-level
-- auth on writes yet). Tighten this once real auth lands.
drop policy if exists loans_write_anon on loans;
create policy loans_write_anon on loans for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
