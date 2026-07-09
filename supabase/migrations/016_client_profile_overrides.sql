-- Extend client_profiles with per-client override / co-borrower fields
-- so records that only exist in the legacy PAST_CLIENTS seed (no live
-- LOANS row) are still editable. The CoBorrowerEditor and
-- IdentityEditor in the All Loans past-client drawer write to these
-- columns when the source record can't be edited directly.
-- Run in Supabase SQL editor.

alter table client_profiles add column if not exists co_borrower_first text;
alter table client_profiles add column if not exists co_borrower_last text;
alter table client_profiles add column if not exists co_borrower_phone text;
alter table client_profiles add column if not exists co_borrower_email text;

alter table client_profiles add column if not exists corrected_name text;
alter table client_profiles add column if not exists corrected_phone text;
alter table client_profiles add column if not exists corrected_email text;

notify pgrst, 'reload schema';
