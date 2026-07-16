-- Add a corrected_lo override field on client_profiles. Same pattern as
-- corrected_name / corrected_phone / corrected_email from migration 016
-- — lets Kim fix the LO on a legacy (seed) past client without needing
-- a loan row to edit. Live loans still write directly to loans.lo.
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

alter table public.client_profiles
  add column if not exists corrected_lo text;

notify pgrst, 'reload schema';
