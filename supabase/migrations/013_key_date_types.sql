-- Global list of key-date TYPES the team tracks (Birthday, Wedding
-- Anniversary, Lease End, Kid's Birthday, whatever). Per-client values
-- still live in client_dates — this table is just the type registry so:
--   - the team can curate the catalog in one place
--   - workflows can trigger off the same canonical labels
--   - every client card shows the same set of inputs to fill in
-- Run in Supabase SQL editor.

create table if not exists key_date_types (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  recurring_default boolean default true,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed the obvious defaults so the catalog isn't empty on first load.
-- on conflict (label) do nothing means re-running the migration is safe
-- and never clobbers manual edits.
insert into key_date_types (label, recurring_default, position) values
  ('Birthday', true, 0),
  ('Wedding Anniversary', true, 1),
  ('Closing Anniversary', true, 2),
  ('Spouse Birthday', true, 3)
on conflict (label) do nothing;

alter table key_date_types enable row level security;

drop policy if exists key_date_types_select_anon on key_date_types;
create policy key_date_types_select_anon on key_date_types for select to anon using (true);

drop policy if exists key_date_types_write_anon on key_date_types;
create policy key_date_types_write_anon on key_date_types for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
