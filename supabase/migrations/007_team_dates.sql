-- Add personal-date fields to the users (team members) table so Kyle can
-- track team birthdays, spouse names + birthdays, marriage anniversaries,
-- and work anniversaries (hire date). Surfaced on the Team Members page.
-- Run in Supabase SQL editor.

alter table users add column if not exists birthday date;
alter table users add column if not exists spouse_name text;
alter table users add column if not exists spouse_birthday date;
alter table users add column if not exists marriage_anniversary date;
alter table users add column if not exists work_anniversary date;

notify pgrst, 'reload schema';
