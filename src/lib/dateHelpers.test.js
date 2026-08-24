// Lightweight assert-based tests for the client-date null / phantom
// guards Kim's 2026-08-20 birthday-task report exposed. No test
// framework in the repo — run with `node src/lib/dateHelpers.test.js`
// (from the repo root) and it exits non-zero on failure.
//
// Coverage:
//   - isPlausibleUserDate rejects null / undefined / non-Date / NaN
//   - isPlausibleUserDate rejects pre-1900 dates (the '1970-01-01' /
//     epoch / '0'-cast phantom that anchored a Jan-1 birthday task
//     on every client that had one on file)
//   - isPlausibleUserDate rejects >today+120y dates (fat-finger
//     4-digit-year typos)
//   - isPlausibleUserDate accepts a legitimate birthday
//
// Also covers the empty-birthdate / far-future assertions Lauren
// spec'd on the fix ticket, exercised end-to-end through
// parseLocalDate + isPlausibleUserDate as the app itself composes
// them inside buildAnchorsForClient.

import assert from 'node:assert/strict';
import { isPlausibleUserDate } from './dateHelpers.js';

function parseLocalDate(str) {
  // Inline copy of src/lib/clientDates.js#parseLocalDate so this
  // test file can run without pulling in the supabase client (which
  // Node can't import without a `type: module`-friendly build).
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

let ran = 0, failed = 0;
function it(name, fn) {
  ran += 1;
  try { fn(); console.log('  ✓', name); }
  catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
}

console.log('isPlausibleUserDate');
it('rejects null', () => assert.equal(isPlausibleUserDate(null), false));
it('rejects undefined', () => assert.equal(isPlausibleUserDate(undefined), false));
it('rejects a non-Date value', () => assert.equal(isPlausibleUserDate('2000-01-01'), false));
it('rejects Invalid Date', () => assert.equal(isPlausibleUserDate(new Date('not a date')), false));
it('rejects the Unix epoch (0 timestamp)', () => assert.equal(isPlausibleUserDate(new Date(0)), false));
it('rejects Jan 1 1970 epoch (the phantom-birthday case)', () => {
  assert.equal(isPlausibleUserDate(new Date(1970, 0, 1)), false);
});
it('rejects 1899-12-31 (edge)', () => assert.equal(isPlausibleUserDate(new Date(1899, 11, 31)), false));
it('accepts 1900-01-01 (edge)', () => assert.equal(isPlausibleUserDate(new Date(1900, 0, 1)), true));
it('accepts a normal birthday (1988-05-14)', () => {
  assert.equal(isPlausibleUserDate(new Date(1988, 4, 14)), true);
});
it('rejects a fat-finger far-future date', () => {
  const y = new Date().getFullYear() + 200;
  assert.equal(isPlausibleUserDate(new Date(y, 0, 1)), false);
});

console.log('parseLocalDate composed with isPlausibleUserDate (mirrors buildAnchorsForClient)');
it('empty birthday value -> no anchor', () => {
  const d = parseLocalDate('');
  assert.equal(d, null);
  assert.equal(isPlausibleUserDate(d), false);
});
it('whitespace-only birthday value -> no anchor', () => {
  const d = parseLocalDate('   ');
  assert.equal(d, null);
  assert.equal(isPlausibleUserDate(d), false);
});
it('literal "null" string -> no anchor', () => {
  const d = parseLocalDate('null');
  // parseLocalDate falls through to new Date('null') which is
  // Invalid Date on every engine we support, so returns null.
  assert.equal(d, null);
});
it('legit far-future birthday (10 years out) -> STILL anchored (product decision)', () => {
  const y = new Date().getFullYear() + 10;
  const d = parseLocalDate(`${y}-04-05`);
  assert.notEqual(d, null);
  assert.equal(isPlausibleUserDate(d), true);
  // NOTE: this is a plausible date, so the anchor IS set. The
  // decision to *not* emit the task until the birthday is closer
  // to today is a bucketing / visibility concern, not an anchor
  // one — see the TODO in workflows.js#generateTasksForClient.
});
it('legit birthday within the reminder window -> anchored', () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10);
  const d = parseLocalDate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`);
  assert.equal(isPlausibleUserDate(d), true);
});
it('epoch 1970-01-01 birthday value -> NO anchor (this was the bug)', () => {
  const d = parseLocalDate('1970-01-01');
  assert.notEqual(d, null); // it does parse — that's the whole problem
  assert.equal(isPlausibleUserDate(d), false); // …but the guard rejects it.
});

console.log(`\n${ran - failed}/${ran} passed`);
if (failed) process.exit(1);
