-- Distinguish task completions across two loans that share a borrower name.
--
-- Before this migration: task_completions is keyed by (task_id, client_name,
-- due_date). Two active loans both for "Jane Smith" on the same task with the
-- same due date collide — checking one marks both done.
--
-- After this migration: an optional loan_id lets the client scope completions
-- to a specific loan. The write path fills loan_id when it has one; reads
-- prefer a loan-scoped completion but still fall back to the name-scoped one
-- so completions written before this migration keep matching.
--
-- Additive-only. No existing rows change, no completions are lost, no lookup
-- ever fails on records that were correct before this ran.
-- Run in Supabase SQL editor.

alter table task_completions
  add column if not exists loan_id text;

-- Loan-scoped lookup: a task marked complete against a specific loan.
create index if not exists task_completions_by_loan_idx
  on task_completions(task_id, loan_id, due_date)
  where loan_id is not null;

-- The existing lookup index (task_completions_lookup_idx from 010_workflows)
-- keeps handling the name-scoped fallback, unchanged.

notify pgrst, 'reload schema';
