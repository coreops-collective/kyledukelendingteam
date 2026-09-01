-- 052_workflow_pause.sql
--
-- Kim's 2026-08-24 request: workflows need a Pause option so a
-- workflow can be silenced without deleting it. Deleting drops the
-- workflow AND its tasks + task_completions history — too aggressive
-- when Kim just wants to temporarily stop it firing (e.g. during a
-- holiday freeze on client outreach).
--
-- Additive-only. Reversible. Idempotent (IF NOT EXISTS).
--
-- The existing `active` boolean column stays as-is (used by
-- migration 046 to soft-disable the duplicate Birthday workflow).
-- `paused_at` is a distinct concept: paused workflows are still
-- "active" in the SOP sense (the team wants to resume them later),
-- but the task generator skips them until the timestamp is cleared.
--
-- Rollback:
--   update public.workflow_templates
--     set paused_at = null where paused_at is not null;
--   -- (or) alter table public.workflow_templates drop column paused_at;
--
-- No auth / RLS / SECURITY DEFINER touched.

alter table public.workflow_templates
  add column if not exists paused_at timestamptz;

notify pgrst, 'reload schema';
