-- Status-triggered workflow tasks. Previously every workflow_task
-- resolved to a date (Closing + N days, Birthday - 7d, etc.). The
-- Missy junior-LO flow needs tasks anchored to loan STATUS instead:
-- "for every loan currently sitting in New Lead, generate a
-- follow-up task today; repeat daily until the status changes."
--
-- trigger_kind: 'date' (existing) or 'status' (new).
-- repeat_interval: null (single fire) or 'daily' / 'weekly' /
--   'monthly'. Only used when trigger_kind = 'status' — the
--   generator re-emits a task on the interval boundary so long as
--   the loan is still in the referenced status.
-- Run in Supabase SQL editor.

alter table workflow_tasks add column if not exists trigger_kind text default 'date';
alter table workflow_tasks add column if not exists repeat_interval text;

notify pgrst, 'reload schema';
