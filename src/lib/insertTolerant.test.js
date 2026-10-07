// node src/lib/insertTolerant.test.js
import assert from 'node:assert';
import { missingColumnFrom, insertTolerant } from './insertTolerant.js';

let pass = 0;
const t = async (name, fn) => {
  await fn();
  console.log('  ✓', name);
  pass++;
};

// ── missingColumnFrom ───────────────────────────────────────────
await t("reads the column out of the real PostgREST message Kim's report carried", () => {
  assert.strictEqual(
    missingColumnFrom("Could not find the 'appraisal_notes' column of 'loan_intakes' in the schema cache"),
    'appraisal_notes',
  );
});

await t('reads the double-quoted PostgREST variant', () => {
  assert.strictEqual(
    missingColumnFrom('Could not find the "title_contact" column of "loan_intakes" in the schema cache'),
    'title_contact',
  );
});

await t('reads the Postgres "of relation ... does not exist" wording', () => {
  assert.strictEqual(
    missingColumnFrom('column "borrower_story" of relation "loan_intakes" does not exist'),
    'borrower_story',
  );
});

await t('reads the unquoted Postgres wording', () => {
  assert.strictEqual(missingColumnFrom('column interest_rate does not exist'), 'interest_rate');
});

await t('returns null for errors that are NOT about a missing column', () => {
  // The important negative case: these must never cause a field to be
  // dropped, or we would silently discard data on an unrelated failure.
  assert.strictEqual(missingColumnFrom('new row violates row-level security policy for table "loan_intakes"'), null);
  assert.strictEqual(missingColumnFrom('null value in column "id" violates not-null constraint'), null);
  assert.strictEqual(missingColumnFrom('duplicate key value violates unique constraint'), null);
  assert.strictEqual(missingColumnFrom('TypeError: Failed to fetch'), null);
  assert.strictEqual(missingColumnFrom(''), null);
  assert.strictEqual(missingColumnFrom(null), null);
  assert.strictEqual(missingColumnFrom(undefined), null);
});

// ── insertTolerant ──────────────────────────────────────────────
// Fake table that accepts only the columns it knows about, the way
// PostgREST does: one unknown key rejects the entire insert.
const fakeTable = (known) => {
  const calls = [];
  return {
    calls,
    insert: async (row) => {
      calls.push({ ...row });
      const unknown = Object.keys(row).find((k) => !known.includes(k));
      if (unknown) {
        return { data: null, error: { message: `Could not find the '${unknown}' column of 'loan_intakes' in the schema cache` } };
      }
      return { data: { id: 'row-1', ...row }, error: null };
    },
  };
};

await t('passes a fully-supported row straight through in one call', async () => {
  const tbl = fakeTable(['a', 'b']);
  const res = await insertTolerant({ a: 1, b: 2 }, tbl.insert);
  assert.strictEqual(res.error, null);
  assert.deepStrictEqual(res.dropped, []);
  assert.strictEqual(tbl.calls.length, 1);
});

await t('drops the one unknown column and the rest of the row lands', async () => {
  const tbl = fakeTable(['a', 'b']);
  const res = await insertTolerant({ a: 1, b: 2, appraisal_notes: 'x' }, tbl.insert);
  assert.strictEqual(res.error, null);
  assert.deepStrictEqual(res.dropped, ['appraisal_notes']);
  assert.deepStrictEqual(res.data, { id: 'row-1', a: 1, b: 2 });
});

await t('peels off ALL 16 missing intake columns, not just the first', async () => {
  // This is the regression that mattered: migration 053 added one column
  // and the next one broke it again. The live loan_intakes table was short
  // sixteen of the fields the form sends.
  const known = ['borrower_first', 'borrower_last', 'phone', 'email'];
  const missing = [
    'client_kind', 'existing_loan_id', 'co_borrower_phone', 'co_borrower_email',
    'estimated_close_date', 'is_locked', 'lock_expiration_date', 'interest_rate',
    'order_appraisal_now', 'appraisal_notes', 'title_company', 'title_contact',
    'hoi_company', 'closing_date', 'underwriting_path', 'borrower_story',
  ];
  const row = { borrower_first: 'Jasen', borrower_last: 'Smith', phone: '555', email: 'j@x.com' };
  for (const m of missing) row[m] = 'v';
  const tbl = fakeTable(known);
  const res = await insertTolerant(row, tbl.insert);
  assert.strictEqual(res.error, null);
  assert.strictEqual(res.dropped.length, 16);
  assert.deepStrictEqual(res.dropped.sort(), [...missing].sort());
  // The borrower's actual details survived — that's the whole point.
  assert.strictEqual(res.data.borrower_first, 'Jasen');
  assert.strictEqual(res.data.email, 'j@x.com');
});

await t('surfaces a non-column error instead of stripping fields', async () => {
  let calls = 0;
  const res = await insertTolerant({ a: 1, b: 2 }, async () => {
    calls++;
    return { data: null, error: { message: 'new row violates row-level security policy' } };
  });
  assert.ok(res.error, 'error should be returned, not swallowed');
  assert.deepStrictEqual(res.dropped, []);
  assert.strictEqual(calls, 1, 'must not retry an error it cannot fix');
});

await t('does not loop when the error names a column the row never sent', async () => {
  let calls = 0;
  const res = await insertTolerant({ a: 1 }, async () => {
    calls++;
    return { data: null, error: { message: "Could not find the 'something_else' column of 'x' in the schema cache" } };
  });
  assert.ok(res.error);
  assert.strictEqual(calls, 1);
  assert.deepStrictEqual(res.dropped, []);
});

await t('cannot spin forever even if the table rejects every single column', async () => {
  let calls = 0;
  const res = await insertTolerant({ a: 1, b: 2, c: 3 }, async (row) => {
    calls++;
    const k = Object.keys(row)[0];
    if (!k) return { data: null, error: { message: 'empty row' } };
    return { data: null, error: { message: `Could not find the '${k}' column of 'x' in the schema cache` } };
  });
  assert.ok(res.error);
  assert.ok(calls <= 4, `bounded by the key count, got ${calls} calls`);
});

await t('treats a THROWN error the same as a returned one', async () => {
  const tbl = fakeTable(['a']);
  let first = true;
  const res = await insertTolerant({ a: 1, nope: 2 }, async (row) => {
    if (first) {
      first = false;
      throw new Error("Could not find the 'nope' column of 'loan_intakes' in the schema cache");
    }
    return tbl.insert(row);
  });
  assert.strictEqual(res.error, null);
  assert.deepStrictEqual(res.dropped, ['nope']);
});

await t('reports each dropped column through onDrop so it can be logged', async () => {
  const seen = [];
  const tbl = fakeTable(['a']);
  await insertTolerant({ a: 1, x: 2, y: 3 }, tbl.insert, { onDrop: (c) => seen.push(c) });
  assert.deepStrictEqual(seen.sort(), ['x', 'y']);
});

await t('does not mutate the caller\'s row object', async () => {
  const tbl = fakeTable(['a']);
  const row = { a: 1, gone: 2 };
  await insertTolerant(row, tbl.insert);
  assert.deepStrictEqual(row, { a: 1, gone: 2 }, 'caller row must be untouched');
});

console.log(`\n${pass}/${pass} passed`);
