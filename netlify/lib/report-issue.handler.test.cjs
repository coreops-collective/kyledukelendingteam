'use strict';

// End-to-end wiring test for a rewired function handler.
//   node netlify/lib/report-issue.handler.test.cjs
//
// require-auth.test.cjs proves the helper rejects unverifiable callers. This
// proves the helper is actually WIRED IN — that the endpoint itself answers
// 401, rather than the helper being correct but unused.
//
// report-issue is the test subject because it's the most self-contained of
// the three (no encryption key needed to reach the auth check).

process.env.SUPABASE_URL = 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc-key';
process.env.KDT_ALLOWED_ORIGIN = '';

const assert = require('node:assert/strict');

let ran = 0, failed = 0;
const tests = [];
function it(name, fn) { tests.push([name, fn]); }

// Routes stubbed responses by URL. Anything unrecognized fails the test
// loudly rather than silently returning something permissive.
function installFetch({ authOk = false, authEmail = 'kim.chinquee@valorhl.com', usersRow = null } = {}) {
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    seen.push({ url: u, init });
    if (u.includes('/rpc/rate_limit_bump')) return { ok: true, json: async () => true };
    if (u.includes('/auth/v1/user')) {
      return authOk
        ? { ok: true, json: async () => ({ id: 'auth-1', email: authEmail }) }
        : { ok: false, status: 401, json: async () => ({ msg: 'invalid jwt' }) };
    }
    if (u.includes('/rest/v1/users')) return { ok: true, json: async () => (usersRow ? [usersRow] : []) };
    if (u.includes('/rest/v1/email_settings')) return { ok: true, json: async () => [{ username: '', app_password: '' }] };
    throw new Error(`unexpected fetch: ${u}`);
  };
  return seen;
}

// The function files are CommonJS with a .js extension inside a
// "type": "module" package, so plain node refuses to require them — Netlify
// only runs them because esbuild bundles them first. So bundle here too and
// test the artifact that actually ships. That also guards the failure mode
// recorded in save-email-delivery.js's header: a sibling helper import that
// esbuild fails to inline produces a 502 at runtime, which no amount of
// source-level testing would catch.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const repoRoot = path.resolve(__dirname, '../..');
// Bundle inside the repo so node can resolve the externalized nodemailer from
// the repo's node_modules. Cleaned up on exit.
const outDir = fs.mkdtempSync(path.join(repoRoot, '.fn-test-'));
const bundlePath = path.join(outDir, 'report-issue.cjs');
process.on('exit', () => { try { fs.rmSync(outDir, { recursive: true, force: true }); } catch {} });
execFileSync('npx', [
  'esbuild', 'netlify/functions/report-issue.js',
  '--bundle', '--platform=node', '--format=cjs', '--target=node18',
  '--external:nodemailer', `--outfile=${bundlePath}`,
], { cwd: repoRoot, stdio: 'pipe' });

const bundle = fs.readFileSync(bundlePath, 'utf8');
assert.ok(bundle.includes('/auth/v1/user'), 'require-auth helper must be inlined into the bundle, not left as an unresolved import');

const { handler } = require(bundlePath);

const post = (headers = {}, body = { message: 'something broke' }) => ({
  httpMethod: 'POST',
  headers: { origin: 'https://thekyleduketeam.netlify.app', ...headers },
  body: JSON.stringify(body),
});

it('rejects a request with no Authorization header', async () => {
  installFetch({ authOk: false });
  const res = await handler(post());
  assert.equal(res.statusCode, 401);
  assert.match(JSON.parse(res.body).error, /sign in/i);
});

it('REGRESSION: rejects a forged x-kdt-user-email header', async () => {
  // Pre-fix, this header alone identified the caller.
  installFetch({ authOk: false });
  const res = await handler(post({ 'x-kdt-user-email': 'kyle.duke@valorhl.com' }));
  assert.equal(res.statusCode, 401, 'a self-asserted email must not authenticate');
});

it('REGRESSION: rejects a callerEmail body field', async () => {
  installFetch({ authOk: false });
  const res = await handler(post({}, { message: 'hi', callerEmail: 'kyle.duke@valorhl.com' }));
  assert.equal(res.statusCode, 401, 'a self-asserted body field must not authenticate');
});

it('rejects a bearer token GoTrue does not recognize', async () => {
  installFetch({ authOk: false });
  const res = await handler(post({ authorization: 'Bearer forged-token' }));
  assert.equal(res.statusCode, 401);
});

it('rejects a valid token whose email is not a hub user', async () => {
  installFetch({ authOk: true, authEmail: 'stranger@example.com', usersRow: null });
  const res = await handler(post({ authorization: 'Bearer real-token' }));
  assert.equal(res.statusCode, 401);
});

it('accepts a valid token for a known user (proceeds past auth)', async () => {
  installFetch({
    authOk: true,
    usersRow: { id: 'u-kim', name: 'Kimberly Chinquee', email: 'kim.chinquee@valorhl.com', role: 'admin' },
  });
  const res = await handler(post({ authorization: 'Bearer real-token' }));
  // Gets past auth and stops at "email delivery not configured" (the stub
  // returns an empty settings row) — a 200 with ok:false, not a 401.
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).ok, false);
  assert.match(JSON.parse(res.body).reason, /not configured/i);
});

it('verifies the token against GoTrue rather than trusting the request', async () => {
  const seen = installFetch({
    authOk: true,
    usersRow: { id: 'u-kim', name: 'Kim', email: 'kim.chinquee@valorhl.com', role: 'admin' },
  });
  await handler(post({ authorization: 'Bearer real-token', 'x-kdt-user-email': 'kyle.duke@valorhl.com' }));

  const authCall = seen.find((c) => c.url.includes('/auth/v1/user'));
  assert.ok(authCall, 'must call GoTrue to verify the token');
  assert.equal(authCall.init.headers.Authorization, 'Bearer real-token');

  const userLookup = seen.find((c) => c.url.includes('/rest/v1/users'));
  assert.ok(userLookup.url.includes(encodeURIComponent('kim.chinquee@valorhl.com')), 'looks up the verified email');
  assert.ok(!userLookup.url.includes('kyle.duke'), 'never looks up the header-supplied email');
});

(async () => {
  console.log('report-issue handler (auth wiring)');
  for (const [name, fn] of tests) {
    ran += 1;
    try { await fn(); console.log('  ✓', name); }
    catch (err) { failed += 1; console.log('  ✗', name, '\n     ', err.message); }
  }
  console.log(`\n${ran - failed}/${ran} passed`);
  if (failed) process.exit(1);
})();
