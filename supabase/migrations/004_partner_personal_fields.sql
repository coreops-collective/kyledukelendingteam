-- Add personal-detail columns to the partners table so referral managers can
-- track an agent's anniversary, favorite restaurant, and free-form notes
-- alongside the existing birthday / spouse / coffee shop fields.
-- Run in Supabase SQL editor.

alter table partners add column if not exists anniversary date;
alter table partners add column if not exists favorite_restaurant text;
alter table partners add column if not exists notes text;

notify pgrst, 'reload schema';
