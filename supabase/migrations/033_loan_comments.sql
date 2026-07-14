-- Threaded ops log per loan. Replaces the "single Notes field"
-- pattern with a chronological, authorship-stamped comment stream.
-- The legacy loan.notes field stays — it acts as a static description
-- surface; loan_comments is the running log.
--
-- Design decisions:
--   * loan_id is text to match the LOANS.id convention.
--   * Each row records the author's id + email + name at post time so
--     the display doesn't have to join the users table on every render
--     (which is behind RLS anyway).
--   * edited_at is null until the comment gets edited; used to render
--     an "(edited)" marker without a separate flag.
--   * body is a text blob; the client renders it verbatim and parses
--     @mentions client-side.
--
-- RLS matches other loan-adjacent tables — anon can read/write. Same
-- posture as the loans table itself. When per-user gating on loans
-- gets tightened, both tables get tightened together.
--
-- Additive-only, idempotent. Run in Supabase SQL editor.

create table if not exists public.loan_comments (
  id            uuid primary key default gen_random_uuid(),
  loan_id       text not null,
  author_id     text,
  author_email  text,
  author_name   text,
  body          text not null,
  created_at    timestamptz not null default now(),
  edited_at     timestamptz
);

create index if not exists loan_comments_loan_idx
  on public.loan_comments (loan_id, created_at desc);

alter table public.loan_comments enable row level security;

drop policy if exists loan_comments_all on public.loan_comments;
create policy loan_comments_all on public.loan_comments
  for all to anon using (true) with check (true);

notify pgrst, 'reload schema';
