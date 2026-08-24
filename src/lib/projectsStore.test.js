// Lightweight assert-based tests for the pure pieces of the
// projects/tasks completion-persistence fix. No test framework in
// the repo — run with `node src/lib/projectsStore.test.js` and it
// exits non-zero on failure.
//
// The full store (createTask / updateTask / deleteTask / subscribe)
// isn't unit-tested here — those talk to Supabase and need env
// config to exercise meaningfully. Manual verification steps for the
// end-to-end persistence flow are in the PR body.
//
// What this file DOES cover:
//   * sameShape — the migration dedupe check. Kim's browser must NOT
//     re-push an untouched TASKS_SEED row into Supabase (that would
//     resurrect tasks Kyle already deleted from the shared DB).
//   * includeRow — the store's cache filter. A soft-deleted row
//     (deleted_at set) must never sit in the visible cache, no
//     matter how it got there (initial load, realtime insert,
//     realtime update).

import assert from 'node:assert/strict';

// Inline copies of the pure helpers so this test can run without
// pulling in the store's Supabase client. Keep in sync with the
// definitions in Projects.jsx / projectsStore.js.
function sameShape(a, b) {
  if (!a || !b) return false;
  const keys = ['projectId', 'title', 'status', 'priority', 'assignee', 'due', 'notes'];
  for (const k of keys) {
    if ((a[k] || '') !== (b[k] || '')) return false;
  }
  return true;
}
function includeRow(row) {
  return !!row && !row.deleted_at;
}

let ran = 0, failed = 0;
function it(name, fn) {
  ran += 1;
  try { fn(); console.log('  ✓', name); }
  catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
}

console.log('sameShape (migration dedupe)');
it('rejects null / undefined', () => {
  assert.equal(sameShape(null, {}), false);
  assert.equal(sameShape({}, null), false);
  assert.equal(sameShape(undefined, undefined), false);
});
it('matches an untouched seed clone', () => {
  const seed = { id: 'tk6', projectId: 'proj3', title: 'Migrate Loan Mgmt to new dashboard', status: 'inprogress', priority: 'high', assignee: 'Kyle Duke', due: '2026-04-30', notes: 'Working with Sunshine/Claude' };
  const clone = { ...seed };
  assert.equal(sameShape(seed, clone), true);
});
it("rejects when the user edited the title", () => {
  const seed = { projectId: 'proj3', title: 'Migrate Loan Mgmt', status: 'todo', priority: 'high', assignee: 'Kyle', due: '', notes: '' };
  const local = { ...seed, title: 'Migrate Loan Mgmt — DONE' };
  assert.equal(sameShape(seed, local), false);
});
it('rejects when the user changed status (moved it in the Kanban)', () => {
  const seed = { projectId: 'proj3', title: 'x', status: 'todo', priority: 'high', assignee: 'Kyle', due: '', notes: '' };
  const local = { ...seed, status: 'inprogress' };
  assert.equal(sameShape(seed, local), false);
});
it('treats undefined field vs empty string as equal (both fall through || "")', () => {
  const seed = { projectId: 'proj3', title: 'x', status: 'todo', priority: 'high', assignee: 'Kyle', due: '', notes: '' };
  const local = { projectId: 'proj3', title: 'x', status: 'todo', priority: 'high', assignee: 'Kyle' };
  assert.equal(sameShape(seed, local), true);
});

console.log('includeRow (soft-delete filter)');
it('rejects a null row', () => assert.equal(includeRow(null), false));
it('accepts a normal (non-deleted) row', () => {
  assert.equal(includeRow({ id: 'x', title: 'y', status: 'todo' }), true);
});
it('rejects a row with deleted_at set (soft-deleted)', () => {
  assert.equal(includeRow({ id: 'x', title: 'y', deleted_at: '2026-08-24T18:00:00Z' }), false);
});
it('accepts a row where deleted_at is explicitly null', () => {
  assert.equal(includeRow({ id: 'x', title: 'y', deleted_at: null }), true);
});

console.log(`\n${ran - failed}/${ran} passed`);
if (failed) process.exit(1);
