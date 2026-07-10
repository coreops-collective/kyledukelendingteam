import { supabase } from './supabase.js';
import { showError } from './toaster.js';

// In-memory lead_sources store. Same pattern as jobRoles / keyDateTypes.
// Loaded once on boot; mutated by create / update / delete; dispatches
// a browser event so listeners (NewLoan dropdown, Lead Sources tab)
// refresh.

const SOURCES = [];

// Fallback so the NewLoan dropdown never renders empty pre-load. Matches
// the seed rows in migration 026 so the UX is stable even if the fetch
// fails.
const FALLBACK = [
  'Realtor Referral',
  'Past Client Referral',
  'Sphere of Influence',
  'Social Media',
  'In-Person Networking',
  'Paid Advertisement',
];

export function getLeadSources() {
  const active = SOURCES.filter((s) => s.active !== false);
  return active
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

export function getAllLeadSources() { return SOURCES.slice().sort((a, b) => (a.position || 0) - (b.position || 0)); }

// Label list for dropdowns. Falls back to hardcoded defaults if the
// store hasn't loaded yet OR the fetch failed AND the DB is empty.
export function getLeadSourceLabels() {
  const active = getLeadSources();
  if (active.length) return active.map((s) => s.label);
  return FALLBACK.slice();
}

export async function loadLeadSources() {
  try {
    const { data, error } = await supabase.from('lead_sources').select('*').order('position');
    if (error) { console.warn('[leadSources] load:', error.message); return; }
    SOURCES.splice(0, SOURCES.length, ...(data || []));
    window.dispatchEvent(new Event('kdt-lead-sources-loaded'));
  } catch (e) {
    console.warn('[leadSources] load error:', e.message);
  }
}

export async function createLeadSource(label) {
  const clean = (label || '').trim();
  if (!clean) return null;
  try {
    const row = { label: clean, position: 100 + SOURCES.length };
    const { data, error } = await supabase.from('lead_sources').insert(row).select().single();
    if (error) {
      console.warn('[leadSources] create:', error.message);
      showError(`Couldn't add lead source "${clean}": ${error.message}`, {
        retry: () => createLeadSource(label),
      });
      return null;
    }
    SOURCES.push(data);
    window.dispatchEvent(new Event('kdt-lead-sources-changed'));
    return data;
  } catch (e) {
    console.warn('[leadSources] create error:', e.message);
    showError(`Couldn't add lead source "${clean}": ${e.message}`, {
      retry: () => createLeadSource(label),
    });
    return null;
  }
}

export async function updateLeadSource(id, patch) {
  try {
    const row = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('lead_sources').update(row).eq('id', id);
    if (error) {
      console.warn('[leadSources] update:', error.message);
      showError(`Couldn't update lead source: ${error.message}`, {
        retry: () => updateLeadSource(id, patch),
      });
      return;
    }
    const s = SOURCES.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    window.dispatchEvent(new Event('kdt-lead-sources-changed'));
  } catch (e) {
    console.warn('[leadSources] update error:', e.message);
    showError(`Couldn't update lead source: ${e.message}`, {
      retry: () => updateLeadSource(id, patch),
    });
  }
}

export async function deleteLeadSource(id) {
  try {
    const { error } = await supabase.from('lead_sources').delete().eq('id', id);
    if (error) {
      console.warn('[leadSources] delete:', error.message);
      showError(`Couldn't delete lead source: ${error.message}`, {
        retry: () => deleteLeadSource(id),
      });
      return;
    }
    const idx = SOURCES.findIndex((x) => x.id === id);
    if (idx >= 0) SOURCES.splice(idx, 1);
    window.dispatchEvent(new Event('kdt-lead-sources-changed'));
  } catch (e) {
    console.warn('[leadSources] delete error:', e.message);
    showError(`Couldn't delete lead source: ${e.message}`, {
      retry: () => deleteLeadSource(id),
    });
  }
}
