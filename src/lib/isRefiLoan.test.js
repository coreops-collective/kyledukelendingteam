// Tests for isRefiLoan — the fix for Kim's 2026-09-16 request,
// "Have one year closing anniversary task exclude refinance transactions."
// No test framework in the repo; run with:
//   node src/lib/isRefiLoan.test.js
//
// The exclusion already existed: buildAnchorsForClient drops the
// 'Closing Anniversary' anchor for refis. But the "1 Year Closing
// Anniversary Card" task is configured with trigger_label 'Closing' and
// trigger_days 358 — it never touches that anchor, so the guard never
// applied to it. This detector now also backs an is_refinance task
// condition, so the same definition gates both.

import assert from 'node:assert/strict';
import { isRefiLoan } from './workflows.js';

let ran = 0, failed = 0;
function it(name, fn) {
  ran += 1;
  try { fn(); console.log('  ✓', name); }
  catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
}

console.log('isRefiLoan');

it("KIM'S CASE: imported past client with saleType REFINANCE", () => {
  // PC-Kellett-Samuel-2025-09-12 in production — saleType REFINANCE,
  // purpose NULL. This is the loan she was looking at when she reported.
  assert.equal(isRefiLoan({ saleType: 'REFINANCE', purpose: null }), true);
});

it('imported rows carry saleType only — purpose is NULL on all 368', () => {
  // Checking purpose alone would miss the entire historical book.
  assert.equal(isRefiLoan({ saleType: 'REFINANCE' }), true);
});

it('intake rows carry purpose only', () => {
  assert.equal(isRefiLoan({ purpose: 'Rate/Term Refi' }), true);
  assert.equal(isRefiLoan({ purpose: 'Cash-Out Refi' }), true);
});

it('purchases are not refis', () => {
  assert.equal(isRefiLoan({ saleType: 'PURCHASE', purpose: 'Purchase' }), false);
  assert.equal(isRefiLoan({ saleType: 'PURCHASE' }), false);
  assert.equal(isRefiLoan({ purpose: 'Purchase' }), false);
});

it('case-insensitive on both fields', () => {
  assert.equal(isRefiLoan({ saleType: 'refinance' }), true);
  assert.equal(isRefiLoan({ purpose: 'CASH-OUT REFI' }), true);
});

it('a loan with neither field set is treated as NOT a refi', () => {
  // 48 imported rows have neither. They keep getting the anniversary card —
  // a data gap, not a code one, and erring toward sending is the safer side.
  assert.equal(isRefiLoan({}), false);
  assert.equal(isRefiLoan({ saleType: '', purpose: '' }), false);
});

it('null/undefined loan returns false instead of throwing', () => {
  assert.equal(isRefiLoan(null), false);
  assert.equal(isRefiLoan(undefined), false);
});

it('does not false-positive on unrelated text containing no "refi"', () => {
  assert.equal(isRefiLoan({ purpose: 'Purchase', saleType: 'PURCHASE' }), false);
  assert.equal(isRefiLoan({ saleType: 'CONSTRUCTION' }), false);
});

console.log(`\n${ran - failed}/${ran} passed`);
if (failed) process.exit(1);
