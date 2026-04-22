/**
 * POST { username, appPassword, fromName, replyToEmail }
 *
 * Encrypts the app password (AES-256-GCM, FIELD_ENCRYPTION_KEY) and
 * upserts the singleton email_settings row. If appPassword is the
 * sentinel "__KEEP__", the existing encrypted value is preserved.
 */

const {
  encrypt, SUPABASE_URL, SUPABASE_KEY, sbHeaders, corsHeaders,
} = require('./_lib/common');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const { username, appPassword, fromName, replyToEmail } = JSON.parse(event.body || '{}');

    const loadRes = await fetch(
      `${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`,
      { headers: sbHeaders() }
    );
    if (!loadRes.ok) {
      return {
        statusCode: 500, headers: corsHeaders,
        body: JSON.stringify({ error: `Failed to load email_settings (Supabase ${loadRes.status})` }),
      };
    }
    const [prev] = await loadRes.json();

    let nextAppPassword;
    if (appPassword === '__KEEP__' || appPassword === undefined) {
      nextAppPassword = prev?.app_password || '';
    } else if (appPassword === '') {
      nextAppPassword = '';
    } else {
      try {
        nextAppPassword = encrypt(String(appPassword));
      } catch (err) {
        return {
          statusCode: 500, headers: corsHeaders,
          body: JSON.stringify({ error: 'Encryption not configured', detail: err.message }),
        };
      }
    }

    const row = {
      id: 1,
      username: (username ?? prev?.username ?? '').toString().trim(),
      app_password: nextAppPassword,
      from_name: (fromName ?? prev?.from_name ?? '').toString(),
      reply_to_email: (replyToEmail ?? prev?.reply_to_email ?? '').toString().trim(),
      updated_at: new Date().toISOString(),
    };

    const saveRes = await fetch(
      `${SUPABASE_URL}/rest/v1/email_settings?id=eq.1`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      }
    );
    if (!saveRes.ok) {
      return {
        statusCode: 500, headers: corsHeaders,
        body: JSON.stringify({ error: 'Failed to save', detail: await saveRes.text() }),
      };
    }
    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
