/**
 * POST { message, url, userAgent, callerEmail }
 * Emails the app's admin (PASSWORD_RESET_ADMIN_EMAIL, currently
 * lauren@coreopscollective.com) with a user-reported issue. Uses the
 * existing SMTP creds stored in email_settings, same as
 * send-notification / request-password-reset.
 *
 * Auth (S2 posture):
 *   - Origin allowlist (KDT_ALLOWED_ORIGIN)
 *   - Rate limit — 5/min (report-issue), so a bad click can't spam.
 *   - Caller must be a known users-table email; no anonymous reports
 *     since the button lives inside the signed-in app.
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
      `${SUPABASE_URL}/rest/v1/users?select=id,name&email=eq.${encodeURIComponent(email)}&limit=1`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return rows?.[0] || false;
  } catch { return false; }
}

// Basic HTML escape so a user typing < or > in their report doesn't
// break the email body.
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
  if (!(await checkRateLimit(event, 'report-issue', 5))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Too many requests. Give it a minute.' }) };
  }

  try {
    const { message, url, userAgent, callerEmail } = JSON.parse(event.body || '{}');
    const text = String(message || '').trim();
    if (!text) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Message is required' }) };

    const headerCaller = (event.headers['x-kdt-user-email'] || event.headers['X-KDT-User-Email'] || '').toString().trim().toLowerCase();
    const caller = headerCaller || String(callerEmail || '').trim().toLowerCase();
    const user = await knownEmail(caller);
    if (!user) {
      return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sign in first' }) };
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

    // Compose the report email. HTML for nice display in Gmail; text
    // fallback for plain-text clients.
    const now = new Date().toISOString();
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#222;line-height:1.5;font-size:14px">
        <div style="border-left:4px solid #C8102E;padding:12px 16px;background:#fafafa;border-radius:6px">
          <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.6px;font-weight:700">Issue reported</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px">${esc(user.name || caller)}</div>
        </div>
        <div style="margin-top:16px;padding:16px;background:#fff;border:1px solid #eee;border-radius:6px;white-space:pre-wrap">${esc(text)}</div>
        <table style="margin-top:16px;font-size:12px;color:#555;border-collapse:collapse">
          <tr><td style="padding:4px 12px 4px 0;color:#888">Reporter</td><td>${esc(user.name || '')} &lt;${esc(caller)}&gt;</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Page</td><td><a href="${esc(url || '')}">${esc(url || '(none)')}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Browser</td><td>${esc(userAgent || '(unknown)')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#888">Sent at</td><td>${now}</td></tr>
        </table>
      </div>
    `;
    const textBody =
      `Issue reported by ${user.name || caller} <${caller}>\n\n` +
      `${text}\n\n` +
      `--\nPage: ${url || '(none)'}\nBrowser: ${userAgent || '(unknown)'}\nSent at: ${now}\n`;

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: settings.username, pass: appPassword } });
    await transporter.sendMail({
      from: `"${settings.from_name || BRAND}" <${settings.username}>`,
      to: ADMIN_EMAIL,
      replyTo: caller || undefined,
      subject: `[${BRAND}] Issue reported — ${user.name || caller}`,
      text: textBody,
      html,
    });

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
