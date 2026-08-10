-- 040_lockdown_rpc_grants.sql
--
-- Post-Supabase-Auth migration cleanup. Every SECURITY DEFINER RPC in
-- public was granted EXECUTE to `anon` for the pre-Supabase-Auth era
-- where the client had no user JWT and everything ran under the anon
-- key. Now that the client signs in with signInWithPassword and every
-- authenticated request carries a real user JWT, only the RPCs that
-- ACTUALLY run before the user is signed in should stay on `anon`.
--
-- Everything else is dropped to `authenticated` only so an unauthed
-- caller (curl with the anon key) can't invoke admin operations.
--
-- KEEP on anon (pre-auth callers):
--   login            — legacy, unused post-Auth-migration but kept per
--                       the security-review example. Safe to revoke in
--                       a follow-up if you want to drop the dead path.
--   audit_write      — src/views/Login.jsx records AUTH_LOGIN_FAILED
--                       against the submitted email BEFORE a user is
--                       authenticated. Must stay callable by anon.
--   list_users       — src/App.jsx runs loadUsersFromSupabase() in the
--                       mount Promise.all before any sign-in. Kept for
--                       now; app can gate this behind login in a
--                       follow-up (see notes in the PR).
--   rate_limit_bump  — mostly server-side (Netlify functions with
--                       service role) but low-risk (increments a
--                       counter row keyed by IP + endpoint). Kept in
--                       case future pre-auth rate limiting hooks in.
--
-- REVOKE from anon, GRANT to authenticated (post-auth callers only):
--   create_user, delete_user, set_user_password, change_password,
--   update_user_profile, set_user_role,
--   create_webhook_subscription, update_webhook_subscription,
--   delete_webhook_subscription
--
-- REVOKE from both anon and authenticated (never called from client,
-- only used internally inside other SECURITY DEFINER bodies):
--   _is_admin_user
--
-- SECURITY DEFINER continues to run each function with the DEFINER
-- role's privileges, so the internal SQL still succeeds regardless of
-- the caller's GRANTs — the grants only gate WHO can call the RPC.
--
-- Safe to re-run: revoke of a grant that's already gone is a no-op.

-- === User admin RPCs (post-auth only) ===
revoke execute on function public.create_user(text, text, text, text, text, text, text) from anon;
grant  execute on function public.create_user(text, text, text, text, text, text, text) to authenticated;

revoke execute on function public.delete_user(text) from anon;
grant  execute on function public.delete_user(text) to authenticated;

revoke execute on function public.set_user_password(text, text) from anon;
grant  execute on function public.set_user_password(text, text) to authenticated;

revoke execute on function public.change_password(text, text, text) from anon;
grant  execute on function public.change_password(text, text, text) to authenticated;

revoke execute on function public.update_user_profile(
  text, text, text, text, text, text, date, text, date, date, date
) from anon;
grant  execute on function public.update_user_profile(
  text, text, text, text, text, text, date, text, date, date, date
) to authenticated;

revoke execute on function public.set_user_role(text, text) from anon;
grant  execute on function public.set_user_role(text, text) to authenticated;

-- === Webhook admin RPCs (post-auth only) ===
revoke execute on function public.create_webhook_subscription(
  text, text, text, text, boolean, text
) from anon;
grant  execute on function public.create_webhook_subscription(
  text, text, text, text, boolean, text
) to authenticated;

revoke execute on function public.update_webhook_subscription(
  text, uuid, text, text, text, boolean, text
) from anon;
grant  execute on function public.update_webhook_subscription(
  text, uuid, text, text, text, boolean, text
) to authenticated;

revoke execute on function public.delete_webhook_subscription(text, uuid) from anon;
grant  execute on function public.delete_webhook_subscription(text, uuid) to authenticated;

-- === Internal helper (never called from any client) ===
-- Only reachable from SECURITY DEFINER bodies; those don't need the
-- caller to have any grant. Yanking both grants closes the door if
-- someone ever tries to call it directly with anon or a user JWT.
revoke execute on function public._is_admin_user(text) from anon;
revoke execute on function public._is_admin_user(text) from authenticated;

-- === Explicitly LEFT ALONE (pre-auth callers) ===
--   login(text, text)                              — anon + authenticated (unchanged)
--   audit_write(text,text,text,text,text,jsonb)    — anon + authenticated (unchanged)
--   list_users()                                    — anon + authenticated (unchanged)
--   rate_limit_bump(text, text, integer)            — anon + authenticated (unchanged)

notify pgrst, 'reload schema';
