/**
 * POST { to? } — sends a test email using stored Gmail SMTP creds.
 * Inlined helpers (see save-email-delivery for rationale).
 */

const nodemailer = require('nodemailer');
const nodeCrypto = require('crypto');

const BRAND = 'The Kyle Duke Team';
const ENC_PREFIX = 'enc:v1:';

function getEncKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) throw new Error('FIELD_ENCRYPTION_KEY not set in Netlify env.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error(`FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`);
  return key;
}
function decrypt(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  if (!value.startsWith(ENC_PREFIX)) return value;
  const [ivB64, payloadB64] = value.slice(ENC_PREFIX.length).split(':');
  if (!ivB64 || !payloadB64) throw new Error('Malformed encrypted value.');
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
  let url = String(raw).trim().replace(/\/+$/, '');
  const m = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  return m ? `https://${m[1]}.supabase.co` : url;
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

function stringifyError(err) {
  if (!err) return 'Unknown error';
  return String(err.response || err.message || err).slice(0, 400);
}

async function writeStatus(patch) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1`, {
      method: 'PATCH',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(patch),
    });
  } catch {}
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };

  try {
    const { to } = JSON.parse(event.body || '{}');
    const loadRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`, { headers: sbHeaders() });
    if (!loadRes.ok) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to load settings' }) };
    const [row] = await loadRes.json();
    if (!row) return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'email_settings row missing' }) };

    let appPassword = '';
    try { appPassword = decrypt(row.app_password || ''); }
    catch (err) {
      const msg = `Could not decrypt Gmail App Password: ${err.message}. Re-enter it.`;
      await writeStatus({ last_test_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg });
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: msg }) };
    }

    const username = (row.username || '').trim();
    if (!username || !appPassword) {
      const msg = 'Enter a Gmail address and App Password first.';
      await writeStatus({ last_test_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg });
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: msg }) };
    }
    const fromName = row.from_name || BRAND;
    const replyTo = (row.reply_to_email || '').trim();
    const recipient = (to && String(to).trim().includes('@')) ? String(to).trim() : username;

    try {
      const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: username, pass: appPassword } });
      await transporter.sendMail({
        from: `"${fromName}" <${username}>`,
        to: recipient,
        replyTo: replyTo || undefined,
        subject: `Test email from ${BRAND}`,
        text: `This is a test from ${BRAND} to confirm email notifications will deliver.\n\nIf you got this, your Gmail App Password is working.\n\nSent at ${new Date().toISOString()}.`,
      });
      await writeStatus({ last_test_at: new Date().toISOString(), last_test_ok: true, last_test_error: null, last_success_at: new Date().toISOString(), last_error: null });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sentTo: recipient }) };
    } catch (err) {
      const msg = stringifyError(err);
      await writeStatus({ last_test_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg, last_error_at: new Date().toISOString(), last_error: msg });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, error: msg }) };
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error', message: err.message }) };
  }
};
