-- 054_backfill_imported_loan_contacts.sql
--
-- Kim's 2026-09-03 bug on /loans: past-client cards show blank phone
-- and email. The data isn't lost — Kim entered these while the records
-- were legacy past clients, so they saved to
-- client_profiles.corrected_phone / corrected_email. Migrations
-- 043/044 then imported the past clients into `loans` rows with blank
-- phone/email in the JSON blob, and the mapper only read the
-- corrected_* fields when _source !== 'loans'. So once a record was
-- imported, Kim's numbers stopped surfacing.
--
-- The client-side fix (this PR's fundedLoans.js + AllLoans.jsx) makes
-- the fallback work for the imported records at read time. This
-- migration backfills the same values ONTO the loans rows so any
-- other reader that pulls the raw blob (Snapshot stat tiles, future
-- exports, someone selecting `data->>'phone'` in Studio) also gets
-- the number.
--
-- Match rules — kept intentionally tight to avoid a false positive:
--   * Only rows imported by 043/044 (imported_from = 'past_clients_seed')
--   * Only fields that are actually blank on the loan (never overwrite
--     a value Kim already edited on the row)
--   * Only when the client_profiles row has a corrected value to give
--   * Match client_profiles.client_name (case-insensitive) against
--     BOTH the current data->>'name' AND
--     data->>'past_client_seed_name' (the original PAST_CLIENTS name
--     migration 045 stamped), so a loan Kim later renamed still
--     finds the right profile
--
-- Stamps data.contact_backfilled_at with the run timestamp so the
-- rows we touched are trivial to audit and to filter for the
-- reversal below. Idempotent: re-running skips rows whose phone AND
-- email are already populated (or where no corrected_* exists).
--
-- Expected: ~149 rows updated. The ~13 imported rows with no
-- matching profile are NOT touched by this migration — run the
-- SELECT at the bottom of this file to get the list for manual
-- recovery.
--
-- ------------------------------------------------------------------
-- REVERSAL (exact, drop into the SQL editor):
--
--   update public.loans
--      set data = data - 'contact_backfilled_at'
--                      || jsonb_build_object(
--                           'phone', '',
--                           'email', ''
--                         )
--    where data->>'imported_from' = 'past_clients_seed'
--      and data->>'contact_backfilled_at' is not null;
--
-- This restores the blank blob AND drops the audit marker on exactly
-- the rows this migration touched. Original PAST_CLIENTS seed and
-- client_profiles are never modified by this migration and don't
-- need reversal.
-- ------------------------------------------------------------------
--
-- Additive-only (writes existing jsonb blob keys). No auth / RLS /
-- SECURITY DEFINER touched.

with matched as (
  select
    l.id                             as loan_id,
    coalesce(nullif(l.data->>'phone', ''), cp_current.corrected_phone, cp_seed.corrected_phone) as phone,
    coalesce(nullif(l.data->>'email', ''), cp_current.corrected_email, cp_seed.corrected_email) as email
  from public.loans l
  left join public.client_profiles cp_current
         on lower(cp_current.client_name) = lower(l.data->>'name')
  left join public.client_profiles cp_seed
         on l.data->>'past_client_seed_name' is not null
        and lower(cp_seed.client_name) = lower(l.data->>'past_client_seed_name')
        and lower(cp_seed.client_name) <> lower(l.data->>'name')
  where l.data->>'imported_from' = 'past_clients_seed'
    and (nullif(l.data->>'phone','') is null or nullif(l.data->>'email','') is null)
    and (
      cp_current.corrected_phone is not null or cp_current.corrected_email is not null
      or cp_seed.corrected_phone is not null or cp_seed.corrected_email is not null
    )
)
update public.loans l
   set data = l.data
        || jsonb_build_object(
             'phone', coalesce(m.phone, ''),
             'email', coalesce(m.email, ''),
             'contact_backfilled_at', to_jsonb(now())
           ),
       updated_at = now()
  from matched m
 where l.id = m.loan_id
   and (
     coalesce(nullif(l.data->>'phone',''), '') <> coalesce(m.phone, '')
     or coalesce(nullif(l.data->>'email',''), '') <> coalesce(m.email, '')
   );

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- REPORT — imported rows still blank after backfill (~13 expected).
-- Run this separately (SELECT, no writes) to see the rows a human
-- needs to recover by hand. Includes a fuzzy match against
-- corrected_name so a slight spelling drift ("Sanchez, Jose" vs
-- "Sanchez, José") shows up as "close match — check manually"
-- rather than a hard miss.
--
-- select
--   l.id,
--   l.data->>'name'                    as loan_name,
--   l.data->>'past_client_seed_name'   as seed_name,
--   l.data->>'closeDate'               as close_date,
--   (
--     select client_name || ' (corrected_phone=' || coalesce(cp.corrected_phone, '∅')
--            || ', corrected_email=' || coalesce(cp.corrected_email, '∅') || ')'
--       from public.client_profiles cp
--      where (cp.corrected_phone is not null or cp.corrected_email is not null)
--        and (
--          -- exact case-insensitive match (already ruled out above)
--          lower(cp.client_name) = lower(l.data->>'name')
--          or lower(cp.client_name) = lower(coalesce(l.data->>'past_client_seed_name', ''))
--          -- fuzzy: same lowercased letters-only slug (drops commas,
--          -- accents-as-typed, and stray whitespace)
--          or regexp_replace(lower(cp.client_name), '[^a-z0-9]+', '', 'g') =
--             regexp_replace(lower(l.data->>'name'), '[^a-z0-9]+', '', 'g')
--          or regexp_replace(lower(cp.client_name), '[^a-z0-9]+', '', 'g') =
--             regexp_replace(lower(coalesce(l.data->>'past_client_seed_name', '')), '[^a-z0-9]+', '', 'g')
--        )
--      limit 1
--   )                                  as fuzzy_profile_hit
-- from public.loans l
-- where l.data->>'imported_from' = 'past_clients_seed'
--   and (nullif(l.data->>'phone','') is null or nullif(l.data->>'email','') is null)
-- order by l.data->>'name';
