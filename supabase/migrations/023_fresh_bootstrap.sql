-- Fresh-Supabase bootstrap: create every table the app expects but that
-- has no dedicated CREATE TABLE migration. On the existing populated
-- project this is a no-op — all four tables already exist and every
-- statement is CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS. On a
-- brand-new Supabase project this makes the app runnable end-to-end.
--
-- Historical note: partners / users / tasks / loan_intakes were created
-- ad-hoc via Supabase Studio on the live project, so the ALTER migrations
-- that came later (004, 006, 007) never had a CREATE to build on. That
-- gap made this repo un-cloneable to a fresh Supabase — the ALTERs would
-- fail with "relation does not exist".
--
-- IF YOU'RE ON A FRESH SUPABASE PROJECT: run this migration FIRST, before
-- 004_partner_personal_fields, 006_partner_primary_lo, 007_team_dates,
-- and 016_client_profile_overrides. On the existing populated project
-- the order doesn't matter — everything short-circuits.
--
-- Run in Supabase SQL editor.

-- ── partners ──────────────────────────────────────────────────────────
-- Includes columns added by 004 (anniversary, favorite_restaurant, notes)
-- and 006 (primary_lo) so this file stands alone on a fresh project.
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brokerage text,
  state text,
  city text,
  phone text,
  email text,
  birthday date,
  anniversary date,
  spouse text,
  kids text,
  coffee_shop text,
  favorite_restaurant text,
  mailing_address text,
  social_handle text,
  tier text default 'Standard',
  lead_source text,
  notes text,
  primary_lo text,
  touches jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table partners add column if not exists anniversary date;
alter table partners add column if not exists favorite_restaurant text;
alter table partners add column if not exists notes text;
alter table partners add column if not exists primary_lo text;

alter table partners enable row level security;
drop policy if exists partners_all on partners;
create policy partners_all on partners for all to anon using (true) with check (true);

-- ── users ─────────────────────────────────────────────────────────────
-- id is text (not uuid) to match the legacy 'u1'/'u2' shape used by the
-- seed. The secure login RPC in 006_secure_login_rpc reads password
-- via SECURITY DEFINER so RLS still blocks direct anon reads.
create table if not exists users (
  id text primary key default 'u' || floor(random() * 1e9)::text,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null default 'loan_officer',
  initials text,
  nmls text,
  phone text,
  birthday date,
  spouse_name text,
  spouse_birthday date,
  marriage_anniversary date,
  work_anniversary date,
  created_at timestamptz default now()
);
alter table users add column if not exists birthday date;
alter table users add column if not exists spouse_name text;
alter table users add column if not exists spouse_birthday date;
alter table users add column if not exists marriage_anniversary date;
alter table users add column if not exists work_anniversary date;

-- Match the RLS posture 006_secure_login_rpc.sql expects — anon has NO
-- direct read on users, login flows through public.login().
alter table users enable row level security;

-- ── tasks (pipeline task tracker; separate from workflow tasks) ───────
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  project_id text,
  title text not null,
  status text default 'todo',
  priority text default 'medium',
  assignee text,
  due date,
  notes text,
  created_via text default 'manual',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table tasks enable row level security;
drop policy if exists tasks_all on tasks;
create policy tasks_all on tasks for all to anon using (true) with check (true);

-- ── loan_intakes (raw form submissions from the New Loan Intake form) ──
create table if not exists loan_intakes (
  id uuid primary key default gen_random_uuid(),
  client_kind text,
  existing_loan_id text,
  borrower_first text,
  borrower_last text,
  co_borrower text,
  co_borrower_phone text,
  co_borrower_email text,
  phone text,
  email text,
  loan_officer text,
  loan_type text,
  purpose text,
  estimated_amount numeric,
  credit_score int,
  pre_approval_amount numeric,
  property_address text,
  estimated_close_date date,
  agent text,
  lead_source text,
  status_notes text,
  stage text,
  is_locked text,
  order_appraisal_now text,
  appraisal_contact text,
  appraisal_notes text,
  title_company text,
  title_contact text,
  hoi_company text,
  closing_date date,
  underwriting_path text,
  borrower_story text,
  created_at timestamptz default now()
);

alter table loan_intakes enable row level security;
drop policy if exists loan_intakes_all on loan_intakes;
create policy loan_intakes_all on loan_intakes for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
