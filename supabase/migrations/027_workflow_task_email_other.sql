-- Add a custom "Other" recipient email address on workflow_tasks so an
-- email template can be routed to someone outside the borrower / co-borrower
-- / agent trio — a title company, HOA, insurance broker, escrow officer,
-- whoever comes up in real workflows.
--
-- The existing email_recipient text column stores the recipient kind
-- ('client' | 'co_borrower' | 'agent' | 'other'). When it's 'other' the
-- new email_other_recipient column carries the literal email address.
-- Any other recipient kind leaves the new column null.
--
-- Additive-only. Old rows keep working — email_recipient stays in its
-- existing set of values, email_other_recipient starts null.
-- Run in Supabase SQL editor.

alter table workflow_tasks
  add column if not exists email_other_recipient text;

notify pgrst, 'reload schema';
