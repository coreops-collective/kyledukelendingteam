// Tests for paginateAll — the fix for Kim's 2026-09-15 report,
// "Client for life tasks keep popping back up after refresh".
// No test framework in the repo; run with:
//   node src/lib/workflows.pagination.test.js
// Exits non-zero on failure.
//
// Background: task_completions grew past PostgREST's 1000-row response cap
// (1888 rows as of 2026-09-15). The unpaginated read returned only the first
// page, loadWorkflows rebuilt its index from that, and ~888 completions read
// back as unchecked. An off-by-one in the replacement range math would drop
// or duplicate rows just as silently, so the loop is tested directly.

import assert from 'node:assert/strict';
import { paginateAll, COMPLETIONS_PAGE_SIZE } from './workflows.js';

let ran = 0, failed = 0;
const tests = [];
function it(name, fn) { tests.push([name, fn]); }

// Serves `total` sequentially-numbered rows through a range-based API,
// recording the ranges requested so the math can be asserted.
function makeSource(total, pageSize) {
  const calls = [];
  const rows = Array.from({ length: total }, (_, i) => ({ id: i + 1 }));
  return {
    calls,
    fetchPage: async (from, to) => {
      calls.push([from, to]);
      assert.equal(to - from + 1, pageSize, `range width must equal the page size, got ${from}..${to}`);
      return rows.slice(from, to + 1);
    },
  };
}

it('returns every row when the table is larger than one page', async () => {
  // The real shape of the bug: 1888 rows, cap of 1000.
  const src = makeSource(1888, 1000);
  const out = await paginateAll(src.fetchPage, 1000);
  assert.equal(out.length, 1888, 'must not truncate at the cap');
  assert.equal(out[0].id, 1);
  assert.equal(out[1887].id, 1888);
});

it('requests contiguous, non-overlapping ranges', async () => {
  const src = makeSource(1888, 1000);
  await paginateAll(src.fetchPage, 1000);
  assert.deepEqual(src.calls, [[0, 999], [1000, 1999]]);
});

it('returns no duplicate rows', async () => {
  const out = await paginateAll(makeSource(2500, 1000).fetchPage, 1000);
  assert.equal(new Set(out.map((r) => r.id)).size, out.length, 'ids must be unique');
  assert.equal(out.length, 2500);
});

it('stops on a short page rather than looping', async () => {
  const src = makeSource(1500, 1000);
  const out = await paginateAll(src.fetchPage, 1000);
  assert.equal(out.length, 1500);
  assert.equal(src.calls.length, 2, 'second page is short, so no third request');
});

it('handles a total that is an exact multiple of the page size', async () => {
  // The classic off-by-one: 2000 rows must not stop at 1000, and must not
  // loop forever once the source is exhausted.
  const src = makeSource(2000, 1000);
  const out = await paginateAll(src.fetchPage, 1000);
  assert.equal(out.length, 2000);
  assert.equal(src.calls.length, 3, 'third request returns empty and ends the loop');
});

it('handles a table smaller than one page', async () => {
  const src = makeSource(42, 1000);
  const out = await paginateAll(src.fetchPage, 1000);
  assert.equal(out.length, 42);
  assert.equal(src.calls.length, 1);
});

it('handles an empty table without looping', async () => {
  const src = makeSource(0, 1000);
  const out = await paginateAll(src.fetchPage, 1000);
  assert.deepEqual(out, []);
  assert.equal(src.calls.length, 1);
});

it('propagates an error instead of returning a partial result', async () => {
  // This is the important one. Returning what it managed to fetch would
  // reproduce the original bug — loadWorkflows would clear COMPLETIONS and
  // rebuild from an incomplete set, marking real completions as unchecked.
  let call = 0;
  const failing = async (from, to) => {
    call += 1;
    if (call === 2) throw new Error('network blip');
    return Array.from({ length: 1000 }, (_, i) => ({ id: from + i + 1 }));
  };
  await assert.rejects(() => paginateAll(failing, 1000), /network blip/);
});

it('defaults to the 1000-row PostgREST cap', async () => {
  assert.equal(COMPLETIONS_PAGE_SIZE, 1000);
  const src = makeSource(1200, 1000);
  const out = await paginateAll(src.fetchPage); // no explicit size
  assert.equal(out.length, 1200);
});

it('works with a small page size (parameterization is real)', async () => {
  const src = makeSource(7, 3);
  const out = await paginateAll(src.fetchPage, 3);
  assert.equal(out.length, 7);
  assert.deepEqual(src.calls, [[0, 2], [3, 5], [6, 8]]);
});

(async () => {
  console.log('paginateAll');
  for (const [name, fn] of tests) {
    ran += 1;
    try { await fn(); console.log('  ✓', name); }
    catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
  }
  console.log(`\n${ran - failed}/${ran} passed`);
  if (failed) process.exit(1);
})();
