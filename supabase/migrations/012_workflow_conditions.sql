-- Conditional task generation. Each workflow task can optionally be
-- gated on a per-client field — e.g. "only fire if review_left is
-- false" so the team can build "remind me to ask again in 2 weeks if
-- they still haven't left a review" type workflows.
--
-- condition_field references either a client_profiles boolean column
-- (currently just 'review_left') or 'none' for unconditional tasks.
-- condition_op is how to compare ('is_true' / 'is_false' for booleans;
-- left open for future scalar comparisons).
-- Run in Supabase SQL editor.

alter table workflow_tasks add column if not exists condition_field text;
alter table workflow_tasks add column if not exists condition_op text;

notify pgrst, 'reload schema';
