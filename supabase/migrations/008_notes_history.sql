-- Audit trail for loan notes. Every time a loan's notes get saved we
-- snapshot the PREVIOUS value into this table so the team can recover
-- accidentally-cleared notes (e.g. "we have no idea what was previously
-- there" complaint). Read-only history for users; writes happen via the
-- app whenever a note is updated.
-- Run in Supabase SQL editor.

create table if not exists notes_history (
  id uuid primary key default gen_random_uuid(),
  loan_id text not null,
  notes text,
  edited_by text,
  created_at timestamptz not null default now()
);

create index if not exists notes_history_loan_idx on notes_history(loan_id, created_at desc);

alter table notes_history enable row level security;

drop policy if exists notes_history_select_anon on notes_history;
create policy notes_history_select_anon on notes_history for select to anon using (true);

drop policy if exists notes_history_write_anon on notes_history;
create policy notes_history_write_anon on notes_history for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
