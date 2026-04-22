/**
 * POST { event_type, context }
 * Looks up notification_rules for that event, resolves recipients
 * (role → users, user_id → email, extra_email direct), and sends via the
 * shared Gmail SMTP creds. Logs every attempt to notification_log.
 *
 * Simple template rendering: {{field.path}} looks up into `context`.
 */

const nodemailer = require('nodemailer');
const {
  decrypt, SUPABASE_URL, SUPABASE_KEY, sbHeaders, corsHeaders, stringifyError,
} = require('./_lib/common');

const BRAND = 'The Kyle Duke Team';

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
    await fetch(
      `${SUPABASE_URL}/rest/v1/notification_log`,
      { method: 'POST', headers: { ...sbHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify(row) }
    );
  } catch { /* never fail the main flow on logging errors */ }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: corsHeaders, body: '' };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Database not configured' }) };
  }

  try {
    const { event_type, context = {} } = JSON.parse(event.body || '{}');
    if (!event_type) {
      return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'event_type required' }) };
    }

    // Load email settings + matching rules + users (for role→email resolution)
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

    let appPassword;
    try { appPassword = decrypt(settings.app_password || ''); }
    catch (err) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: 'Decryption failed', detail: err.message }) };
    }
    if (!appPassword) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No app password' }) };
    }

    // Resolve recipient list, de-duped by email.
    const recipients = new Map();
    for (const r of rules) {
      if (r.role) {
        users.filter(u => u.role === r.role).forEach(u => {
          if (u.email) recipients.set(u.email.toLowerCase(), { email: u.email, rule: r });
        });
      } else if (r.user_id) {
        const u = users.find(x => x.id === r.user_id);
        if (u?.email) recipients.set(u.email.toLowerCase(), { email: u.email, rule: r });
      } else if (r.extra_email) {
        recipients.set(r.extra_email.toLowerCase(), { email: r.extra_email, rule: r });
      }
    }
    if (recipients.size === 0) {
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, sent: 0, reason: 'No resolved recipients' }) };
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: settings.username, pass: appPassword },
    });
    const fromName = settings.from_name || BRAND;
    const replyTo = (settings.reply_to_email || '').trim() || undefined;

    let sent = 0;
    const errors = [];
    for (const { email, rule } of recipients.values()) {
      const subject = render(rule.subject_template, context) || `[${BRAND}] ${event_type}`;
      const body = render(rule.body_template, context) ||
        `Event: ${event_type}\n\n${JSON.stringify(context, null, 2)}`;
      try {
        await transporter.sendMail({
          from: `"${fromName}" <${settings.username}>`,
          to: email,
          replyTo,
          subject,
          text: body,
        });
        sent++;
        await logRow({ event_type, recipient_email: email, subject, status: 'sent', context });
      } catch (err) {
        const msg = stringifyError(err);
        errors.push({ email, msg });
        await logRow({ event_type, recipient_email: email, subject, status: 'error', error: msg, context });
      }
    }

    return {
      statusCode: 200, headers: corsHeaders,
      body: JSON.stringify({ success: errors.length === 0, sent, errors }),
    };
  } catch (err) {
    return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
  }
};
