-- 047_input_birthday_task_gate.sql
--
-- Kim's item 2: "Birthday card tasks should not populate if there is
-- no birthday entered." The actual "Birthday Card" task already skips
-- for clients with no birthday on file (the generator has no anchor,
-- so it short-circuits). What Kim was actually seeing on the CFL list
-- for clients like Donovan Murray was the "Input Client Birthday"
-- reminder — a task in the "Upon Closing" workflow that fires 2 days
-- after every closing to prompt the LOA to collect the birthday.
--
-- Fix: gate that reminder on the new `has_birthday` condition set to
-- `is_false`. Result:
--   * Client has no birthday → task fires (prompts entry)
--   * Kim enters the birthday → next render, task condition is now
--     is_true → task self-completes and disappears from the list.
--
-- The Birthday Card task (which triggers ON Birthday) needs no gate —
-- the anchor-based generator already skips it without a birthday.
--
-- Additive-only: writes existing condition_field / condition_op
-- columns. Idempotent.

update public.workflow_tasks
set condition_field = 'has_birthday', condition_op = 'is_false'
where title = 'Input Client Birthday'
  and (condition_field is null or condition_field <> 'has_birthday');

notify pgrst, 'reload schema';
