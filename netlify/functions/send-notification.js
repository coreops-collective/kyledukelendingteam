/**
 * POST { event_type, context } — emails all matching notification_rules.
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

function render(template, ctx) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split('.').reduce((o, k) => (o == null ? o : o[k]), ctx);
    return val === undefined || val === null ? '' : String(val);
  });
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}

async function logRow(row) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/notification_log`, {
      method: 'POST',
      headers: { ...sbHeaders(), Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
  } catch {}
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };

  try {
    const { event_type, context = {} } = JSON.parse(event.body || '{}');
    if (!event_type) return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'event_type required' }) };

    const [settingsRows, rules, users] = await Promise.all([
      sbGet('email_settings?id=eq.1&select=*'),
      sbGet(`notification_rules?event_type=eq.${encodeURIComponent(event_type)}&enabled=eq.true&select=*`),
      sbGet('users?select=id,name,email,role'),
    ]);
    const settings = settingsRows[0];
    if (!settings || !settings.username) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'Email delivery not configured' }) };
    }
    if (!rules.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No matching rules' }) };
    }

    // Filter rules by stage_filter. Empty filter = fire always.
    // stage_filter stores stage KEYS (e.g. 'fresh', 'applied'), so prefer
    // the explicit *_key context fields. Fall back to the old label fields
    // for backward compatibility with any older callers.
    const incomingStage = context.new_stage_key
      || context.stage_key
      || context.new_stage
      || context.stage
      || null;
    const stageFiltered = rules.filter((r) => {
      const sf = Array.isArray(r.stage_filter) ? r.stage_filter : [];
      if (sf.length === 0) return true;
      if (!incomingStage) return false;
      return sf.includes(incomingStage);
    });
    if (!stageFiltered.length) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No rules match this stage' }) };
    }

    let appPassword;
    try { appPassword = decrypt(settings.app_password || ''); }
    catch (err) { return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Decryption failed', detail: err.message }) }; }
    if (!appPassword) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No app password' }) };

    const recipients = new Map();
    for (const r of stageFiltered) {
      if (r.role) users.filter(u => u.role === r.role).forEach(u => { if (u.email) recipients.set(u.email.toLowerCase(), { email: u.email, rule: r }); });
      else if (r.user_id) { const u = users.find(x => x.id === r.user_id); if (u?.email) recipients.set(u.email.toLowerCase(), { email: u.email, rule: r }); }
      else if (r.extra_email) recipients.set(r.extra_email.toLowerCase(), { email: r.extra_email, rule: r });
    }
    if (recipients.size === 0) return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No resolved recipients' }) };

    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: settings.username, pass: appPassword } });
    const fromName = settings.from_name || BRAND;
    const replyTo = (settings.reply_to_email || '').trim() || undefined;

    let sent = 0;
    const errors = [];
    for (const { email, rule } of recipients.values()) {
      const subject = render(rule.subject_template, context) || `[${BRAND}] ${event_type}`;
      const body = render(rule.body_template, context) || `Event: ${event_type}\n\n${JSON.stringify(context, null, 2)}`;
      try {
        await transporter.sendMail({ from: `"${fromName}" <${settings.username}>`, to: email, replyTo, subject, text: body });
        sent++;
        await logRow({ event_type, recipient_email: email, subject, status: 'sent', context });
      } catch (err) {
        const msg = stringifyError(err);
        errors.push({ email, msg });
        await logRow({ event_type, recipient_email: email, subject, status: 'error', error: msg, context });
      }
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: errors.length === 0, sent, errors }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
