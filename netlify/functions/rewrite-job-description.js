/**
 * POST { role_label, section, responsibilities, existing_content, reports_to }
 * → { text }
 *
 * Section is one of:
 *   'job_description' — long-form JD from raw task list
 *   'training_30' | 'training_60' | 'training_90' — training-plan sections
 *   'accountability' — key metrics
 *
 * ANTHROPIC_API_KEY must be set in the Netlify env. The key never
 * touches the browser.
 */

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1400;
const API_URL = 'https://api.anthropic.com/v1/messages';

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
  if (!SUPABASE_URL || !SUPABASE_KEY) return true;
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

async function requireKnownCaller(callerEmail) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return true; // dev
  if (!callerEmail) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/users?select=id&email=eq.${encodeURIComponent(callerEmail)}&limit=1`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return false;
    const rows = await res.json();
    return !!rows?.[0]?.id;
  } catch { return false; }
}

// ── Team context ──────────────────────────────────────────────────────
// The system prompt every section shares. Establishes who this JD is
// FOR so the output reads like a real Kyle Duke Home Loan Team JD and
// not a generic mortgage-lender template. Update here if the team
// identity or focus changes.
const TEAM_CONTEXT = `You are drafting content for The Kyle Duke Home Loan Team, powered by Valor Home Loans.

About the team:
- Led by Kyle Duke, Branch Manager and Veteran Mortgage Advisor™ (NMLS #2172565)
- Purchase-focused mortgage lending team specializing in VA, FHA, and Conventional financing, with growing Jumbo and Non-QM work
- Two loan officers (Kyle and Missy), supported by loan officer assistants, admin, and automated workflows
- Client-for-Life philosophy: every closing is the start of a long-term relationship, not the end of a transaction
- Realtor partner network: agents refer because they trust the team's communication and speed to close
- Culture: warm, professional, direct. Everyone thinks like an owner. Proactive communication. Real accountability for outcomes.

Writing style rules for everything you produce:
- Warm but professional. No corporate jargon. No emojis.
- Never use "synergy", "leverage", "wear many hats", "team player", "rockstar", "ninja", or similar cliches.
- Plain markdown only (paragraphs, **bold** for section headers, - for bullets when a list is actually appropriate)
- The reader is a real person considering this role or already in it — write to them, not about them
- Be specific to a mortgage lending desk. Reference the actual workflow (loan intake, disclosure, CTC, funding) when relevant.`;

// ── Section-specific prompts ─────────────────────────────────────────
function promptFor(section, roleLabel, responsibilities, existing, reportsTo) {
  const respBlock = (responsibilities || []).length
    ? responsibilities.map((r) => `  - ${r}`).join('\n')
    : '  (no tasks assigned yet — draft based on the role title only)';
  const reportsLine = reportsTo
    ? `This role reports to: ${reportsTo}.`
    : `This role reports to: (not specified).`;
  const existingBlock = existing
    ? `\n\nHere is the current draft (revise / replace as you see fit — do NOT just extend it):\n---\n${existing}\n---`
    : '';

  switch (section) {
    case 'job_description':
      return `${TEAM_CONTEXT}

Write the Job Description for the "${roleLabel}" role.

${reportsLine}

Day-to-day tasks assigned to this role in our workflow system:
${respBlock}

Structure the JD in EXACTLY this order, using markdown headers:

**About the Role**
Two to four sentences explaining why this role exists on the team and how it fits into the client-for-life pipeline. Anchor it to Kyle Duke Home Loan Team's actual focus (VA/FHA/Conventional purchase-heavy). Do NOT restate the task list.

**Reports To**
A single line with the reporting relationship.

**What You'll Own**
Group the day-to-day tasks into 3-5 RESPONSIBILITY THEMES. Each theme is a bolded label followed by 2-3 sentences of prose describing what owning that theme actually looks like. NEVER copy task titles verbatim into this section. Never turn the task list into a bulleted dump. Examples of theme labels: "Client Communication", "Pipeline Movement", "Documentation & Compliance", "Realtor Partner Support", "Follow-Through After Close". Pick 3-5 themes that best match the task list.

**What Success Looks Like**
A short bulleted list of 3-5 measurable outcomes a manager would review at 90 days. Format each bullet as (outcome) — (how it's measured).

**About the Team**
Two to three sentences on team culture, drawn from the team context above — client-for-life mindset, proactive communication, ownership. This section stays roughly the same across roles.

Total length: 350-500 words. Plain markdown, no HTML.${existingBlock}`;

    case 'training_30':
      return `${TEAM_CONTEXT}

Draft the 30-Day Plan for the "${roleLabel}" role. ${reportsLine}

Day-to-day responsibilities this role will grow into:
${respBlock}

Structure (plain markdown, under 300 words):

**Weeks 1-2: Ramp**
Short paragraph on shadowing, tool access, first exposure to real client work. Mention the specific tools the team uses (Loan Pipeline board, Loan Management, Client for Life, workflow tasks).

**Weeks 3-4: First ownership**
Bulleted list of the first tasks they own end-to-end, chosen from the responsibilities above. 3-5 bullets max.

**Day 30 Success Marker**
One sentence with a specific, measurable outcome they should hit by day 30.${existingBlock}`;

    case 'training_60':
      return `${TEAM_CONTEXT}

Draft the 60-Day Plan for the "${roleLabel}" role. ${reportsLine} Assume the 30-day plan is complete.

Responsibilities:
${respBlock}

Structure (plain markdown, under 300 words):

**Weeks 5-6: Broader ownership**
Short paragraph on picking up more autonomy. Reference the actual pipeline / workflow surfaces.

**Weeks 7-8: Client-facing (or realtor-facing) work**
Bulleted list of the responsibilities they own without supervision, drawn from the task list. 3-5 bullets.

**Day 60 Success Marker**
One sentence with a specific measurable outcome.${existingBlock}`;

    case 'training_90':
      return `${TEAM_CONTEXT}

Draft the 90-Day Plan for the "${roleLabel}" role. ${reportsLine} Assume 30 + 60 day plans are complete.

Responsibilities:
${respBlock}

Structure (plain markdown, under 300 words):

**Weeks 9-10: Full ownership**
Short paragraph on running their book of work without checklist assistance.

**Weeks 11-12: Contribution back**
Bulleted list including one improvement they've contributed to the team's process or one workflow they've improved.

**Day 90 Success Marker: "Off Ramp"**
One sentence describing what "off ramp" looks like for this role at Kyle Duke Home Loan Team.${existingBlock}`;

    case 'accountability':
      return `${TEAM_CONTEXT}

Write the Accountability section for the "${roleLabel}" role. ${reportsLine}

Responsibilities:
${respBlock}

List 4-7 measurable outcomes this role is accountable for — the specific numbers a manager reviews in a quarterly check-in. Each item is a bullet with (a) the outcome and (b) how it's measured. Be specific to mortgage lending — pull-through rate, days from application to CTC, client review count, realtor NPS, etc. — not generic KPIs.

Plain markdown, under 250 words.${existingBlock}`;

    default:
      return `${TEAM_CONTEXT}\n\nRewrite the following for the "${roleLabel}" role. Keep the Kyle Duke Home Loan Team voice. Plain markdown, under 300 words.\n\n${existing || respBlock}`;
  }
}

exports.handler = async (event) => {
  const corsHeaders = corsHeadersFor(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'POST only' }) };
  }

  const origin = event.headers.origin || event.headers.Origin || '';
  if (!isOriginAllowed(origin)) {
    return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ error: 'Origin not allowed' }) };
  }
  if (!(await checkRateLimit(event, 'rewrite-job-description', 20))) {
    return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: 'Rate limit exceeded' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in Netlify env.' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: 'Malformed JSON body.' }) }; }

  const { role_label, section, responsibilities = [], existing_content = '', reports_to = '', callerEmail } = body;
  const headerCaller = (event.headers['x-kdt-user-email'] || event.headers['X-KDT-User-Email'] || '').toString().trim().toLowerCase();
  const caller = headerCaller || String(callerEmail || '').trim().toLowerCase();
  if (!(await requireKnownCaller(caller))) {
    return { statusCode: 401, headers: corsHeaders, body: JSON.stringify({ error: 'Sign in first' }) };
  }
  if (!role_label || !section) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'role_label and section are required.' }),
    };
  }

  const prompt = promptFor(section, role_label, responsibilities, existing_content, reports_to);

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return {
        statusCode: res.status,
        headers: corsHeaders,
        body: JSON.stringify({ error: `Claude API ${res.status}: ${errText.slice(0, 500)}` }),
      };
    }
    const data = await res.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ text }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: `Claude API request failed: ${e.message}` }),
    };
  }
};
