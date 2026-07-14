import { USERS } from '../data/users.js';
import { getCurrentUser } from './auth.js';
import { audit, ACTIONS } from './audit.js';

// Extract all @mentions from a text blob. Matches @kyle, @Missy Duke,
// @kim_c — whitespace terminates a handle. Returns unique handles
// preserving order of appearance.
export function extractMentionHandles(text) {
  if (!text || typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  const re = /@([A-Za-z][A-Za-z0-9._-]{1,40})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const h = m[1].toLowerCase();
    if (!seen.has(h)) { seen.add(h); out.push(m[1]); }
  }
  return out;
}

// Match a handle string ("kyle", "Missy Duke", "kim.c") to a users row.
// Falls back to email prefix, first-name, initials. Returns null on no
// match.
export function resolveHandle(handle) {
  if (!handle) return null;
  const h = handle.toLowerCase().replace(/[_.-]+/g, ' ').trim();
  return USERS.find((u) => {
    const name = (u.name || '').toLowerCase();
    const emailLocal = (u.email || '').split('@')[0].toLowerCase();
    const initials = (u.initials || '').toLowerCase();
    const firstName = name.split(/\s+/)[0];
    return name === h
      || firstName === h
      || emailLocal === h
      || initials === h
      || name.startsWith(h);
  }) || null;
}

// Given a previous note body and a new one, return the mention handles
// that appeared only in the new body. Used so re-saving a note doesn't
// re-notify every teammate mentioned earlier.
export function diffNewMentions(oldText, newText) {
  const oldSet = new Set(extractMentionHandles(oldText).map((h) => h.toLowerCase()));
  return extractMentionHandles(newText).filter((h) => !oldSet.has(h.toLowerCase()));
}

// Fire a mention notification for every NEW handle in a saved note.
// Fires the same send-notification pipeline used elsewhere; the team
// wires event_type='mention' to an email rule in Setup if they want
// the mention to actually deliver.
//
// context.borrower / context.loan_id / context.snippet identify the
// note where the mention lives so the email can link back.
export async function notifyMentions({ oldText, newText, context = {} }) {
  const fresh = diffNewMentions(oldText, newText);
  if (!fresh.length) return;
  const me = getCurrentUser();
  for (const handle of fresh) {
    const target = resolveHandle(handle);
    if (!target) continue;
    audit(ACTIONS.MENTION_FIRED, 'user', target.id, {
      handle,
      resolved_email: target.email,
      ...context,
    });
    try {
      await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(me?.email ? { 'x-kdt-user-email': me.email } : {}),
        },
        body: JSON.stringify({
          callerEmail: me?.email || '',
          event_type: 'mention',
          context: {
            mentioner_name: me?.name || '',
            mentioner_email: me?.email || '',
            mentioned_handle: handle,
            mentioned_name: target.name,
            mentioned_email: target.email,
            ...context,
          },
        }),
      }).catch(() => {});
    } catch { /* swallow */ }
  }
}
