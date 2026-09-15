-- 056_dedupe_task_completions.sql
--
-- Removes redundant task_completions rows and makes a repeated check-off a
-- no-op instead of another row.
--
-- WHY THIS EXISTS
--
-- task_completions crossed PostgREST's 1000-row response cap on 2026-08-17.
-- The unpaginated read then silently truncated and ~888 of Kim's completions
-- read back as unchecked, which she reported as "tasks keep popping back up
-- after refresh". Migration-free fix for the read side shipped in #86.
--
-- This addresses the other half: why the table grew that fast, and why it
-- would grow that fast again.
--
-- WHAT THE DATA SHOWS
--
-- One task — 1ad95360 "Track funding + move file to closed tracking" — holds
-- 1479 of 1888 rows (78%). Every one has completed_by NULL: they are written
-- by a bulk action, not clicked individually.
--
-- Its writes land in four bursts, each inside a single minute:
--     2026-08-17 16:45  404 rows / 359 clients
--     2026-08-17 16:55  109 rows / 106 clients
--     2026-08-18 20:20   50 rows /  45 clients
--     2026-08-18 20:52  370 rows / 334 clients
--
-- The 16:45 burst contains ZERO duplicate keys — 404 rows over 359 clients is
-- just clients holding more than one loan. So each individual run is correct;
-- there is no loop. The duplicates come from the same bulk action being run
-- four times with nothing to make a re-run idempotent.
--
-- And the re-runs trace back to the truncation: the 16:45 burst is what
-- pushed the table past 1000, the completions stopped displaying as done, so
-- the action was run again. A feedback loop through the UI, not in code.
--
-- With the unique index below in place, runs 2, 3 and 4 would have been
-- no-ops and the table would never have crossed the cap.
--
-- SCOPE: 190 rows across 178 duplicate groups.
--   * 132 belong to task 1ad95360 (the bulk re-runs above)
--   *  58 are spread across 46 other task/client/due-date keys
-- Verified before writing this: zero groups have conflicting `outcome`
-- values, and zero have more than one `completed_by`. Within a group the
-- rows are semantically identical, so keeping the earliest loses nothing.
--
-- NO DATA LOSS: every row this deletes is copied to
-- task_completions_dedupe_backup_056 first, so the delete is reversible.
-- That table gets RLS enabled with no policies (deny-all) so it isn't
-- reachable through PostgREST; the service role still reads it.
--
-- ------------------------------------------------------------------
-- REVERSAL (exact — run the two statements in this order):
--
--   -- 1. Drop the constraint first, or the re-insert violates it.
--   drop index if exists public.task_completions_unique_completion;
--
--   -- 2. Put the rows back.
--   insert into public.task_completions
--     (id, task_id, client_name, due_date, completed_at, completed_by, outcome, loan_id)
--   select id, task_id, client_name, due_date, completed_at, completed_by, outcome, loan_id
--     from public.task_completions_dedupe_backup_056
--   on conflict (id) do nothing;
--
-- The backup table is left in place afterwards; drop it by hand once the
-- change has been live long enough to trust.
-- ------------------------------------------------------------------
--
-- Re-runnable: the backup insert is ON CONFLICT DO NOTHING, the delete
-- matches nothing once deduped, and the index is IF NOT EXISTS.
--
-- Additive except for the intentional de-dupe. No auth / RLS policy /
-- SECURITY DEFINER on existing objects touched.

-- 1. Backup table, shaped exactly like the source.
create table if not exists public.task_completions_dedupe_backup_056
  (like public.task_completions including all);

alter table public.task_completions_dedupe_backup_056 enable row level security;

-- 2. Copy out every row that is about to be deleted. Ranking keeps the
--    EARLIEST completion per key — the original check-off — and marks the
--    later re-inserts for removal.
insert into public.task_completions_dedupe_backup_056
  (id, task_id, client_name, due_date, completed_at, completed_by, outcome, loan_id)
select id, task_id, client_name, due_date, completed_at, completed_by, outcome, loan_id
  from (
    select *,
           row_number() over (
             partition by task_id, client_name, due_date, coalesce(loan_id, '')
             order by completed_at asc nulls last, id asc
           ) as rn
      from public.task_completions
  ) ranked
 where rn > 1
on conflict (id) do nothing;

-- 3. Delete the redundant rows.
delete from public.task_completions tc
 using (
   select id
     from (
       select id,
              row_number() over (
                partition by task_id, client_name, due_date, coalesce(loan_id, '')
                order by completed_at asc nulls last, id asc
              ) as rn
         from public.task_completions
     ) ranked
    where rn > 1
 ) dup
 where tc.id = dup.id;

-- 4. Stop it happening again.
--
-- coalesce(loan_id, '') rather than a bare column: 408 rows carry a NULL
-- loan_id, and a plain unique index treats every NULL as distinct — which
-- would leave exactly those rows unconstrained. due_date and client_name
-- have no NULLs, so they need no such treatment.
create unique index if not exists task_completions_unique_completion
  on public.task_completions (task_id, client_name, due_date, coalesce(loan_id, ''));

notify pgrst, 'reload schema';
