-- Fix the Borrower Consultation SOP seed: the "DENIED PATH: send
-- customized denial email + notify realtor" task was incorrectly
-- status-triggered on 'Adversed'. Real workflow: LO reviews the
-- application (Applied status), then decides the outcome from a
-- decision point. Downstream tasks branch off THAT decision, not
-- off a status change.
--
-- This migration:
--   1. Deletes the wrongly-configured Adversed task.
--   2. Inserts a proper Decision Point after the review tasks with
--      answers: Approved / Denied / Credit Repair / Scenarios Desk.
--   3. Adds branch tasks for each non-approved outcome, tied to the
--      decision point via depends_on_task_id + depends_on_outcome.
--
-- Idempotent — everything is guarded by name checks.
-- Run in Supabase SQL editor.

do $$
declare wf uuid; dp uuid;
begin
  select id into wf from workflow_templates where name = 'Borrower Consultation SOP';
  if wf is null then return; end if;

  -- 1. Drop the wrong Adversed-triggered task if it's still there.
  delete from workflow_tasks
   where workflow_id = wf
     and title = 'DENIED PATH: send customized denial email + notify realtor';

  -- 2. Add the decision point (idempotent by title).
  if not exists (
    select 1 from workflow_tasks
     where workflow_id = wf
       and title = 'Approved, denied, credit repair, or scenarios desk?'
  ) then
    insert into workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label, trigger_days,
      trigger_recurring, decision_options, notes, position
    ) values (
      wf,
      'Approved, denied, credit repair, or scenarios desk?',
      'lo', 'status', 'Applied', 0, false,
      '["Approved", "Denied", "Credit Repair", "Scenarios Desk"]'::jsonb,
      'LO owns Phase 1 100%. Answer this once the credit/income/assets/debt/structure review is complete — the answer routes the file down the correct branch below.',
      3
    ) returning id into dp;
  else
    select id into dp from workflow_tasks
     where workflow_id = wf
       and title = 'Approved, denied, credit repair, or scenarios desk?';
  end if;

  -- 3. Branch tasks.
  if not exists (select 1 from workflow_tasks where workflow_id = wf and title = 'Send denial email + notify realtor') then
    insert into workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label, trigger_days,
      trigger_recurring, depends_on_task_id, depends_on_outcome, notes, position
    ) values (
      wf, 'Send denial email + notify realtor', 'lo', 'status', 'Applied', 0, false,
      dp, 'Denied',
      'Explain reasoning if needed. Ops updates pipeline → Denied, archives file.',
      4
    );
  end if;

  if not exists (select 1 from workflow_tasks where workflow_id = wf and title = 'Send credit repair action plan') then
    insert into workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label, trigger_days,
      trigger_recurring, depends_on_task_id, depends_on_outcome, notes, position
    ) values (
      wf, 'Send credit repair action plan', 'lo', 'status', 'Applied', 0, false,
      dp, 'Credit Repair',
      'Identify blockers. Provide generic action plan. Do NOT run paid algorithm unless strategic.',
      5
    );
  end if;

  if not exists (select 1 from workflow_tasks where workflow_id = wf and title = 'Send file to scenarios desk + text borrower re: timeline') then
    insert into workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label, trigger_days,
      trigger_recurring, depends_on_task_id, depends_on_outcome, notes, position
    ) values (
      wf, 'Send file to scenarios desk + text borrower re: timeline', 'lo', 'status', 'Applied', 0, false,
      dp, 'Scenarios Desk',
      'Waits for outcome. Result loops back to Denied / Credit Repair / Pre-Approved.',
      6
    );
  end if;

  -- The existing PRE-APPROVED PATH tasks (structure loan, call
  -- borrower, call agent, send pre-approval letter) already exist
  -- and correctly trigger on HOT PA status. Wire them to the
  -- Approved decision so they only fire once the LO has confirmed
  -- pre-approval on the decision point.
  update workflow_tasks
     set depends_on_task_id = dp, depends_on_outcome = 'Approved'
   where workflow_id = wf
     and title in (
       'PRE-APPROVED PATH: structure loan + full underwriting review',
       'Call borrower to sell the deal',
       'Call agent for trust transfer',
       'Send pre-approval letter'
     )
     and depends_on_task_id is null;
end $$;

notify pgrst, 'reload schema';
