-- Enable Supabase Realtime on the partners and loans tables so changes made
-- by one client are pushed to every other connected client over a websocket.
-- The Realtime helpers in src/lib/partnersStore.js and src/lib/loansStore.js
-- subscribe to postgres_changes events from these tables.
--
-- Idempotent: adding a table that's already a member of the publication will
-- error, so wrap each in a DO block that checks first.
-- Run in Supabase SQL editor.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'partners'
  ) then
    execute 'alter publication supabase_realtime add table partners';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loans'
  ) then
    execute 'alter publication supabase_realtime add table loans';
  end if;
end $$;

notify pgrst, 'reload schema';
