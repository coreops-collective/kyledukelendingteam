-- Persisted job roles for the Roles & Responsibilities page.
--
-- Each row is a role the team hires for (LO, LOA, Admin, Automated by
-- default; add "Marketing Coordinator" etc. as new hires happen). The
-- Responsibilities section on the Roles page is derived live from
-- workflow_tasks where task.role = this row's `key` — no duplication.
--
-- The Job Description / 30-60-90 / Accountability text fields ARE
-- persisted so the AI Suggest output can be reviewed, edited, and
-- committed by the team.
--
-- Additive-only. Old hardcoded ROLES in workflows.js keep working via
-- pre-seeded rows below.
-- Run in Supabase SQL editor.

create table if not exists job_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,       -- machine key, e.g. 'lo' | 'marketing'
  label text not null,            -- display label, e.g. 'LO' | 'Marketing Coordinator'
  summary text,                   -- one-liner shown under the role name
  job_description text,           -- AI-rewritten prose JD (editable)
  training_30 text,               -- 30-day training plan
  training_60 text,               -- 60-day
  training_90 text,               -- 90-day
  accountability text,            -- key metrics / accountabilities
  position int default 0,
  built_in boolean default false, -- prevents accidental deletion of core 4
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Seed the four hardcoded roles so a fresh project shows them immediately
-- and existing workflow_tasks with those role keys keep resolving to a
-- row on the Roles page.
insert into job_roles (key, label, summary, position, built_in)
values
  ('lo',        'LO',        'Loan Officer',            10, true),
  ('loa',       'LOA',       'Loan Officer Assistant',  20, true),
  ('admin',     'Admin',     'Administrative support',  30, true),
  ('automated', 'Automated', 'System-driven, no owner', 40, true)
on conflict (key) do nothing;

alter table job_roles enable row level security;
drop policy if exists job_roles_all on job_roles;
create policy job_roles_all on job_roles for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
