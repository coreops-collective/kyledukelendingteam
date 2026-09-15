-- 055_backfill_imported_loan_coborrowers.sql
--
-- Kim, 2026-09-15, twice on /clientforlife:
--   "No closing on file for Precious Buckner... but she is a coborrower on
--    Joshua Buckner's file. Seems some co borrowers are not syncing to the
--    loan cards."
--   "Billy Anderson - another co borrower that is not linking to loan"
--
-- Same shape as the phone/email problem migration 054 fixed. Kim entered
-- co-borrower details while those records were legacy past clients, so they
-- saved to client_profiles.co_borrower_first / _last / _phone / _email.
-- Migrations 043/044 then imported the same people into `loans` rows with no
-- co-borrower keys at all.
--
-- CFL builds its co-borrower client cards from the LOAN row
-- (src/views/CFL.jsx:176, `l.coFirst || l.c2first`), not from
-- client_profiles. With those keys absent the co-borrower either gets no
-- card, or gets one that can't pair back to a loan — which is what Kim sees
-- as "no closing on file".
--
-- 367 of 368 imported rows carry no co-borrower value in either key family.
-- 105 of those have details waiting in client_profiles. This fills those 105.
--
-- Writes BOTH key families (coFirst and c2first, etc). Every reader checks
-- both, so one would technically do — but the app dual-writes everywhere
-- (NewLoan.jsx:320-327, the alias maps in LoanDrawer.jsx:70-71 and
-- LoanManagement.jsx:1341-1342), and matching that convention avoids a row
-- where the two families disagree.
--
-- Match rules, kept tight to avoid a false positive:
--   * Only rows imported by 043/044 (imported_from = 'past_clients_seed')
--   * Only rows with NO co-borrower value in EITHER family — never overwrite
--     anything Kim already typed
--   * Only when the client_profiles row actually has something to give
--   * Match client_profiles.client_name (case-insensitive) against BOTH
--     data->>'name' and data->>'past_client_seed_name' (the original
--     PAST_CLIENTS name stamped by 045), so a loan Kim later renamed still
--     finds its profile. Where both match, the current name wins.
--
-- Idempotent: the WHERE clause requires all four fields blank, so a re-run
-- matches nothing once the rows are filled.
--
-- ------------------------------------------------------------------
-- HEADS-UP, not a database concern but a real one:
--
-- src/lib/workflows.js:562 routes co-borrower workflow email via
--   `loan?.coEmail || loan?.c2email`
-- All 105 of these rows bring an email. Once this lands, any workflow task
-- whose recipient is 'co_borrower' will begin ACTUALLY DELIVERING to those
-- addresses, where today it resolves to '' and sends nothing.
--
-- No mail is sent by this migration. The change is in who receives workflow
-- email from here on, and Kim should be told before she triggers one.
-- ------------------------------------------------------------------
--
-- ------------------------------------------------------------------
-- REVERSAL (exact, drop into the SQL editor):
--
--   update public.loans
--      set data = data - 'coFirst' - 'coLast' - 'coPhone' - 'coEmail'
--                      - 'c2first' - 'c2last' - 'c2phone' - 'c2email'
--                      - 'coborrower_backfilled_at'
--    where data->>'imported_from' = 'past_clients_seed'
--      and data->>'coborrower_backfilled_at' is not null;
--
-- Removes the keys entirely rather than blanking them, which is the true
-- prior state — these rows had no co-borrower keys at all. Only rows this
-- migration stamped are touched. client_profiles is never modified and needs
-- no reversal.
-- ------------------------------------------------------------------
--
-- Additive-only (writes jsonb blob keys). No schema change. No auth / RLS /
-- SECURITY DEFINER touched.

with matched as (
  select
    l.id                     as loan_id,
    cp.co_borrower_first     as co_first,
    cp.co_borrower_last      as co_last,
    cp.co_borrower_phone     as co_phone,
    cp.co_borrower_email     as co_email
  from public.loans l
  cross join lateral (
    select cpx.*
      from public.client_profiles cpx
     where lower(cpx.client_name) = lower(l.data->>'name')
        or lower(cpx.client_name) = lower(nullif(l.data->>'past_client_seed_name', ''))
     -- Prefer a profile keyed to the loan's CURRENT name over one keyed to
     -- the original seed name, so a post-rename edit wins.
     order by (lower(cpx.client_name) = lower(l.data->>'name')) desc,
              cpx.client_name
     limit 1
  ) cp
  where l.data->>'imported_from' = 'past_clients_seed'
    and coalesce(nullif(l.data->>'coFirst', ''), nullif(l.data->>'c2first', '')) is null
    and coalesce(nullif(l.data->>'coLast',  ''), nullif(l.data->>'c2last',  '')) is null
    and coalesce(nullif(l.data->>'coPhone', ''), nullif(l.data->>'c2phone', '')) is null
    and coalesce(nullif(l.data->>'coEmail', ''), nullif(l.data->>'c2email', '')) is null
    and (
      nullif(cp.co_borrower_first, '') is not null
      or nullif(cp.co_borrower_last,  '') is not null
      or nullif(cp.co_borrower_phone, '') is not null
      or nullif(cp.co_borrower_email, '') is not null
    )
)
update public.loans l
   set data = l.data
        || jsonb_build_object(
             'coFirst', coalesce(m.co_first, ''), 'c2first', coalesce(m.co_first, ''),
             'coLast',  coalesce(m.co_last,  ''), 'c2last',  coalesce(m.co_last,  ''),
             'coPhone', coalesce(m.co_phone, ''), 'c2phone', coalesce(m.co_phone, ''),
             'coEmail', coalesce(m.co_email, ''), 'c2email', coalesce(m.co_email, ''),
             'coborrower_backfilled_at', to_jsonb(now())
           ),
       updated_at = now()
  from matched m
 where l.id = m.loan_id;

notify pgrst, 'reload schema';

-- ------------------------------------------------------------------
-- REPORT — imported rows still without a co-borrower after this runs.
-- Most are genuinely single-borrower loans, so this is informational
-- rather than a recovery list. Run separately (SELECT, no writes).
--
-- select l.id,
--        l.data->>'name'                  as loan_name,
--        l.data->>'past_client_seed_name' as seed_name,
--        l.data->>'closeDate'             as close_date
--   from public.loans l
--  where l.data->>'imported_from' = 'past_clients_seed'
--    and coalesce(nullif(l.data->>'coFirst',''), nullif(l.data->>'c2first','')) is null
--  order by l.data->>'name';
