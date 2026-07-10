import { supabase } from './supabase.js';
import { showError } from './toaster.js';

// In-memory job_roles store. Same pattern as key_date_types /
// webhooks / clientProfiles — load once on boot, mutate in place on
// change events, dispatch a browser event for consumers.
//
// The role KEY is what workflow_tasks.role stores (matches historical
// 'lo' / 'loa' / 'admin' / 'automated'). Custom roles get a slug key
// derived from the label at insert time.
const ROLES = [];

export function getJobRoles() { return ROLES.slice().sort((a, b) => (a.position || 0) - (b.position || 0)); }
export function getJobRole(key) { return ROLES.find((r) => r.key === key) || null; }

// Display label for a role key. Prefers the persisted label; falls back
// to the built-in map so a workflow task assigned to 'lo' still shows
// "LO" before the store loads. Anything unknown returns the raw key.
const BUILT_IN_LABELS = { lo: 'LO', loa: 'LOA', admin: 'Admin', automated: 'Automated' };
export function getRoleLabel(key) {
  const row = ROLES.find((r) => r.key === key);
  if (row) return row.label;
  return BUILT_IN_LABELS[key] || key || '';
}

// Everywhere the workflow task editor renders a role dropdown, it should
// pull from HERE not from a hardcoded const. Fallback to the built-in
// four when the store hasn't loaded yet so the UI never renders empty.
const BUILT_IN_FALLBACK = [
  { key: 'lo', label: 'LO' },
  { key: 'loa', label: 'LOA' },
  { key: 'admin', label: 'Admin' },
  { key: 'automated', label: 'Automated' },
];
export function getRoleKeysForWorkflowDropdown() {
  const list = ROLES.length ? ROLES : BUILT_IN_FALLBACK;
  return list.slice().sort((a, b) => (a.position || 0) - (b.position || 0));
}

function slugKey(label) {
  return String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || `role_${Date.now().toString(36)}`;
}

export async function loadJobRoles() {
  try {
    const { data, error } = await supabase.from('job_roles').select('*').order('position');
    if (error) { console.warn('[jobRoles] load:', error.message); return; }
    ROLES.splice(0, ROLES.length, ...(data || []));
    window.dispatchEvent(new Event('kdt-job-roles-loaded'));
  } catch (e) {
    console.warn('[jobRoles] load error:', e.message);
  }
}

export async function createJobRole(label, summary = '') {
  const cleanLabel = (label || '').trim();
  if (!cleanLabel) return null;
  // Ensure the derived key is unique — append a numeric suffix if a
  // custom role happens to slug to the same value as an existing one.
  let base = slugKey(cleanLabel);
  let key = base;
  let n = 2;
  while (ROLES.some((r) => r.key === key)) { key = `${base}_${n++}`; }
  try {
    const row = { key, label: cleanLabel, summary: summary || null, position: 100 + ROLES.length };
    const { data, error } = await supabase.from('job_roles').insert(row).select().single();
    if (error) {
      console.warn('[jobRoles] create:', error.message);
      showError(`Couldn't add role "${cleanLabel}": ${error.message}`, {
        retry: () => createJobRole(label, summary),
      });
      return null;
    }
    ROLES.push(data);
    window.dispatchEvent(new Event('kdt-job-roles-changed'));
    return data;
  } catch (e) {
    console.warn('[jobRoles] create error:', e.message);
    showError(`Couldn't add role "${cleanLabel}": ${e.message}`, {
      retry: () => createJobRole(label, summary),
    });
    return null;
  }
}

export async function updateJobRole(id, patch) {
  try {
    const clean = { ...patch, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('job_roles').update(clean).eq('id', id);
    if (error) {
      console.warn('[jobRoles] update:', error.message);
      showError(`Couldn't save role: ${error.message}`, {
        retry: () => updateJobRole(id, patch),
      });
      return;
    }
    const r = ROLES.find((x) => x.id === id);
    if (r) Object.assign(r, patch);
    window.dispatchEvent(new Event('kdt-job-roles-changed'));
  } catch (e) {
    console.warn('[jobRoles] update error:', e.message);
    showError(`Couldn't save role: ${e.message}`, {
      retry: () => updateJobRole(id, patch),
    });
  }
}

export async function deleteJobRole(id) {
  const role = ROLES.find((r) => r.id === id);
  if (!role) return;
  // Built-in roles must NOT be deletable — workflow tasks reference their
  // keys (`lo` / `loa` / `admin` / `automated`), and cascading a delete
  // would orphan every one of those tasks. The UI already hides the
  // Delete button; this is a defense-in-depth guard.
  if (role.built_in) {
    showError(`"${role.label}" is a built-in role and can't be deleted.`);
    return;
  }
  try {
    const { error } = await supabase.from('job_roles').delete().eq('id', id);
    if (error) {
      console.warn('[jobRoles] delete:', error.message);
      showError(`Couldn't delete role: ${error.message}`, {
        retry: () => deleteJobRole(id),
      });
      return;
    }
    const idx = ROLES.findIndex((r) => r.id === id);
    if (idx >= 0) ROLES.splice(idx, 1);
    window.dispatchEvent(new Event('kdt-job-roles-changed'));
  } catch (e) {
    console.warn('[jobRoles] delete error:', e.message);
    showError(`Couldn't delete role: ${e.message}`, {
      retry: () => deleteJobRole(id),
    });
  }
}
