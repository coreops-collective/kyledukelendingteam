-- Add an optional "primary LO" column to partners. By default the UI
-- derives the primary LO for each partner from the LOANS pipeline (whichever
-- LO has closed / is closing the most loans with that agent). This column
-- lets the team override that derivation when needed.
-- Run in Supabase SQL editor.

alter table partners add column if not exists primary_lo text;

notify pgrst, 'reload schema';
