-- Reports-to relationship on job_roles so the AI Suggest prompt has
-- context for org structure and the printed JD can include a proper
-- "Reports To" line.
--
-- Nullable FK to another job_roles row. ON DELETE SET NULL so removing a
-- role that others report to just clears their reports_to_role_id
-- instead of cascading.
--
-- Additive-only.
-- Run in Supabase SQL editor.

alter table job_roles
  add column if not exists reports_to_role_id uuid
    references job_roles(id) on delete set null;

notify pgrst, 'reload schema';
