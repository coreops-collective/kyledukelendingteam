-- Per-client profile data outside the loans / past_clients arrays.
-- Tracks things like whether the client has left a review, when, and
-- on what platform — plus a freeform notes field. Keyed by client_name
-- the same way client_dates is so a single client gets one profile.
-- Run in Supabase SQL editor.

create table if not exists client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_name text not null unique,
  review_left boolean default false,
  review_date date,
  review_source text,                    -- 'Google', 'Zillow', 'Facebook', etc.
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists client_profiles_name_idx on client_profiles(lower(client_name));

alter table client_profiles enable row level security;

drop policy if exists client_profiles_select_anon on client_profiles;
create policy client_profiles_select_anon on client_profiles for select to anon using (true);

drop policy if exists client_profiles_write_anon on client_profiles;
create policy client_profiles_write_anon on client_profiles for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
