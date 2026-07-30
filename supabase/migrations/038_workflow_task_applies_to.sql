-- 038_workflow_task_applies_to.sql
--
-- Adds `applies_to` to workflow_tasks so a workflow author can decide
-- whether a task fires per borrower or once per deal on two-borrower
-- files.
--
-- Values:
--   'each'    → fires for both the primary borrower and the
--                co-borrower (default; right for birthdays, personal
--                follow-ups, individually-anchored things).
--   'primary' → fires once for the primary borrower only (right for
--                "Congrats on closing" cards, per-deal-not-per-person
--                tasks).
--   NULL      → legacy rows keep firing for both, matching the old
--                behavior — no data changes.
--
-- Additive migration only — no existing rows are mutated. The client
-- has a graceful downgrade in createTask/updateTask so runs before
-- this migration lands stay quiet.

alter table workflow_tasks
  add column if not exists applies_to text;

-- Explicit check keeps typos out of the column.
do $$
begin
  if not exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'workflow_tasks_applies_to_check'
  ) then
    alter table workflow_tasks
      add constraint workflow_tasks_applies_to_check
      check (applies_to is null or applies_to in ('each', 'primary'));
  end if;
end $$;

notify pgrst, 'reload schema';
