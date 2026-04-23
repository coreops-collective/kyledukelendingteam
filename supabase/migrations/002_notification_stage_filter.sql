-- Stage filter for notification rules.
-- Empty / null = fire on all stages. Non-empty = only fire when
-- context.stage (or context.new_stage) matches one of the stage keys.
-- Run this in Supabase SQL Editor.

alter table notification_rules
  add column if not exists stage_filter text[] default '{}';
