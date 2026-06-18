import { supabase } from './supabase.js';

// Global catalog of key-date types the team tracks. Backed by
// key_date_types. Stays as an ordered in-memory array so the UI can
// drive both the workflow trigger dropdown and the per-client input
// list from the same source.
const TYPES = [];

export function getKeyDateTypes() { return TYPES; }
export function getKeyDateTypeLabels() { return TYPES.map((t) => t.label); }

export async function loadKeyDateTypes() {
  try {
    const { data, error } = await supabase
      .from('key_date_types').select('*').order('position');
    if (error) { console.warn('[keyDateTypes] load:', error.message); return; }
    TYPES.splice(0, TYPES.length, ...(data || []));
    window.dispatchEvent(new Event('kdt-key-date-types-loaded'));
  } catch (e) {
    console.warn('[keyDateTypes] load error:', e.message);
  }
}

export async function createKeyDateType(label, recurringDefault = true) {
  const cleanLabel = (label || '').trim();
  if (!cleanLabel) return null;
  try {
    const { data, error } = await supabase
      .from('key_date_types')
      .insert({ label: cleanLabel, recurring_default: !!recurringDefault, position: TYPES.length })
      .select().single();
    if (error) { console.warn('[keyDateTypes] create:', error.message); return null; }
    TYPES.push(data);
    window.dispatchEvent(new Event('kdt-key-date-types-changed'));
    return data;
  } catch (e) {
    console.warn('[keyDateTypes] create error:', e.message);
    return null;
  }
}

export async function updateKeyDateType(id, patch) {
  try {
    const { error } = await supabase.from('key_date_types').update(patch).eq('id', id);
    if (error) { console.warn('[keyDateTypes] update:', error.message); return; }
    const t = TYPES.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    window.dispatchEvent(new Event('kdt-key-date-types-changed'));
  } catch (e) {
    console.warn('[keyDateTypes] update error:', e.message);
  }
}

export async function deleteKeyDateType(id) {
  try {
    const { error } = await supabase.from('key_date_types').delete().eq('id', id);
    if (error) { console.warn('[keyDateTypes] delete:', error.message); return; }
    const idx = TYPES.findIndex((x) => x.id === id);
    if (idx >= 0) TYPES.splice(idx, 1);
    window.dispatchEvent(new Event('kdt-key-date-types-changed'));
  } catch (e) {
    console.warn('[keyDateTypes] delete error:', e.message);
  }
}

// Persist a position reordering for the whole list. Cheap — the
// catalog never gets very large.
export async function reorderKeyDateTypes(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => {
    const t = TYPES.find((x) => x.id === id);
    return (t && t.position !== i) ? updateKeyDateType(id, { position: i }) : null;
  }));
}
