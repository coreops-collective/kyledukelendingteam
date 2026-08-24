-- 050_tasks_soft_delete.sql
--
-- Kim's 2026-08-24 bug on /projects (mirror of a /clientforlife
-- symptom): "old tasks of Kyle's keep coming back even after checking
-- off or deleting". Root cause on /projects: the tracker Kanban was
-- persisting tasks to localStorage only — Kyle's browser saved his
-- deletes, Kim's browser never saw them, and each browser fell back
-- to TASKS_SEED (from data/tasks.js) on first mount. Task appeared
-- to "come back" because it never left the other person's view.
--
-- The permanent fix is client-side: Projects.jsx now loads / writes /
-- realtime-subscribes to public.tasks via a new store
-- (src/lib/projectsStore.js) instead of localStorage. This migration
-- is the reversible companion:
--
--   * Adds a nullable deleted_at column so Kim's "delete" is a soft
--     delete — the row stays for audit but every read filter treats
--     deleted_at IS NOT NULL as hidden. Matches the "no hard delete"
--     rule Lauren spec'd on the ticket.
--   * Adds a nullable completed_at column so "task done" carries a
--     timestamp alongside the existing status='done' — makes the "how
--     long between add and complete" stat easy later if needed.
--
-- Additive-only. Idempotent. Reversible per column via:
--   update public.tasks set deleted_at = null where deleted_at is not null;
--   update public.tasks set completed_at = null where completed_at is not null;
--   -- (or) alter table public.tasks drop column deleted_at;
--   -- (or) alter table public.tasks drop column completed_at;
--
-- No auth / RLS / SECURITY DEFINER touched. The existing tasks_all
-- policy from 023_fresh_bootstrap.sql stays put.

alter table public.tasks
  add column if not exists deleted_at timestamptz;
alter table public.tasks
  add column if not exists completed_at timestamptz;

notify pgrst, 'reload schema';
