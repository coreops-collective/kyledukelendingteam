'use strict';

// Tests for the Netlify function caller-verification helpers.
// No test framework in the repo; run with:
//   node netlify/lib/require-auth.test.cjs
// Exits non-zero on failure.
//
// The security property under test is NEGATIVE: an unverifiable caller must
// never resolve to an identity. Most of these assert that something is
// rejected, including the exact shapes that used to be accepted (a forged
// x-kdt-user-email header, a callerEmail body field).

const assert = require('node:assert/strict');
const {
  bearerToken, isAdminRole, normalizeSupabaseUrl,
  verifiedCaller, verifiedCallerProfile, verifiedAdmin,
} = require('./require-auth.cjs');

let ran = 0, failed = 0;
const tests = [];
function it(name, fn) { tests.push([name, fn]); }

// Builds a fake fetch. `userResponse` answers /auth/v1/user,
// `usersRowResponse` answers the PostgREST users lookup.
function fakeFetch({ userResponse, usersRowResponse, onCall } = {}) {
  return async (url, init) => {
    if (onCall) onCall(url, init);
    if (String(url).includes('/auth/v1/user')) {
      return userResponse || { ok: false, json: async () => ({}) };
    }
    return usersRowResponse || { ok: true, json: async () => [] };
  };
}
const ok = (body) => ({ ok: true, json: async () => body });
const notOk = (status = 401) => ({ ok: false, status, json: async () => ({ msg: 'bad jwt' }) });

const DEPS = { supabaseUrl: 'https://x.supabase.co', apiKey: 'k', serviceRoleKey: 'svc' };
const authed = (token) => ({ headers: { authorization: `Bearer ${token}` } });

// ── bearerToken ──────────────────────────────────────────────────────
it('bearerToken pulls the token from either header casing', () => {
  assert.equal(bearerToken({ headers: { authorization: 'Bearer abc' } }), 'abc');
  assert.equal(bearerToken({ headers: { Authorization: 'Bearer abc' } }), 'abc');
  assert.equal(bearerToken({ headers: { authorization: 'bearer abc' } }), 'abc');
});

it('bearerToken rejects malformed and missing values', () => {
  for (const raw of ['', 'abc', 'Basic abc', 'Bearer', 'Bearer ', 'Bearer a b']) {
    assert.equal(bearerToken({ headers: { authorization: raw } }), null, `should reject: ${JSON.stringify(raw)}`);
  }
  assert.equal(bearerToken({}), null);
  assert.equal(bearerToken({ headers: {} }), null);
  assert.equal(bearerToken(null), null);
});

// ── verifiedCaller ───────────────────────────────────────────────────
it('verifiedCaller returns the email from the VERIFIED response', async () => {
  const fetch = fakeFetch({ userResponse: ok({ id: 'auth-1', email: 'Kim@Valorhl.com' }) });
  const out = await verifiedCaller(authed('good'), { ...DEPS, fetch });
  assert.deepEqual(out, { email: 'kim@valorhl.com', authUserId: 'auth-1' });
});

it('REGRESSION: a forged x-kdt-user-email header grants nothing', async () => {
  // This is the exact shape of the old takeover.
  const fetch = fakeFetch({ userResponse: notOk() });
  const event = { headers: { 'x-kdt-user-email': 'kyle.duke@valorhl.com' } };
  assert.equal(await verifiedCaller(event, { ...DEPS, fetch }), null);
  assert.equal(await verifiedCallerProfile(event, { ...DEPS, fetch }), null);
  assert.equal(await verifiedAdmin(event, { ...DEPS, fetch }), null);
});

it('REGRESSION: a callerEmail body field grants nothing', async () => {
  const fetch = fakeFetch({ userResponse: notOk() });
  const event = { headers: {}, body: JSON.stringify({ callerEmail: 'kyle.duke@valorhl.com' }) };
  assert.equal(await verifiedAdmin(event, { ...DEPS, fetch }), null);
});

it('verifiedCaller rejects when GoTrue rejects the token', async () => {
  const fetch = fakeFetch({ userResponse: notOk(401) });
  assert.equal(await verifiedCaller(authed('expired'), { ...DEPS, fetch }), null);
});

it('verifiedCaller rejects when GoTrue returns a user with no email', async () => {
  const fetch = fakeFetch({ userResponse: ok({ id: 'auth-1' }) });
  assert.equal(await verifiedCaller(authed('good'), { ...DEPS, fetch }), null);
});

it('verifiedCaller rejects when the network throws', async () => {
  const fetch = async () => { throw new Error('ECONNRESET'); };
  assert.equal(await verifiedCaller(authed('good'), { ...DEPS, fetch }), null);
});

it('verifiedCaller rejects when the response body is not JSON', async () => {
  const fetch = fakeFetch({ userResponse: { ok: true, json: async () => { throw new Error('not json'); } } });
  assert.equal(await verifiedCaller(authed('good'), { ...DEPS, fetch }), null);
});

it('FAILS CLOSED when configuration is missing (no default-allow)', async () => {
  const fetch = fakeFetch({ userResponse: ok({ id: 'a', email: 'k@v.com' }) });
  assert.equal(await verifiedCaller(authed('good'), { supabaseUrl: '', apiKey: 'k', fetch }), null);
  assert.equal(await verifiedCaller(authed('good'), { supabaseUrl: 'https://x', apiKey: '', fetch }), null);
});

it('sends the token to GoTrue and never trusts a request-supplied email', async () => {
  const calls = [];
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-1', email: 'real@valorhl.com' }),
    onCall: (url, init) => calls.push({ url: String(url), init }),
  });
  const event = { headers: { authorization: 'Bearer tok', 'x-kdt-user-email': 'spoofed@evil.com' } };
  const out = await verifiedCaller(event, { ...DEPS, fetch });
  assert.equal(out.email, 'real@valorhl.com');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.ok(!JSON.stringify(calls[0]).includes('spoofed@evil.com'), 'spoofed email must not reach GoTrue');
});

// ── verifiedCallerProfile ────────────────────────────────────────────
it('verifiedCallerProfile resolves the role for a verified caller', async () => {
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-1', email: 'kim.chinquee@valorhl.com' }),
    usersRowResponse: ok([{ id: 'u-kim', name: 'Kimberly Chinquee', email: 'kim.chinquee@valorhl.com', role: 'admin' }]),
  });
  const out = await verifiedCallerProfile(authed('good'), { ...DEPS, fetch });
  assert.equal(out.appUserId, 'u-kim');
  assert.equal(out.role, 'admin');
  assert.equal(out.email, 'kim.chinquee@valorhl.com');
});

it('verifiedCallerProfile rejects a verified token with no matching users row', async () => {
  // Signed into Supabase Auth but not a hub user — must not resolve.
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-9', email: 'stranger@example.com' }),
    usersRowResponse: ok([]),
  });
  assert.equal(await verifiedCallerProfile(authed('good'), { ...DEPS, fetch }), null);
});

it('verifiedCallerProfile rejects when the service role key is absent', async () => {
  const fetch = fakeFetch({ userResponse: ok({ id: 'a', email: 'k@v.com' }) });
  const out = await verifiedCallerProfile(authed('good'), { ...DEPS, serviceRoleKey: '', fetch });
  assert.equal(out, null, 'must not fall back to an unprivileged read');
});

it('verifiedCallerProfile looks the user up by the verified email', async () => {
  const calls = [];
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-1', email: 'kim.chinquee@valorhl.com' }),
    usersRowResponse: ok([{ id: 'u-kim', role: 'admin' }]),
    onCall: (url) => calls.push(String(url)),
  });
  await verifiedCallerProfile({ headers: { authorization: 'Bearer t', 'x-kdt-user-email': 'kyle.duke@valorhl.com' } }, { ...DEPS, fetch });
  const lookup = calls.find((u) => u.includes('/rest/v1/users'));
  assert.ok(lookup.includes(encodeURIComponent('kim.chinquee@valorhl.com')), 'must query the verified email');
  assert.ok(!lookup.includes('kyle.duke'), 'must not query the header-supplied email');
});

// ── isAdminRole / verifiedAdmin ──────────────────────────────────────
it('isAdminRole accepts only branch_manager and admin', () => {
  assert.equal(isAdminRole('branch_manager'), true);
  assert.equal(isAdminRole('admin'), true);
  assert.equal(isAdminRole('loan_officer_assistant'), false);
  assert.equal(isAdminRole('loan_officer'), false);
  // NULL role must not pass — the fail-open case the security review caught.
  assert.equal(isAdminRole(null), false);
  assert.equal(isAdminRole(undefined), false);
  assert.equal(isAdminRole(''), false);
});

it('verifiedAdmin rejects a verified non-admin', async () => {
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-3', email: 'abel.garcia@valorhl.com' }),
    usersRowResponse: ok([{ id: 'u-abel', role: 'loan_officer_assistant' }]),
  });
  assert.equal(await verifiedAdmin(authed('good'), { ...DEPS, fetch }), null);
});

it('verifiedAdmin rejects a verified user whose role is NULL', async () => {
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-4', email: 'nobody@valorhl.com' }),
    usersRowResponse: ok([{ id: 'u-x', role: null }]),
  });
  assert.equal(await verifiedAdmin(authed('good'), { ...DEPS, fetch }), null);
});

it('verifiedAdmin accepts a verified admin', async () => {
  const fetch = fakeFetch({
    userResponse: ok({ id: 'auth-1', email: 'kyle.duke@valorhl.com' }),
    usersRowResponse: ok([{ id: 'u-kyle', role: 'branch_manager' }]),
  });
  const out = await verifiedAdmin(authed('good'), { ...DEPS, fetch });
  assert.equal(out.role, 'branch_manager');
});

// ── misc ─────────────────────────────────────────────────────────────
it('normalizeSupabaseUrl unwraps a dashboard URL and trims slashes', () => {
  assert.equal(normalizeSupabaseUrl('https://supabase.com/dashboard/project/abc123'), 'https://abc123.supabase.co');
  assert.equal(normalizeSupabaseUrl('https://x.supabase.co/'), 'https://x.supabase.co');
  assert.equal(normalizeSupabaseUrl(''), '');
});

(async () => {
  console.log('require-auth');
  for (const [name, fn] of tests) {
    ran += 1;
    try { await fn(); console.log('  ✓', name); }
    catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
  }
  console.log(`\n${ran - failed}/${ran} passed`);
  if (failed) process.exit(1);
})();
