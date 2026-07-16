-- Add a per-client CFL status so the team can remove someone from the
-- Client for Life view without deleting the record entirely — the loans
-- history + stats still count them, they just stop showing up on the
-- CFL follow-up board.
--
-- Values:
--   'active'         — appears on CFL as usual (default)
--   'do_not_contact' — removed from CFL; kept in stats. Never touch
--                      again unless they reach out.
--   'archived'       — removed from CFL; kept in stats. Not actively
--                      hostile, just paused (e.g. moved out of state,
--                      passed away, sold and rented, etc.).
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

alter table public.client_profiles
  add column if not exists cfl_status text default 'active';

alter table public.client_profiles
  add column if not exists cfl_status_reason text;

alter table public.client_profiles
  add column if not exists cfl_status_changed_at timestamptz;

create index if not exists client_profiles_cfl_status_idx
  on public.client_profiles (cfl_status);

notify pgrst, 'reload schema';
