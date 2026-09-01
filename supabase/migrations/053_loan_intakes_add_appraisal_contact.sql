-- 053_loan_intakes_add_appraisal_contact.sql
--
-- New Loan Intake save was failing on production with:
--   sbInsert(loan_intakes) failed: Could not find the
--   'appraisal_contact' column of 'loan_intakes' in the schema cache.
--
-- The column is referenced by src/views/NewLoan.jsx (line 237):
--     appraisal_contact: isContract ? (form.apprContact || null) : null,
-- and the form actually captures the field via the Appraisal Contact
-- input on the New Contract intake. Production's loan_intakes table
-- was built up incrementally and never got the appraisal_contact
-- column — migration 023 (fresh_bootstrap) added it in its full
-- table definition, but that migration only runs on a clean DB and
-- the prod table pre-dates it.
--
-- Fix: additive nullable column so the intake insert lands the
-- captured value. No backfill (all prior intakes just get NULL).
--
-- Additive-only. Idempotent (IF NOT EXISTS). Reversible via:
--   alter table public.loan_intakes drop column appraisal_contact;
-- (Doing so re-surfaces the original schema-cache error until the
-- client-side insert is updated in the same rollback.)
--
-- No auth / RLS / SECURITY DEFINER touched.

alter table public.loan_intakes
  add column if not exists appraisal_contact text;

notify pgrst, 'reload schema';
