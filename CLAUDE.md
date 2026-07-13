# Repo rules for anyone (human or agent) working on this codebase

## THE TOUR RULE — non-negotiable

**Whenever you change the UI of a page that has a "Take a Tour" button, you MUST update that page's tour steps in the SAME commit.**

This rule is written and coded in on purpose. Do not ship a UI change without also updating the corresponding tour. There is no exception.

**What counts as "changing the UI":**
- Adding, removing, or reordering tabs / sub-tabs
- Adding, removing, or renaming a section, panel, button, field, or filter
- Changing the layout / structure of any feature the tour references
- Introducing a new interaction (bulk complete, drag-reorder, etc.)
- Removing a feature the tour currently mentions (Siri, etc.)
- Renaming any surface the tour targets with a CSS selector or data-tour attribute
- Anything a new user would notice on the page

**What you must update:**
1. The tour steps (usually named `<PAGE>_TOUR_STEPS` or `TOUR_STEPS` inside the view component).
2. Any `data-tour="..."` attributes on the elements the tour targets — add new ones for new elements, remove stale ones, keep them in sync with the step selectors.
3. If you added a new page with a tour, add its route to the `Take a Tour` button allowlist in `src/App.jsx`.

**Where the tour infrastructure lives:**
- Tour component: `src/components/Tour.jsx`
- Header button that fires the tour: `src/App.jsx` (search for `kdt-start-tour`)
- Every tour is a `TOUR_STEPS` (or similar) array + a `<Tour steps={…}>` render + an event listener for `kdt-start-tour`. The pattern is uniform across all views.

**Pages that currently have a tour** (as of this writing — update the list if you add or remove one):
- `/snapshot`, `/pipeline`, `/loanmgmt`, `/loans`, `/ratelocks`
- `/workflows`, `/clientforlife`, `/cfl`, `/tasks`, `/newloan`
- `/partners`, `/leadsources`, `/team`, `/roles`, `/performance`
- `/setup`, `/income`, `/netincome`

**Checklist before opening a PR that touches a view file:**
- [ ] Did I change what the user sees on this page? → If yes, update the tour.
- [ ] Did I add a new element the tour should highlight? → Add a `data-tour` attr + a new step.
- [ ] Did I remove an element a tour step mentions? → Remove or rewrite the step.
- [ ] Did I rename an element by class/data attr the tour targets? → Update the target selector.
- [ ] Does the tour still read top-to-bottom as an honest walkthrough of the current UI?

If a review or diff finds a tour that no longer matches the page, it's a **regression**. Fix it in the same PR that introduced the drift.

## The user's absolute constraints (from the original engagement)

1. **No data loss, ever.** All schema changes must be strictly additive (nullable columns, `IF NOT EXISTS`). Never rename, drop, or transform existing data without an explicit user instruction and confirmation.
2. **No session invalidation.** Never break existing user logins or auth flow without explicit permission. Every user currently signed in must still be signed in after your change.
3. **Graceful downgrades on new columns.** If a client-side write includes a field that a not-yet-run migration would add, detect the "column does not exist" or "in the schema cache" error, strip the field, and retry so the rest of the write lands. See `src/lib/workflows.js` for the pattern (loan_id, email_other_recipient).
4. **Realtime consistency.** Anything that writes to Supabase should also update the in-memory store so the current tab sees the change immediately, without waiting for the realtime echo.

## Migrations

- Migrations live in `supabase/migrations/NNN_name.sql`. Numbering is monotonic; the highest number in that folder is the latest one shipped.
- Every migration MUST end with `notify pgrst, 'reload schema';` so PostgREST picks up the change without a restart.
- Every migration MUST use `IF NOT EXISTS` on `CREATE` and `ADD COLUMN`, and `DROP POLICY IF EXISTS` before `CREATE POLICY`. Migrations must be safe to re-run.
- Never write a migration that renames or drops a column without an explicit user instruction naming the column.

## Style patterns

- Tabs use the standard Oswald caps + red underline treatment. See the Roles page tabs for the reference implementation.
- Section headers use `linear-gradient(135deg,var(--brand-black) 0%,#1f1f1f 100%)` with a `border-left: 4px solid var(--brand-red)`. Don't invent custom header colors — use `.section-card` + `.section-header`.
- Brand colors: `--brand-red: #C8102E`, `--brand-black: #0A0A0A`. Don't hardcode competing blues, greens, or oranges unless they carry semantic meaning (e.g. status colors, alerts).

## Testing / verification

- The dev container has no `node_modules`; running the app locally is not part of the standard flow. Verify by opening the deploy preview or asking the user to confirm.
- When in doubt, ask before shipping — pausing to confirm is cheap; a wrong change on shared infrastructure is expensive.
