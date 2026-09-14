'use strict';

/**
 * Caller verification for Netlify functions.
 *
 * Before this existed, every function identified its caller from an
 * `x-kdt-user-email` request header (or a `callerEmail` body field). Both are
 * claims the caller makes about themselves — anyone could send an admin's
 * address and pass the role check. That was an unauthenticated account
 * takeover through admin-set-user-password; see that file's header.
 *
 * The only trustworthy identity is the Supabase Auth JWT the browser already
 * holds after signInWithPassword. These helpers verify that token against
 * GoTrue and return the email FROM THE VERIFIED RESPONSE. Nothing here ever
 * reads an identity out of the request.
 *
 * Every failure path returns null. There is no fallback, no "dev mode" escape
 * hatch, and no default-allow when configuration is missing — a function that
 * cannot verify its caller must reject, not guess.
 */

function normalizeSupabaseUrl(raw) {
  if (!raw) return '';
  const url = String(raw).trim().replace(/\/+$/, '');
  const m = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  return m ? `https://${m[1]}.supabase.co` : url;
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const API_KEY = SERVICE_ROLE_KEY
  || process.env.SUPABASE_ANON_KEY
  || process.env.VITE_SUPABASE_ANON_KEY
  || '';

// Roles allowed to administer other users. Mirrors src/lib/auth.js, but this
// is the authoritative copy — the client's version is a UI convenience and
// can be edited by anyone with devtools.
const ADMIN_ROLES = ['branch_manager', 'admin'];

function bearerToken(event) {
  const headers = (event && event.headers) || {};
  const raw = headers.authorization || headers.Authorization || '';
  const m = /^Bearer\s+(\S+)$/i.exec(String(raw).trim());
  return m ? m[1] : null;
}

/**
 * Verify the caller's Supabase Auth token. Returns { email, authUserId } taken
 * from GoTrue's response, or null if the token is absent, malformed, expired,
 * revoked, or unverifiable.
 */
async function verifiedCaller(event, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = deps.supabaseUrl || SUPABASE_URL;
  const key = deps.apiKey || API_KEY;
  if (!url || !key || typeof doFetch !== 'function') return null;

  const token = bearerToken(event);
  if (!token) return null;

  let res;
  try {
    res = await doFetch(`${url}/auth/v1/user`, {
      headers: { apikey: key, Authorization: `Bearer ${token}` },
    });
  } catch { return null; }
  if (!res || !res.ok) return null;

  let user;
  try { user = await res.json(); } catch { return null; }

  const email = (user && user.email ? String(user.email) : '').trim().toLowerCase();
  if (!email) return null;
  return { email, authUserId: (user && user.id) || null };
}

/**
 * Verify the caller, then resolve their public.users profile by the VERIFIED
 * email. Returns { email, authUserId, appUserId, name, role } or null.
 *
 * Requires the service role key: public.users is not readable by anon, and
 * after the Phase 3 lockdown its role column must not be client-reachable.
 */
async function verifiedCallerProfile(event, deps = {}) {
  const doFetch = deps.fetch || globalThis.fetch;
  const url = deps.supabaseUrl || SUPABASE_URL;
  const serviceKey = deps.serviceRoleKey || SERVICE_ROLE_KEY;

  const caller = await verifiedCaller(event, deps);
  if (!caller) return null;
  if (!serviceKey) return null; // cannot read the role table — reject

  let res;
  try {
    res = await doFetch(
      `${url}/rest/v1/users?select=id,name,email,role&email=ilike.${encodeURIComponent(caller.email)}&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: 'application/json' } }
    );
  } catch { return null; }
  if (!res || !res.ok) return null;

  let rows;
  try { rows = await res.json(); } catch { return null; }
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !row.id) return null;

  return {
    email: caller.email,
    authUserId: caller.authUserId,
    appUserId: row.id,
    name: row.name || '',
    role: row.role || null,
  };
}

function isAdminRole(role) {
  return ADMIN_ROLES.includes(String(role || ''));
}

/**
 * Convenience wrapper: resolve the profile and require an admin-tier role.
 * Returns the profile or null. Note loan_officer_assistant is deliberately
 * NOT admin-tier here even though src/lib/auth.js treats it as such for UI
 * purposes — user administration is a narrower privilege than page access.
 */
async function verifiedAdmin(event, deps = {}) {
  const profile = await verifiedCallerProfile(event, deps);
  if (!profile || !isAdminRole(profile.role)) return null;
  return profile;
}

module.exports = {
  ADMIN_ROLES,
  bearerToken,
  isAdminRole,
  normalizeSupabaseUrl,
  verifiedCaller,
  verifiedCallerProfile,
  verifiedAdmin,
};
