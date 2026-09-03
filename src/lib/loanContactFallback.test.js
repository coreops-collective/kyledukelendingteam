// Tests for resolveLoanContact — the Kim 2026-09-03 fallback fix.
// No test framework in the repo; run with:
//   node src/lib/loanContactFallback.test.js
// Exits non-zero on failure.

import assert from 'node:assert/strict';
import { resolveLoanContact } from './loanContactFallback.js';

// Fake profileLookup: takes a Map keyed by lowercased name.
function makeLookup(profilesByLower) {
  return (name) => profilesByLower.get((name || '').toLowerCase()) || null;
}

let ran = 0, failed = 0;
function it(name, fn) {
  ran += 1;
  try { fn(); console.log('  ✓', name); }
  catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
}

console.log('resolveLoanContact');

it('passes through phone/email when the loan blob has both', () => {
  const loan = { borrower: 'Nichol, Walker', phone: '860-555-0101', email: 'w@example.com' };
  const lookup = makeLookup(new Map([
    ['nichol, walker', { corrected_phone: '999-999-9999', corrected_email: 'other@example.com' }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '860-555-0101');
  assert.equal(out.email, 'w@example.com');
});

it("KIM'S BUG: imported live loan with blank blob falls back to corrected_phone / corrected_email", () => {
  const loan = {
    borrower: 'Nichol, Walker',
    phone: '',
    email: '',
    // stamped by migration 045 on imported past clients
    past_client_seed_name: 'Nichol, Walker',
  };
  const lookup = makeLookup(new Map([
    ['nichol, walker', { corrected_phone: '860-555-0101', corrected_email: 'w@example.com' }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '860-555-0101');
  assert.equal(out.email, 'w@example.com');
});

it('mixed: blob has phone, no email — fills email from profile, keeps blob phone', () => {
  const loan = { borrower: 'Adhikari, Prasanna', phone: '301-312-0725', email: '', past_client_seed_name: 'Adhikari, Prasanna' };
  const lookup = makeLookup(new Map([
    ['adhikari, prasanna', { corrected_phone: 'IGNORE-ME', corrected_email: 'adhikariprasan@gmail.com' }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '301-312-0725', 'blob phone wins even when profile has a value');
  assert.equal(out.email, 'adhikariprasan@gmail.com');
});

it('rename-safe: loan renamed away from past_client_seed_name, profile still keyed to seed name', () => {
  // Kim edited "Clouse" → "Andrew Clouse" in the drawer. Loan borrower
  // now says "Andrew Clouse", past_client_seed_name still "Clouse".
  // Contact edits she made pre-rename live under key 'clouse'.
  const loan = {
    borrower: 'Andrew Clouse',
    phone: '',
    email: '',
    past_client_seed_name: 'Clouse',
  };
  const lookup = makeLookup(new Map([
    ['clouse', { corrected_phone: '706-555-2020', corrected_email: 'aclouse@example.com' }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '706-555-2020');
  assert.equal(out.email, 'aclouse@example.com');
});

it('current-name lookup wins over seed-name when both have values', () => {
  // Kim renamed and then edited contacts under the new name — the
  // current-name profile takes precedence.
  const loan = {
    borrower: 'Andrew Clouse',
    phone: '',
    email: '',
    past_client_seed_name: 'Clouse',
  };
  const lookup = makeLookup(new Map([
    ['clouse',        { corrected_phone: 'OLD-706-555-2020', corrected_email: 'OLD@example.com' }],
    ['andrew clouse', { corrected_phone: '706-555-9999',     corrected_email: 'new@example.com' }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '706-555-9999');
  assert.equal(out.email, 'new@example.com');
});

it('no profile match anywhere — returns blank instead of throwing', () => {
  const loan = { borrower: 'Ghost, Client', phone: '', email: '', past_client_seed_name: '' };
  const lookup = makeLookup(new Map());
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '');
  assert.equal(out.email, '');
});

it('null/undefined loan — returns blank without throwing', () => {
  const lookup = makeLookup(new Map());
  const outA = resolveLoanContact(null, lookup);
  const outB = resolveLoanContact(undefined, lookup);
  assert.deepEqual(outA, { phone: '', email: '' });
  assert.deepEqual(outB, { phone: '', email: '' });
});

it('seed-name lookup skipped when seed matches current name (avoids redundant call)', () => {
  const loan = { borrower: 'Nichol, Walker', phone: '', email: '', past_client_seed_name: 'nichol, walker' };
  const calls = [];
  const lookup = (name) => { calls.push(name); return null; };
  resolveLoanContact(loan, lookup);
  assert.equal(calls.length, 1, `should only call profileLookup once, got ${calls.length}`);
  assert.equal(calls[0], 'Nichol, Walker');
});

it('profile has only phone (no email) — fills phone, leaves email blank', () => {
  const loan = { borrower: 'Solo, Case', phone: '', email: '', past_client_seed_name: 'Solo, Case' };
  const lookup = makeLookup(new Map([
    ['solo, case', { corrected_phone: '555-1234' /* no corrected_email */ }],
  ]));
  const out = resolveLoanContact(loan, lookup);
  assert.equal(out.phone, '555-1234');
  assert.equal(out.email, '');
});

console.log(`\n${ran - failed}/${ran} passed`);
if (failed) process.exit(1);
