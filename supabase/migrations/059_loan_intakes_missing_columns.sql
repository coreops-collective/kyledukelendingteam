-- 059: give loan_intakes the columns the New Loan Intake form actually sends.
--
-- Background. `loan_intakes` is the raw archive of every New Loan Intake
-- submission. The live table was created before 023_fresh_bootstrap.sql, so
-- that file's `create table if not exists loan_intakes (...)` was a no-op
-- against production and the columns it declares were never added. PostgREST
-- rejects an entire insert when any one key has no matching column, so the
-- archive has never recorded a single row: production `loan_intakes` is at
-- zero rows. Migration 053 added `appraisal_contact` after the same failure
-- was reported; the very next field (`appraisal_notes`) broke it again, which
-- is what Kim's 2026-10-05 report surfaced.
--
-- Note the loans themselves were never at risk. NewLoan.jsx persists the loan
-- via saveLoansNow() BEFORE this insert, and the insert is non-fatal. What was
-- lost is the raw-submission audit trail, not any client's loan.
--
-- Strictly additive: sixteen nullable columns, every one guarded by
-- IF NOT EXISTS, nothing renamed, dropped or transformed. Safe to re-run.
-- Types follow 023_fresh_bootstrap.sql where it declares the column;
-- lock_expiration_date and interest_rate are not declared anywhere, so they
-- take the types NewLoan.jsx actually writes (a date input and num()).
--
-- The client also degrades gracefully now (src/lib/insertTolerant.js), so a
-- future field added to the form ahead of its migration costs that one field
-- rather than the whole archive row.

alter table public.loan_intakes add column if not exists client_kind text;
alter table public.loan_intakes add column if not exists existing_loan_id text;
alter table public.loan_intakes add column if not exists co_borrower_phone text;
alter table public.loan_intakes add column if not exists co_borrower_email text;
alter table public.loan_intakes add column if not exists estimated_close_date date;
alter table public.loan_intakes add column if not exists is_locked text;
alter table public.loan_intakes add column if not exists lock_expiration_date date;
alter table public.loan_intakes add column if not exists interest_rate numeric;
alter table public.loan_intakes add column if not exists order_appraisal_now text;
alter table public.loan_intakes add column if not exists appraisal_notes text;
alter table public.loan_intakes add column if not exists title_company text;
alter table public.loan_intakes add column if not exists title_contact text;
alter table public.loan_intakes add column if not exists hoi_company text;
alter table public.loan_intakes add column if not exists closing_date date;
alter table public.loan_intakes add column if not exists underwriting_path text;
alter table public.loan_intakes add column if not exists borrower_story text;

notify pgrst, 'reload schema';
