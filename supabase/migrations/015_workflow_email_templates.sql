-- Email templates on workflow tasks. Kimberly's ask: for tasks that
-- boil down to "send this email," she wants a subject + body baked
-- into the workflow and a one-click "Compose in Outlook" button that
-- pre-fills the recipient and copy from the client's loan record.
--
-- email_recipient: one of 'client' / 'co_borrower' / 'agent' / null.
-- email_subject / email_body: freeform, support {{first_name}},
-- {{last_name}}, {{property}}, {{close_date}}, {{agent_name}}
-- variable tokens substituted at compose time.
-- Run in Supabase SQL editor.

alter table workflow_tasks add column if not exists email_recipient text;
alter table workflow_tasks add column if not exists email_subject text;
alter table workflow_tasks add column if not exists email_body text;

notify pgrst, 'reload schema';
