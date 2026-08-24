-- 051_fix_049_hide_suspect_client_dates.sql
--
-- Supersedes the UPDATE body in migration 049. That migration
-- assumed public.client_dates.date_value was a text column, but it's
-- actually a `date` type. Running 049 on a fresh DB fails at the
-- UPDATE with:
--
--   ERROR:  42883: function btrim(date) does not exist
--   LINE:   or btrim(date_value) = ''
--
-- Because PostgreSQL runs the whole block as one transaction, the
-- ADD COLUMN in 049 rolled back too — no state landed. This
-- migration re-runs the intent with date-native predicates instead
-- of text ones, and re-adds the column defensively so it's safe
-- either way (049 partially succeeded or didn't).
--
-- Additive-only. Idempotent. Reversible via:
--   update public.client_dates
--     set hidden_at = null
--     where hidden_at is not null;
--   -- (or) alter table public.client_dates drop column hidden_at;
--
-- No auth / RLS / SECURITY DEFINER touched.

alter table public.client_dates
  add column if not exists hidden_at timestamptz;

-- Date-native predicates: date_value is a `date`, not `text`.
--   * NULL — no date on file
--   * date '1970-01-01' — the epoch phantom (0-timestamp signature)
--   * < date '1900-01-01' — anything pre-1900 (garbage / typo)
update public.client_dates
   set hidden_at = now()
 where hidden_at is null
   and (date_value is null
        or date_value = date '1970-01-01'
        or date_value < date '1900-01-01');

notify pgrst, 'reload schema';
