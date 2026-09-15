// Tests for isArchived — the fix for Kim's 2026-09-11 report,
// "File (Swartz) marked archived but still appearing on this report".
// No test framework in the repo; run with:
//   node src/data/stages.test.js
// Exits non-zero on failure.
//
// A loan can be archived two independent ways: the `archived` flag (drawer
// Archive button) or status 'Archived' / stage 'cold' (status dropdown).
// Nothing kept them in sync, and RateLocks only tested the flag — so a loan
// Kim archived from the dropdown stayed on the report.

import assert from 'node:assert/strict';
import { isArchived, STATUS_TO_STAGE, STAGE_TO_STATUS } from './stages.js';

let ran = 0, failed = 0;
function it(name, fn) {
  ran += 1;
  try { fn(); console.log('  ✓', name); }
  catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
}

console.log('isArchived');

it('KIM\'S BUG: status Archived with no flag counts as archived', () => {
  // The exact shape of loan NLMPOSPIE5 (Swartz, Joseph) in production.
  const swartz = { status: 'Archived', stage: 'cold', archived: null, lockExp: '2026-08-12' };
  assert.equal(isArchived(swartz), true);
});

it('the archived flag alone counts as archived', () => {
  // Drawer Archive button, historically without touching status.
  assert.equal(isArchived({ archived: true, status: 'Applied', stage: 'applied' }), true);
  assert.equal(isArchived({ archived: true, status: null, stage: 'new' }), true);
});

it('stage cold alone counts as archived', () => {
  assert.equal(isArchived({ stage: 'cold' }), true);
});

it('both set counts as archived (the new write path sets both)', () => {
  assert.equal(isArchived({ archived: true, status: 'Archived', stage: 'cold' }), true);
});

it('an active loan is not archived', () => {
  assert.equal(isArchived({ status: 'Processing', stage: 'processing' }), false);
  assert.equal(isArchived({ status: 'Funded', stage: 'funded' }), false);
  assert.equal(isArchived({ status: 'HOT PA', stage: 'hotpa', archived: false }), false);
});

it('Adversed is NOT archived — they are separate states', () => {
  // Views filter Adversed separately; conflating them would hide loans from
  // the Adversed filter.
  assert.equal(isArchived({ status: 'Adversed', stage: 'disclosed' }), false);
});

it('archived:false does not count, even as a string-ish falsy', () => {
  assert.equal(isArchived({ archived: false, status: 'Applied' }), false);
});

it('null/undefined loan returns false instead of throwing', () => {
  assert.equal(isArchived(null), false);
  assert.equal(isArchived(undefined), false);
  assert.equal(isArchived({}), false);
});

it('the status/stage vocabulary still round-trips for Archived', () => {
  // isArchived leans on these staying aligned.
  assert.equal(STATUS_TO_STAGE['Archived'], 'cold');
  assert.equal(STAGE_TO_STATUS['cold'], 'Archived');
});

console.log(`\n${ran - failed}/${ran} passed`);
if (failed) process.exit(1);
