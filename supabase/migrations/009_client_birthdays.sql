-- Per-client key dates. Generic enough that the team can add any
-- labeled date — Birthday, Wedding Anniversary, Kid's Birthday, Lease
-- End, etc. — and workflows can be anchored to any label. Stored in a
-- dedicated table (NOT on loans) so nothing leaks onto the Loan
-- Management spreadsheet.
--
-- Keyed by lowercased (client_name, date_label) so the same client
-- shared between LOANS and PAST_CLIENTS has one entry per label.
-- Run in Supabase SQL editor.

create table if not exists client_dates (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  date_label text not null,                 -- 'Birthday', 'Lease End', 'Kid Bday', etc.
  date_value date,
  recurring boolean default false,          -- true = yearly (birthday-style)
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists client_dates_natural_key
  on client_dates(lower(client_name), lower(date_label));

create index if not exists client_dates_name_idx on client_dates(lower(client_name));

alter table client_dates enable row level security;

drop policy if exists client_dates_select_anon on client_dates;
create policy client_dates_select_anon on client_dates for select to anon using (true);

drop policy if exists client_dates_write_anon on client_dates;
create policy client_dates_write_anon on client_dates for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
