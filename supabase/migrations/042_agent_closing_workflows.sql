-- 042_agent_closing_workflows.sql
--
-- Seeds two Agent-for-Life workflows Kim asked for:
--
--   A) "First Closing with an Agent" — 5 dated reminder tasks that
--      fire 1 day after the agent's very first funded closing. Every
--      step is a task the team checks off. The final "mail closing
--      congrats notecard" task is gated on the agent's mailing
--      address being on file — until Kim types the address into the
--      Partners drawer, the task doesn't emit.
--
--   B) "Agent's 3rd Closing (not VIP)" — 1 dated reminder task that
--      fires 1 day after the agent's 3rd funded closing. VIP agents
--      are excluded via the workflow condition system.
--
-- No auto emails, no auto gifting — every action is a manual task
-- the team checks off, per Kim's spec.
--
-- Idempotent — every insert is guarded by a name lookup so re-runs
-- (and preview deploys layered on this) don't duplicate.
--
-- Doesn't modify RLS, tables, or existing data. Insert-only.

do $$
declare
  wf_first uuid;
  wf_third uuid;
  parent_none uuid := null;
begin
  ------------------------------------------------------------------
  -- Workflow A: "First Closing with an Agent"
  ------------------------------------------------------------------
  select id into wf_first
    from public.workflow_templates
   where name = 'First Closing with an Agent';

  if wf_first is null then
    insert into public.workflow_templates (name, description, category, active)
    values (
      'First Closing with an Agent',
      'Fires 1 day after an agent''s first funded closing with us. Every step is a dated task the team checks off — no auto emails, no auto gifting.',
      'Agent for Life',
      true
    )
    returning id into wf_first;
  end if;

  -- Add each task (idempotent by title within this workflow).
  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_first and title = 'Add agent on Facebook')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes
    ) values (
      wf_first, 'Add agent on Facebook', 'loa',
      'date', 'First Closing', 1, 'days', 0,
      'One day after first funded closing — send them a Facebook friend request.'
    );
  end if;

  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_first and title = 'Send congratulations text')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes
    ) values (
      wf_first, 'Send congratulations text', 'loa',
      'date', 'First Closing', 1, 'days', 1,
      'Text the agent thanking them for the first closing.'
    );
  end if;

  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_first and title = 'Email $10 coffee card')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes
    ) values (
      wf_first, 'Email $10 coffee card', 'loa',
      'date', 'First Closing', 1, 'days', 2,
      'Send a $10 coffee card via email as a small immediate thank-you.'
    );
  end if;

  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_first and title = 'Request birthday + mailing address')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes
    ) values (
      wf_first, 'Request birthday + mailing address', 'loa',
      'date', 'First Closing', 1, 'days', 3,
      'Ask the agent for their birthday and mailing address — record both on their Partner card. The next task unlocks once the mailing address is on file.'
    );
  end if;

  -- Final task — gated on has_mailing_address so it stays hidden
  -- until the address exists on the Partner card.
  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_first and title = 'Mail closing congrats notecard')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes,
      condition_field, condition_op
    ) values (
      wf_first, 'Mail closing congrats notecard', 'loa',
      'date', 'First Closing', 1, 'days', 4,
      'Only fires once the agent''s mailing address is recorded on their Partner card. Drop a handwritten congrats notecard in the mail.',
      'has_mailing_address', 'is_true'
    );
  end if;

  ------------------------------------------------------------------
  -- Workflow B: "Agent's 3rd Closing (not VIP)"
  ------------------------------------------------------------------
  select id into wf_third
    from public.workflow_templates
   where name = 'Agent''s 3rd Closing (not VIP)';

  if wf_third is null then
    insert into public.workflow_templates (name, description, category, active)
    values (
      'Agent''s 3rd Closing (not VIP)',
      'Fires 1 day after an agent''s 3rd funded closing with us. Excluded for VIP agents (they get their own touch cadence). Manual gift-mailing task.',
      'Agent for Life',
      true
    )
    returning id into wf_third;
  end if;

  if not exists (select 1 from public.workflow_tasks
    where workflow_id = wf_third and title = 'Mail thank-you card + $25–$35 gift')
  then
    insert into public.workflow_tasks (
      workflow_id, title, role, trigger_kind, trigger_label,
      trigger_days, trigger_unit, position, notes,
      condition_field, condition_op
    ) values (
      wf_third, 'Mail thank-you card + $25–$35 gift', 'loa',
      'date', 'Third Closing', 1, 'days', 0,
      'Only fires for non-VIP agents. Handwritten thank-you card + a $25–$35 gift in the mail.',
      'is_vip', 'is_false'
    );
  end if;
end $$;

notify pgrst, 'reload schema';
