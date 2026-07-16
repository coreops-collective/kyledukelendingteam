-- Persist the PastClientDrawer's Follow-Up section (last contact date +
-- note entries) via client_profiles. Before this migration those fields
-- lived only in the in-memory client object, so a refresh dropped every
-- change on the floor.
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

alter table public.client_profiles
  add column if not exists last_contact date;

alter table public.client_profiles
  add column if not exists note_entries jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';
