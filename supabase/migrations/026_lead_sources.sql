-- Persisted, editable list of lead sources for the New Loan Intake form
-- and the Lead Sources tracking page. Same pattern as key_date_types /
-- job_roles — load once on boot, mutate via CRUD, dispatch a browser
-- event so listeners refresh.
--
-- Loan rows store the lead_source label as free text in LOANS.leadSource
-- (and PAST_CLIENTS.src for historical records). Aggregating volume /
-- units per source on the tracking page is a client-side reducer over
-- both — no FK, no join. That means renaming a source here does NOT
-- retroactively rename loans, and deleting a source doesn't hide any
-- historical loans tagged with that name. Both are the right
-- behavior — the table drives what the DROPDOWN offers, not history.
--
-- Additive-only. Run in Supabase SQL editor.

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  position int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed the requested defaults. `on conflict do nothing` so re-running
-- the migration doesn't fight the user's own additions / renames.
insert into lead_sources (label, position) values
  ('Realtor Referral',       10),
  ('Past Client Referral',   20),
  ('Sphere of Influence',    30),
  ('Social Media',           40),
  ('In-Person Networking',   50),
  ('Paid Advertisement',     60)
on conflict (label) do nothing;

alter table lead_sources enable row level security;
drop policy if exists lead_sources_all on lead_sources;
create policy lead_sources_all on lead_sources for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
