import { supabase } from './supabase.js';
import { showError } from './toaster.js';

// In-memory client_profiles store. Keyed by lowercased client_name so
// lookups don't care about whitespace/case differences across LOANS,
// PAST_CLIENTS, and what the team types.
const PROFILES = new Map();

const key = (name) => (name || '').trim().toLowerCase();

export function getProfile(name) { return PROFILES.get(key(name)) || null; }
export function getAllProfiles() { return PROFILES; }

export async function loadClientProfiles() {
  try {
    const { data, error } = await supabase.from('client_profiles').select('*');
    if (error) { console.warn('[clientProfiles] load:', error.message); return; }
    PROFILES.clear();
    (data || []).forEach((row) => PROFILES.set(key(row.client_name), row));
    window.dispatchEvent(new Event('kdt-client-profiles-loaded'));
  } catch (e) {
    console.warn('[clientProfiles] load error:', e.message);
  }
}

// Upsert by client_name. Uses the unique constraint to avoid needing
// to look up the existing id first.
// Columns the app may include in a patch that older schemas don't have
// yet. If PostgREST reports the column missing (either directly or via
// the schema cache), we strip the field and retry so the rest of the
// patch still lands — same graceful-downgrade pattern as workflows.js.
const OPTIONAL_COLUMNS = ['review_sources'];

function isMissingColumnError(msg, column) {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return (
    m.includes(`column "${column}"`) ||
    m.includes(`'${column}' column`) ||
    (m.includes(column) && m.includes('schema cache')) ||
    (m.includes(column) && m.includes('does not exist'))
  );
}

function stripOptionalFromPatch(patch, errMsg) {
  const next = { ...patch };
  let dropped = false;
  for (const col of OPTIONAL_COLUMNS) {
    if (col in next && isMissingColumnError(errMsg, col)) {
      delete next[col];
      dropped = true;
    }
  }
  return dropped ? next : null;
}

export async function upsertClientProfile(name, patch) {
  const cleanName = (name || '').trim();
  if (!cleanName) return null;
  const existing = PROFILES.get(key(cleanName));
  try {
    if (existing) {
      const { data, error } = await supabase
        .from('client_profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select().single();
      if (error) {
        const downgraded = stripOptionalFromPatch(patch, error.message);
        if (downgraded) return upsertClientProfile(name, downgraded);
        console.warn('[clientProfiles] update:', error.message);
        showError(`Couldn't update profile for ${cleanName}: ${error.message}`, {
          retry: () => upsertClientProfile(name, patch),
        });
        return null;
      }
      PROFILES.set(key(cleanName), data);
      window.dispatchEvent(new Event('kdt-client-profiles-changed'));
      return data;
    }
    const { data, error } = await supabase
      .from('client_profiles')
      .insert({ client_name: cleanName, ...patch })
      .select().single();
    if (error) {
      const downgraded = stripOptionalFromPatch(patch, error.message);
      if (downgraded) return upsertClientProfile(name, downgraded);
      console.warn('[clientProfiles] insert:', error.message);
      showError(`Couldn't create profile for ${cleanName}: ${error.message}`, {
        retry: () => upsertClientProfile(name, patch),
      });
      return null;
    }
    PROFILES.set(key(cleanName), data);
    window.dispatchEvent(new Event('kdt-client-profiles-changed'));
    return data;
  } catch (e) {
    console.warn('[clientProfiles] upsert error:', e.message);
    showError(`Couldn't save profile for ${cleanName}: ${e.message}`, {
      retry: () => upsertClientProfile(name, patch),
    });
    return null;
  }
}

export const REVIEW_SOURCES = ['Google', 'Zillow', 'Facebook', 'Yelp', 'Other'];

// Kim's request: some clients leave reviews on multiple platforms.
// getReviewSources reads the new array column (review_sources) if
// populated, otherwise falls back to wrapping the legacy single-string
// column (review_source) in a one-item array. buildReviewSourcesPatch
// takes the current selection and returns a patch that writes BOTH
// columns so legacy readers keep working until every consumer is
// updated. Empty selection clears both.
export function getReviewSources(profile) {
  if (!profile) return [];
  if (Array.isArray(profile.review_sources) && profile.review_sources.length) {
    return profile.review_sources.filter((s) => typeof s === 'string' && s);
  }
  if (profile.review_source) return [profile.review_source];
  return [];
}

export function buildReviewSourcesPatch(selection) {
  const arr = Array.isArray(selection) ? selection.filter(Boolean) : [];
  return {
    review_sources: arr.length ? arr : null,
    review_source: arr[0] || null,
  };
}

// CFL status per client. Determines whether the client appears on the
// Client for Life follow-up board or is quietly kept off it while
// still counting in stats / All Loans.
//   'active'         — visible on CFL (default)
//   'do_not_contact' — hidden. Never reach out again unless they do.
//   'archived'       — hidden. Paused for a benign reason (moved, sold, etc.)
export const CFL_STATUSES = ['active', 'do_not_contact', 'archived'];
export const CFL_STATUS_LABELS = {
  active: 'Active',
  do_not_contact: 'Do Not Contact',
  archived: 'Archived',
};

export async function setClientCflStatus(name, status, reason = '') {
  if (!CFL_STATUSES.includes(status)) return null;
  return upsertClientProfile(name, {
    cfl_status: status,
    cfl_status_reason: reason || null,
    cfl_status_changed_at: new Date().toISOString(),
  });
}
