-- Null out the legacy plaintext `password` column on every user row that
-- already has a bcrypt hash. Cleanup step after migration 028 rolled out
-- password_hash and switched the login RPC to hash-only checks.
--
-- Why this is safe:
--   * The login RPC (public.login) only inspects password_hash — plaintext
--     is no longer consulted for auth, so nulling it can't lock anyone out.
--   * set_user_password and change_password already null the plaintext
--     column per-row on any password write, so new writes stay clean.
--   * This migration only touches rows where password_hash IS NOT NULL, so
--     a row that somehow slipped past the 028 backfill keeps its plaintext
--     as a last-resort recovery path (a BM can still see it in the DB and
--     reset the user through Setup).
--
-- Session preservation: sessionStorage['kdt_user'] on every logged-in
-- browser is untouched. Nobody gets kicked out — this migration only
-- edits the plaintext column, which the app no longer reads.
--
-- Idempotent: re-running is a no-op once every hashed row has null
-- plaintext.
--
-- Run in Supabase SQL editor.

update public.users
set password = null
where password is not null
  and password_hash is not null;

notify pgrst, 'reload schema';
