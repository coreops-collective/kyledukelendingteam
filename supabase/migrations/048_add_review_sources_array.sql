-- 048_add_review_sources_array.sql
--
-- Kim's item 5: some clients leave reviews on multiple platforms
-- (Google + Zillow, Facebook + Google, etc.). The old single-select
-- `review_source` column only tracked one, so the second one got lost.
--
-- Fix: add a nullable `review_sources jsonb` column that holds an
-- array of source names. The existing `review_source` column is
-- LEFT IN PLACE (rule 1 — no data loss); the app writes to both
-- columns going forward (array to review_sources, first item mirrored
-- to review_source) so anything reading the legacy column keeps
-- working until every consumer is updated.
--
-- Read precedence: if review_sources is a non-empty array, prefer it;
-- otherwise fall back to [review_source] if that string is set.
--
-- Additive-only, IF NOT EXISTS, idempotent.

alter table public.client_profiles
  add column if not exists review_sources jsonb;

notify pgrst, 'reload schema';
