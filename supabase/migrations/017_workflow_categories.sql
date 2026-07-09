-- Categorize workflows so Client for Life outreach, in-flight loan
-- processing SOPs, and lead-nurture cadences don't get mixed together
-- in one long list. Kimberly's ask: keep them separate everywhere.
--
-- Default 'Loan' since that's the biggest bucket. Predefined values
-- in the UI are 'Client for Life', 'Loan', 'Lead Nurture', 'Other' —
-- the column is text so custom categories can be added later without
-- another migration.
-- Run in Supabase SQL editor.

alter table workflow_templates add column if not exists category text default 'Loan';

notify pgrst, 'reload schema';
