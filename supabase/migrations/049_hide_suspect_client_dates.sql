-- 049_hide_suspect_client_dates.sql
--
-- Kim's 2026-08-20 bug: "Send birthday card" tasks appeared for
-- clients whose birthday she never entered. Root cause in the client:
-- older versions briefly wrote empty-string or '1970-01-01' values
-- into public.client_dates for Birthday rows, and buildAnchorsForClient
-- silently accepted them as a valid Jan-1 anchor → every affected
-- client got a phantom Birthday-Card task on Jan 1.
--
-- The permanent fix is client-side (src/lib/dateHelpers.js —
-- isPlausibleUserDate rejects pre-1900 dates and the exact Jan 1 1970
-- epoch signature). This migration is the belt-and-suspenders
-- companion: it identifies suspect rows in public.client_dates and
-- marks them hidden via a new nullable `hidden_at` timestamptz
-- column. The client's loadClientDates() reader skips rows with
-- hidden_at set.
--
-- Additive-only. Idempotent. Reversible via:
--   update public.client_dates
--     set hidden_at = null
--     where hidden_at is not null
--       and hidden_at >= '2026-08-20'::timestamptz
--       and hidden_at <  '2026-08-21'::timestamptz;
-- (Adjust the window if the migration runs on a different date.)
--
-- No auth / RLS / SECURITY DEFINER touched.

alter table public.client_dates
  add column if not exists hidden_at timestamptz;

-- Flag rows the client-side guard would now reject:
--   * NULL or empty date_value (already skipped by the runtime, but
--     hiding cleans them out of any diagnostic query too)
--   * Exact '1970-01-01' string (the epoch phantom Kim was seeing)
--   * Any date that would parse to pre-1900 in JS
update public.client_dates
   set hidden_at = now()
 where hidden_at is null
   and (
        date_value is null
        or btrim(date_value) = ''
        or date_value = '1970-01-01'
        or date_value ~* '^0*1900-01-01' = false and (
          -- Explicit pre-1900 patterns. Anything YYYY-MM-DD with
          -- 4-digit year < 1900. Won't catch M/D/YYYY variants that
          -- claim year < 1900 — those are exceedingly rare and can
          -- be handled by a follow-up if any surface in the wild.
          substring(date_value from '^([0-9]{4})-') is not null
          and (substring(date_value from '^([0-9]{4})-'))::int < 1900
        )
   );

notify pgrst, 'reload schema';
