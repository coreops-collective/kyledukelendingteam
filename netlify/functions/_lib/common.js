// Shared helpers for Netlify functions. Inlined crypto so esbuild
// doesn't choke on relative imports (learned from CoreOps Hub).

const nodeCrypto = require('crypto');

const ENC_PREFIX = 'enc:v1:';

function getEncKey() {
  const raw = process.env.FIELD_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY is not set in Netlify env. Generate one with ' +
      "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"` " +
      'and add it to Netlify → Site settings → Environment variables.'
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`FIELD_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`);
  }
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
  const dashMatch = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dashMatch) return `https://${dashMatch[1]}.supabase.co`;
  return url;
}

const SUPABASE_URL = normalizeSupabaseUrl(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''
);

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function stringifyError(err) {
  if (!err) return 'Unknown error';
  const msg = err.response || err.message || String(err);
  return String(msg).slice(0, 400);
}

module.exports = {
  ENC_PREFIX, encrypt, decrypt,
  SUPABASE_URL, SUPABASE_KEY, sbHeaders,
  corsHeaders, stringifyError,
};
