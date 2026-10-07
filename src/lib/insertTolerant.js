// Tolerant insert: when the database is missing a column the client sends,
// drop that one field and retry so the rest of the row still lands.
//
// Why this exists. The New Loan Intake form writes a raw copy of every
// submission to `loan_intakes`. PostgREST rejects the WHOLE insert if any
// single key has no matching column, so one field the schema hasn't caught
// up with silently costs the entire archive row. Migration 053 already
// patched this once by adding `appraisal_contact`; `appraisal_notes` then
// broke it again the same way, which is how Kim's 2026-10-05 report
// surfaced it. Adding columns one at a time does not fix the shape of the
// bug, so this strips whatever the error names and keeps going.
//
// This also satisfies the repo's graceful-downgrade rule (CLAUDE.md #3) for
// this write path. Same spirit as the hand-rolled downgrades in
// workflows.js / clientProfiles.js, but it reads the offending column out
// of the error instead of carrying a hardcoded list that has to be kept in
// sync with the form.
//
// Kept free of imports so it is runnable under plain `node` for tests.

// Pull the column name out of a Postgres or PostgREST "no such column"
// error. Returns null for anything else — a NOT NULL violation, an RLS
// refusal, a network blip — so real failures are never mistaken for a
// missing column and quietly papered over by dropping data.
export function missingColumnFrom(message) {
  const msg = String(message || '');
  if (!msg) return null;
  const patterns = [
    // PostgREST: Could not find the 'x' column of 'tbl' in the schema cache
    /could not find the '([^']+)' column\b[\s\S]*?in the schema cache/i,
    // PostgREST, double-quoted variant
    /could not find the "([^"]+)" column\b[\s\S]*?in the schema cache/i,
    // Postgres: column "x" of relation "tbl" does not exist
    /column "([^"]+)"[\s\S]*?does not exist/i,
    // Postgres, unquoted: column x does not exist
    /column ([a-z0-9_]+) does not exist/i,
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m && m[1]) return m[1];
  }
  return null;
}

// doInsert(row) -> { data, error } (or a thrown error, which is caught).
// Resolves to { data, error, dropped } where `dropped` lists the columns
// that had to be removed. maxDrops bounds the retry loop; it defaults to
// the row's own key count, so the worst case is one attempt per field and
// the loop cannot spin.
export async function insertTolerant(row, doInsert, { maxDrops, onDrop } = {}) {
  let current = { ...(row || {}) };
  const dropped = [];
  const limit = Number.isFinite(maxDrops) ? maxDrops : Object.keys(current).length;

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await doInsert(current);
    } catch (e) {
      res = { data: null, error: e };
    }
    const error = res && res.error;
    if (!error) return { data: res ? res.data : null, error: null, dropped };

    const col = missingColumnFrom(error.message || error);
    // Stop when the error isn't about a missing column, when the column it
    // names isn't one we're actually sending (retrying would change
    // nothing and loop), or when we've hit the drop budget.
    if (!col || !(col in current) || attempt >= limit) {
      return { data: null, error, dropped };
    }
    delete current[col];
    dropped.push(col);
    if (onDrop) onDrop(col);
  }
}
