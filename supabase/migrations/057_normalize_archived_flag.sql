-- 057_normalize_archived_flag.sql
--
-- Kim, 2026-09-11 on /ratelocks:
--   "File (Swartz) marked archived but still appearing on this report. Files
--    that have been marked closed, terminated, archived from the loan
--    management page should not appear in the rate locks section."
--
-- A loan can be archived two independent ways and nothing kept them in sync:
--   * the `archived` flag, set by the drawer's Archive button
--   * status 'Archived' (stage 'cold'), picked from the status dropdown
--
-- Kim used the dropdown. Loan NLMPOSPIE5 is status 'Archived', stage 'cold',
-- archived absent, lockExp 2026-08-12 — so it cleared every guard in
-- RateLocks.jsx, which only tested the flag.
--
-- The accompanying code change fixes both directions at the source: an
-- isArchived() helper that accepts either representation, used by the two
-- views that got this wrong, plus write-side normalization so the drawer and
-- the status dropdown now set both.
--
-- This migration settles the rows written before that. 9 rows carry status
-- 'Archived' (or stage 'cold') without the flag. That matters beyond the two
-- views just fixed: 18 other call sites across the app test `l.archived`
-- directly, and every one of them currently treats these 9 as active. Setting
-- the flag makes it authoritative, so those 18 become correct without being
-- touched.
--
-- Only 1 of the 9 carries a lockExp, which is why Swartz is the only one Kim
-- could see. The rest were mis-filed quietly in Loan Management, Pipeline,
-- Snapshot counts, Partner stats and so on.
--
-- The reverse direction — 45 rows with the flag set but status not
-- 'Archived' — is deliberately left alone. Those are drawer-archived, every
-- reader already honours the flag, and rewriting their status would change
-- what the status filters show for no benefit.
--
-- ------------------------------------------------------------------
-- REVERSAL (exact, drop into the SQL editor):
--
--   update public.loans
--      set data = data - 'archived' - 'archived_normalized_at'
--    where data->>'archived_normalized_at' is not null;
--
-- Removes the key entirely rather than setting it false, which is the true
-- prior state — these rows had no `archived` key at all. Only rows this
-- migration stamped are affected.
-- ------------------------------------------------------------------
--
-- Idempotent: the WHERE excludes anything already flagged, so a re-run
-- matches nothing. Additive (writes jsonb blob keys). No schema change, no
-- auth / RLS / SECURITY DEFINER touched.

update public.loans
   set data = data || jsonb_build_object(
                'archived', true,
                'archived_normalized_at', to_jsonb(now())
              ),
       updated_at = now()
 where (data->>'status' = 'Archived' or data->>'stage' = 'cold')
   and coalesce(data->>'archived', 'false') <> 'true';

notify pgrst, 'reload schema';
