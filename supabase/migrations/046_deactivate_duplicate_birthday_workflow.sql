-- 046_deactivate_duplicate_birthday_workflow.sql
--
-- Kim's item 1: two birthday-card tasks were populating on the CFL
-- task list — one from workflow "Birthday" (category=Client for Life)
-- and one from workflow "Birthday Card" (category=Agent for Life).
-- Both produced an identical "Birthday Card" task 7 days before each
-- client's birthday.
--
-- Fix (Kim's spec: keep the one called "Birthday Card"):
--   1. Set active=false on workflow "Birthday" so it stops emitting
--      tasks. Rows in workflow_tasks and task_completions are LEFT IN
--      PLACE so historical completion records stay intact — no data
--      loss per rule 1.
--   2. Move "Birthday Card" from Agent for Life to Client for Life so
--      it lives under the category the CFL page filters by (planned
--      when we add category filtering).
--
-- Idempotent — updates are no-ops if the state is already correct.
-- Reversible with a symmetric UPDATE if we ever want to re-enable.

update public.workflow_templates
set active = false
where name = 'Birthday' and active = true;

update public.workflow_templates
set category = 'Client for Life'
where name = 'Birthday Card' and category <> 'Client for Life';

notify pgrst, 'reload schema';
