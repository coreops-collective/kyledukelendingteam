-- Round of workflow-task feature upgrades — Kimberly's three asks:
--
-- 1. Richer "When" — offset unit + calendar-day triggers + custom
--    recurring cadence beyond yearly.
--    - trigger_unit: 'days' | 'weeks' | 'months' | 'quarters' | 'years'
--      (interpretation of trigger_days). Default 'days' preserves old
--      behavior so existing rows keep working.
--    - trigger_calendar_date: text 'MM-DD' or full 'YYYY-MM-DD'. When
--      set, the task fires on that same month/day every year (or the
--      recurring cadence below). Used for "send Christmas card"
--      style tasks that don't anchor to a client-specific date.
--    - recur_every_n + recur_every_unit: cadence override. When set,
--      the task recurs "every N units" instead of yearly.
--
-- 2. Decision branches.
--    - depends_on_task_id: this task only generates if the referenced
--      task has been completed for the same client.
--    - depends_on_outcome: further narrows — only generate if the
--      completion's outcome matches this text.
--    - decision_options: JSON array of outcome labels the completing
--      task offers. When non-null on the parent, marking complete
--      prompts for which branch to take.
--
-- 3. task_completions gains an `outcome` column so branch-dependent
--    tasks can be generated correctly.
-- Run in Supabase SQL editor.

alter table workflow_tasks add column if not exists trigger_unit text default 'days';
alter table workflow_tasks add column if not exists trigger_calendar_date text;
alter table workflow_tasks add column if not exists recur_every_n int;
alter table workflow_tasks add column if not exists recur_every_unit text;   -- 'days'|'weeks'|'months'|'quarters'|'years'

alter table workflow_tasks add column if not exists depends_on_task_id uuid references workflow_tasks(id) on delete set null;
alter table workflow_tasks add column if not exists depends_on_outcome text;
alter table workflow_tasks add column if not exists decision_options jsonb;

alter table task_completions add column if not exists outcome text;

notify pgrst, 'reload schema';
