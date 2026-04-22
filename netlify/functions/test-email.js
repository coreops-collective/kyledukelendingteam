/**
 * POST { to? } — sends a test email using the stored Gmail SMTP creds.
 */

const nodemailer = require('nodemailer');
const {
  decrypt, SUPABASE_URL, SUPABASE_KEY, sbHeaders, corsHeaders, stringifyError,
} = require('./_lib/common');

const BRAND = 'The Kyle Duke Team';

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const { to } = JSON.parse(event.body || '{}');
    const loadRes = await fetch(
      `${SUPABASE_URL}/rest/v1/email_settings?id=eq.1&select=*`,
      { headers: sbHeaders() }
    );
    if (!loadRes.ok) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Failed to load settings' }) };
    }
    const [row] = await loadRes.json();
    if (!row) {
      return { statusCode: 404, headers: corsHeaders, body: JSON.stringify({ error: 'email_settings row missing' }) };
    }

    let appPassword = '';
    try { appPassword = decrypt(row.app_password || ''); }
    catch (err) {
      const msg = `Could not decrypt stored Gmail App Password: ${err.message}. Re-enter it in Setup → Email Delivery.`;
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
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: username, pass: appPassword },
      });
      await transporter.sendMail({
        from: `"${fromName}" <${username}>`,
        to: recipient,
        replyTo: replyTo || undefined,
        subject: `Test email from ${BRAND}`,
        text:
          `This is a test from ${BRAND} to confirm email notifications will deliver.\n\n` +
          `If you got this, your Gmail App Password is working.\n\n` +
          `Sent at ${new Date().toISOString()}.`,
      });
      await writeStatus({
        last_test_at: new Date().toISOString(), last_test_ok: true, last_test_error: null,
        last_success_at: new Date().toISOString(), last_error: null,
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sentTo: recipient }) };
    } catch (err) {
      const msg = stringifyError(err);
      await writeStatus({
        last_test_at: new Date().toISOString(), last_test_ok: false, last_test_error: msg,
        last_error_at: new Date().toISOString(), last_error: msg,
      });
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: false, error: msg }) };
    }
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Internal server error', message: err.message }) };
  }
};

async function writeStatus(patch) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/email_settings?id=eq.1`,
      {
        method: 'PATCH',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      }
    );
  } catch { /* diagnostic only */ }
}
