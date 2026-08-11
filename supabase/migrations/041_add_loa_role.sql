-- 041_add_loa_role.sql
--
-- Extends set_user_role to accept 'loan_officer_assistant' (surfaced as
-- "LOA" in the UI). Everything else about the role — the app's isAdmin()
-- gate treating LOA like Admin, the Setup dropdown, the Roles &
-- Responsibilities labels — is client-side. This migration only relaxes
-- the server-side validation list so the Setup Save doesn't 400 with
-- "returns false" when someone picks LOA.
--
-- Backwards compatible — every existing role string still passes.
-- Idempotent (create-or-replace).

create or replace function public.set_user_role(
  p_target_id text,
  p_new_role text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_new_role not in ('branch_manager', 'admin', 'loan_officer_assistant', 'loan_officer') then
    return false;
  end if;
  update public.users set role = p_new_role where id = p_target_id::uuid;
  return found;
end;
$$;
revoke all on function public.set_user_role(text, text) from public;
grant execute on function public.set_user_role(text, text) to authenticated;

-- create_user has a similar constraint indirectly through its INSERT
-- validation. Its body just inserts the passed role verbatim, but the
-- CHECK constraint on public.users.role (added by migration 006) may
-- also need to be relaxed. This block adds LOA to the allowed set if
-- and only if the check constraint currently exists and doesn't
-- already include the new value.
do $$
declare
  cons_def text;
begin
  select pg_get_constraintdef(oid) into cons_def
    from pg_constraint
   where conname = 'users_role_check' and conrelid = 'public.users'::regclass;

  if cons_def is not null and cons_def not like '%loan_officer_assistant%' then
    alter table public.users drop constraint users_role_check;
    alter table public.users add constraint users_role_check
      check (role in ('branch_manager', 'admin', 'loan_officer_assistant', 'loan_officer'));
  end if;
end $$;

notify pgrst, 'reload schema';
