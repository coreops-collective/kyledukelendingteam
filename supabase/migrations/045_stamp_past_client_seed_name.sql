-- 045_stamp_past_client_seed_name.sql
--
-- Adds `past_client_seed_name` to every loan imported from PAST_CLIENTS
-- (043 + 044) so the runtime dedupe in fundedLoans.js can pair the loan
-- row back to its original PAST_CLIENTS entry even after Kim edits the
-- borrower name on the drawer.
--
-- Bug being fixed: after 043 imported PAST_CLIENTS into `loans`, editing
-- an imported loan's borrower (e.g. "Clouse" → "Andrew Clouse") caused
-- getAllFunded's `fromPast` dedupe to miss the pairing — the LOANS row
-- surfaced under the new name AND the original PAST_CLIENTS row also
-- surfaced under the old name. Two cards for one client.
--
-- Fix: stash the ORIGINAL PAST_CLIENTS name on the loan row at
-- past_client_seed_name. The runtime dedupe checks both `borrower` and
-- `past_client_seed_name` so the pairing survives any future rename.
--
-- Additive-only. Idempotent (safe to re-run — jsonb || overwrites the
-- key with the same value). Zero risk to any other data.

update public.loans
set data = data || jsonb_build_object('past_client_seed_name', data->>'name')
where data->>'imported_from' = 'past_clients_seed'
  and data->>'name' is not null
  and data->>'name' <> ''
  and (data->>'past_client_seed_name' is null
       or data->>'past_client_seed_name' <> data->>'name');

notify pgrst, 'reload schema';
