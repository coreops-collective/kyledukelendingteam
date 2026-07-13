/**
 * POST { username, appPassword, fromName, replyToEmail, callerEmail }
 * Encrypts app password (AES-256-GCM) and upserts email_settings.id=1.
 * Inlined helpers (esbuild + _lib/ sibling imports = 502 on Netlify).
 *
 * Auth (S2): the caller must (a) come from an allowed Origin/Referer and
 * (b) present callerEmail matching an admin/branch_manager row in the
 * users table. The anon key alone is not enough to rewrite SMTP creds.
 * Rate-limited via public.rate_limit_bump (S5).
 */

const nodeCrypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';
function getEncKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY not set in Netlify env.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`);
  return key;
}
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return plaintext;
  if (plaintext === '') return '';
  if (typeof plaintext !== 'string') plaintext = String(plaintext);
  if (plaintext.startsWith(ENC_PREFIX)) return plaintext;
  const key = getEncKey();
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString('base64') + ':' + Buffer.concat([ct, tag]).toString('base64');
}

function normalizeSupabaseUrl(raw) {
  if (!raw) return '';
  let url = String(raw).trim().replace(/\/+$/, '');
  const m = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  return m ? `https://${m[1]}.supabase.co` : url;
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// ── Origin allowlist ─────────────────────────────────────────────────
// KDT_ALLOWED_ORIGIN can be a single origin ("https://example.com") or
// a comma-separated list. Empty / unset = allow all (dev only). Netlify
// preview builds set DEPLOY_URL; if the request origin matches that, we
// allow it too so PR previews still work without adding preview URLs
// to KDT_ALLOWED_ORIGIN by hand.
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

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

// Rate limit via public.rate_limit_bump RPC (migration 031). Fail-open on
// errors so a Supabase blip doesn't break admin actions.
async function checkRateLimit(event, endpoint, perMinute) {
  const ip = (event.headers['x-forwarded-for'] || event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || '')
    .toString().split(',')[0].trim() || 'unknown';
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/rate_limit_bump`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify({ p_ip: ip, p_endpoint: endpoint, p_per_minute: perMinute }),
    });
    if (!res.ok) return true;
    const ok = await res.json();
    return ok === true;
  } catch { return true; }
}

// Require the caller to identify as an admin/BM. Header wins; body is
// fallback for older clients during rollout.
async function requireAdminCaller(callerEmail) {
  if (!callerEmail) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=role&email=eq.${encodeURIComponent(callerEmail)}&limit=1`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    const role = rows?.[0]?.role;
    return role === 'branch_manager' || role === 'admin';
  } catch { return false; }
}

exports.handler = async (event) => {
  const corsHeaders = corsHeadersFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured', hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY }) };
  }

  const origin = event.headers.origin || event.headers.Origin || '';
  if (!isOriginAllowed(origin)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Origin not allowed' }) };
  }
  if (!(await checkRateLimit(event, 'save-email-delivery', 10))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Rate limit exceeded' }) };
  }

  try {
    const { username, appPassword, fromName, replyToEmail, callerEmail } = JSON.parse(event.body || '{}');
    const headerCaller = (event.headers['x-kdt-user-email'] || event.headers['X-KDT-User-Email'] || '').toString().trim().toLowerCase();
    const caller = headerCaller || String(callerEmail || '').trim().toLowerCase();
    if (!(await requireAdminCaller(caller))) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Admin access required' }) };
    }

    const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`, { headers: sbHeaders() });
    if (!loadRes.ok) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: `Failed to load email_settings (${loadRes.status})`, detail: await loadRes.text() }) };
    }
    const [prev] = await loadRes.json();

    let nextAppPassword;
    if (appPassword === '__KEEP__' || appPassword === undefined) nextAppPassword = prev?.app_password || '';
    else if (appPassword === '') nextAppPassword = '';
    else {
      try { nextAppPassword = encrypt(String(appPassword)); }
      catch (err) { return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Encryption not configured', detail: err.message }) }; }
    }

    const row = {
      id: 1,
      username: (username ?? prev?.username ?? '').toString().trim(),
      app_password: nextAppPassword,
      from_name: (fromName ?? prev?.from_name ?? '').toString(),
      reply_to_email: (replyToEmail ?? prev?.reply_to_email ?? '').toString().trim(),
      updated_at: new Date().toISOString(),
    };

    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (!saveRes.ok) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to save', detail: await saveRes.text() }) };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
