/**
 * POST { email, name } — emails the admin that a user needs a password reset.
 * Uses the existing email_settings row (same SMTP creds as send-notification.js).
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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Not configured' }) };

  try {
    const { email, name } = JSON.parse(event.body || '{}');
    const userEmail = String(email || '').trim();
    if (!userEmail) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Email required' }) };

    const settingsRes = await fetch(`${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
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
