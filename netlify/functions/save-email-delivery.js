/**
 * POST { username, appPassword, fromName, replyToEmail }
 * Encrypts app password (AES-256-GCM) and upserts email_settings.id=1.
 * Inlined helpers (esbuild + _lib/ sibling imports = 502 on Netlify).
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured', hasUrl: !!SUPABASE_URL, hasKey: !!SUPABASE_KEY }) };
  }

  try {
    const { username, appPassword, fromName, replyToEmail } = JSON.parse(event.body || '{}');

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
