-- Add a generic overrides jsonb on client_profiles so legacy (seed)
-- past clients — the ones without a real loans-table row — can have
-- every field on the drawer edited and persisted without adding a
-- new column for each field.
--
-- Live loans keep writing directly to the loans row via markLoansDirty.
-- Legacy records fall through to client_profiles.past_client_overrides
-- keyed by client_name. Read path: on drawer open, hydrate the client
-- object with any overrides so the displayed values match the last
-- saved edit.
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

alter table public.client_profiles
  add column if not exists past_client_overrides jsonb default '{}'::jsonb;

notify pgrst, 'reload schema';
