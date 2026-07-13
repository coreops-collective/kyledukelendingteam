/**
 * POST { email, name } — emails the admin that a user needs a password
 * reset. Uses the existing email_settings row (same SMTP creds as
 * send-notification.js).
 *
 * Auth (S2): unauthenticated by nature (the user is trying to log in!),
 * so protection here is:
 *   - Origin allowlist (blocks cross-origin abuse from browsers)
 *   - Aggressive per-IP rate limit (S5) — 2/min
 *   - The submitted email MUST match a users row. Unknown emails silently
 *     succeed without emailing admin, so this endpoint can't be used to
 *     enumerate users or spam admin about arbitrary addresses.
 */

const nodemailer = require('nodemailer');
const nodeCrypto = require('crypto');

const ADMIN_EMAIL = process.env.PASSWORD_RESET_ADMIN_EMAIL || 'lauren@coreopscollective.com';
const BRAND = 'The Kyle Duke Team';
const ENC_PREFIX = 'enc:v1:';

function getEncKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}
function decrypt(value) {
  if (!value || typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) return value;
  const [ivB64, payloadB64] = value.slice(ENC_PREFIX.length).split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const payload = Buffer.from(payloadB64, 'base64');
  const tag = payload.slice(payload.length - 16);
  const ct = payload.slice(0, payload.length - 16);
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', getEncKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

function normalizeSupabaseUrl(raw) {
  if (!raw) return '';
  const url = String(raw).trim().replace(/\/+$/, '');
  const m = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  return m ? `https://${m[1]}.supabase.co` : url;
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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
    'Access-Control-Allow-Headers': 'Content-Type',
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

async function knownEmail(email) {
  if (!email) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id&email=eq.${encodeURIComponent(email)}&limit=1`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return !!rows?.[0]?.id;
  } catch { return false; }
}

exports.handler = async (event) => {
  const corsHeaders = corsHeadersFor(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Not configured' }) };

  const origin = event.headers.origin || event.headers.Origin || '';
  if (!isOriginAllowed(origin)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Origin not allowed' }) };
  }
  if (!(await checkRateLimit(event, 'request-password-reset', 2))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Too many requests. Try again in a minute.' }) };
  }

  try {
    const { email, name } = JSON.parse(event.body || '{}');
    const userEmail = String(email || '').trim().toLowerCase();
    if (!userEmail) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email required' }) };

    // Silently succeed on unknown emails so this endpoint can't be used
    // to probe for valid accounts. Admin only hears about real users.
    if (!(await knownEmail(userEmail))) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
    }

    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`, { headers: sbHeaders() });
    const [settings] = await settingsRes.json();
    if (!settings?.username) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, reason: 'Email delivery not configured' }) };
    }

    const appPassword = decrypt(settings.app_password || '');
    if (!appPassword) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: false, reason: 'No SMTP password' }) };
    }

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: settings.username, pass: appPassword } });
    await transporter.sendMail({
      from: `"${settings.from_name || BRAND}" <${settings.username}>`,
      to: ADMIN_EMAIL,
      subject: `[${BRAND}] Password reset requested — ${userEmail}`,
      text: `A user requested a password reset.\n\nEmail: ${userEmail}\nName: ${name || '(not provided)'}\nRequested at: ${new Date().toISOString()}\n\nReset their password in the Team tab of the dashboard.`,
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
