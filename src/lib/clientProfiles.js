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
