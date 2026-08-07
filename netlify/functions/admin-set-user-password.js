/**
 * POST { target_email, new_password }
 *
 * Admin operation: set another user's Supabase Auth password directly,
 * bypassing the email-reset flow entirely (which is what KDT's Setup
 * page needs when an admin picks a user other than themselves and types
 * a new password).
 *
 * Guardrails:
 *   1. Origin must be an allowed KDT_ALLOWED_ORIGIN.
 *   2. Caller must present x-kdt-user-email, and that email must resolve
 *      to a public.users row whose role is 'branch_manager' or 'admin'.
 *      Loan Officers cannot use this endpoint.
 *   3. Rate limited (per-IP) via rate_limit_bump.
 *   4. Uses the service role key (SUPABASE_SERVICE_ROLE_KEY) — MUST be
 *      set in Netlify env. The anon key does NOT have the admin scope
 *      required to reset a user's password.
 *
 * Response: { ok: true } on success, { ok: false, error } on failure.
 */

function normalizeSupabaseUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim().replace(/\/+$/, '');
  const m = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  return m ? `https://${m[1]}.supabase.co` : url;
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const RAW_ORIGINS = (process.env.KDT_ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const PREVIEW_ORIGIN = (process.env.DEPLOY_URL || '').trim();
function isOriginAllowed(origin) {
  if (RAW_ORIGINS.length === 0) return true;
  if (!origin) return false;
  if (RAW_ORIGINS.includes(origin)) return true;
  if (PREVIEW_ORIGIN && origin === PREVIEW_ORIGIN) return true;
  return false;
}
function corsHeadersFor(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowed = isOriginAllowed(origin) ? (origin || '*') : (RAW_ORIGINS[0] || '*');
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, x-kdt-user-email',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    'Vary': 'Origin',
  };
}
const sbHeaders = (key = SERVICE_ROLE_KEY) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

async function fetchProfileRole(email) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/users?select=id,role&email=eq.${encodeURIComponent(email)}&limit=1`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return (rows && rows[0]) || null;
}

async function fetchAuthUserIdByEmail(email) {
  // GoTrue admin API: list users, filter by email.
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(`email eq "${email}"`)}&per_page=1`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return null;
  const body = await res.json();
  const users = body?.users || [];
  return users[0]?.id || null;
}

async function checkRateLimit(event) {
  const ip = (event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '')
    .toString().split(',')[0].trim() || 'unknown';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rate_limit_bump`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ p_ip: ip, p_endpoint: 'admin-set-user-password', p_per_minute: 10 }),
    });
    if (!res.ok) return true;
    const ok = await res.json();
    return ok === true;
  } catch { return true; }
}

exports.handler = async (event) => {
  const corsHeaders = corsHeadersFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'admin-set-user-password not configured — SUPABASE_SERVICE_ROLE_KEY missing in Netlify env' }) };
  }
  const origin = event.headers.origin || event.headers.Origin || '';
  if (!isOriginAllowed(origin)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Origin not allowed' }) };
  }
  if (!(await checkRateLimit(event))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Rate limit exceeded' }) };
  }

  try {
    const { target_email, new_password } = JSON.parse(event.body || '{}');
    const callerEmail = ((event.headers['x-kdt-user-email'] || event.headers['X-KDT-User-Email'] || '') + '').trim().toLowerCase();
    if (!callerEmail) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Sign in first' }) };
    if (!target_email) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'target_email required' }) };
    if (!new_password || String(new_password).length < 8) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'new_password must be at least 8 characters' }) };
    }

    // Caller must be an admin/BM. Loan Officers can't reset other users.
    const caller = await fetchProfileRole(callerEmail);
    if (!caller) return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Caller not found in users table' }) };
    if (caller.role !== 'branch_manager' && caller.role !== 'admin') {
      return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ ok: false, error: 'Requires Admin or Branch Manager role' }) };
    }

    // Look up the target auth.users id by email.
    const authId = await fetchAuthUserIdByEmail(String(target_email).trim());
    if (!authId) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ ok: false, error: `No Supabase Auth user with email ${target_email}` }) };
    }

    // Set the password.
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authId}`, {
      method: 'PUT',
      headers: sbHeaders(),
      body: JSON.stringify({ password: new_password }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: `Supabase Auth admin: ${res.status} ${detail.slice(0, 200)}` }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ ok: false, error: err?.message || 'Unexpected error' }) };
  }
};
