-- Editable Client for Life workflows. Replaces the static seed in
-- src/data/cfl.js with team-editable templates that get expanded into a
-- live task list against active + past clients.
--
-- A workflow is a named bundle of tasks (e.g. "New Funded Loan",
-- "Birthday Outreach"). Each task is anchored to a trigger LABEL —
-- usually one of the built-in labels ("Closing", from loan close date)
-- or a custom label that exists on client_dates ("Birthday", "Lease End",
-- whatever the team made up). The day offset and recurring flag drive
-- when (and how often) the task generates against each client.
-- Run in Supabase SQL editor.

create table if not exists workflow_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  active boolean default true,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflow_templates(id) on delete cascade,
  title text not null,
  role text default 'lo',                   -- lo | loa | admin | automated
  trigger_label text default 'Closing',     -- matches client_dates.date_label or built-in 'Closing'
  trigger_days int default 0,               -- offset; negative = before, positive = after
  trigger_recurring boolean default false,  -- yearly recurrence (birthday-style)
  notes text,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists workflow_tasks_wf_idx on workflow_tasks(workflow_id, position);

-- task_completions: per-client completion log keyed by (task_id,
-- client_name, due_date). due_date is part of the key so yearly
-- recurring tasks generate a new pending row each year.
create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references workflow_tasks(id) on delete cascade,
  client_name text not null,
  due_date date,
  completed_at timestamptz default now(),
  completed_by text
);

create index if not exists task_completions_lookup_idx
  on task_completions(task_id, lower(client_name), due_date);

alter table workflow_templates enable row level security;
alter table workflow_tasks enable row level security;
alter table task_completions enable row level security;

drop policy if exists workflow_templates_all on workflow_templates;
create policy workflow_templates_all on workflow_templates for all to anon using (true) with check (true);

drop policy if exists workflow_tasks_all on workflow_tasks;
create policy workflow_tasks_all on workflow_tasks for all to anon using (true) with check (true);

drop policy if exists task_completions_all on task_completions;
create policy task_completions_all on task_completions for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
