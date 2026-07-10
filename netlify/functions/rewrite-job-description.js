/**
 * POST { role_label, section, responsibilities, existing_content }
 * → { text }
 *
 * Calls the Claude API to draft or rewrite one of four sections on a
 * Job Role page:
 *   'job_description' — professional prose JD from raw task list
 *   'training_30' | 'training_60' | 'training_90' — training-plan sections
 *   'accountability' — key metrics / accountabilities
 *
 * ANTHROPIC_API_KEY must be set in the Netlify env. The key never
 * touches the browser.
 */

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 1024;
const API_URL = 'https://api.anthropic.com/v1/messages';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function promptFor(section, roleLabel, responsibilities, existing) {
  const respBlock = (responsibilities || []).length
    ? responsibilities.map((r) => `- ${r}`).join('\n')
    : '(none yet)';
  const existingBlock = existing
    ? `\n\nExisting draft (revise/replace as you see fit):\n${existing}`
    : '';

  switch (section) {
    case 'job_description':
      return `Write a professional, natural-sounding job description for the "${roleLabel}" role at a mortgage lending team. Base it on these day-to-day responsibilities:\n\n${respBlock}\n\nMake it read like a real JD — a short summary paragraph, then a "What you'll own" section, then a "What good looks like" section. Warm but professional. No corporate cliches. No emojis. Plain markdown only. Under 350 words.${existingBlock}`;

    case 'training_30':
      return `Draft a 30-day onboarding plan for the "${roleLabel}" role at a mortgage lending team. The role is responsible for:\n\n${respBlock}\n\nThe plan should cover: shadowing, tool access, first tasks they own end-to-end, and one measurable outcome by day 30. Format as a short intro paragraph followed by a bulleted list of week-by-week activities. Plain markdown, no emojis, under 250 words.${existingBlock}`;

    case 'training_60':
      return `Draft a 60-day ramp plan for the "${roleLabel}" role at a mortgage lending team. Assume the 30-day plan is complete. Responsibilities:\n\n${respBlock}\n\nCover: more autonomy, first client-facing (or teammate-facing) ownership, first check-in with manager, and one measurable outcome by day 60. Format as a short intro then a bulleted week-by-week list. Plain markdown, no emojis, under 250 words.${existingBlock}`;

    case 'training_90':
      return `Draft a 90-day ramp plan for the "${roleLabel}" role at a mortgage lending team. Assume 30 and 60 day plans are complete. Responsibilities:\n\n${respBlock}\n\nCover: full ownership, one improvement they've contributed back to the team, and the measurable outcome by day 90 that means they're "off ramp." Format as a short intro then a bulleted week-by-week list. Plain markdown, no emojis, under 250 words.${existingBlock}`;

    case 'accountability':
      return `Write an Accountability section for the "${roleLabel}" role at a mortgage lending team. Base it on these responsibilities:\n\n${respBlock}\n\nList 4-7 measurable outcomes this role is accountable for — things a manager would review in a quarterly check-in. Each item is a bullet with (a) the outcome and (b) how it's measured. Plain markdown, no emojis, under 200 words.${existingBlock}`;

    default:
      return `Rewrite the following content for the "${roleLabel}" role at a mortgage lending team. Keep it warm, natural, and under 300 words. Plain markdown:\n\n${existing || respBlock}`;
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'POST only' }) };
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

  const { role_label, section, responsibilities = [], existing_content = '' } = body;
  if (!role_label || !section) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'role_label and section are required.' }),
    };
  }

  const prompt = promptFor(section, role_label, responsibilities, existing_content);

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
