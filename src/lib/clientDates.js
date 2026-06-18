import { supabase } from './supabase.js';

// In-memory client_dates store. Keyed by lowercased
// "name||label" so lookups don't care about whitespace / case
// variations between LOANS, PAST_CLIENTS, and what the user typed.
const DATES = new Map();

const key = (name, label) => `${(name || '').trim().toLowerCase()}||${(label || '').trim().toLowerCase()}`;

export function getAllDates() { return DATES; }
export function getDatesFor(name) {
  const prefix = (name || '').trim().toLowerCase() + '||';
  return [...DATES.values()].filter((r) => key(r.client_name, r.date_label).startsWith(prefix));
}
export function getDate(name, label) {
  return DATES.get(key(name, label)) || null;
}

export async function loadClientDates() {
  try {
    const { data, error } = await supabase.from('client_dates').select('*');
    if (error) { console.warn('[clientDates] load:', error.message); return; }
    DATES.clear();
    (data || []).forEach((row) => DATES.set(key(row.client_name, row.date_label), row));
    window.dispatchEvent(new Event('kdt-client-dates-loaded'));
  } catch (e) {
    console.warn('[clientDates] load error:', e.message);
  }
}

export async function upsertClientDate(clientName, dateLabel, dateValue, opts = {}) {
  const name = (clientName || '').trim();
  const label = (dateLabel || '').trim();
  if (!name || !label) return null;
  const bday = (dateValue || '').trim() || null;
  const recurring = !!opts.recurring;
  const notes = (opts.notes || '').trim() || null;
  if (!bday && !notes) return deleteClientDate(name, label);
  // Look up existing row by natural key so we can do a real UPDATE
  // (upsert with non-PK natural key isn't supported by supabase-js
  // without the matching unique constraint being declared at insert).
  const existing = DATES.get(key(name, label));
  try {
    if (existing) {
      const { data, error } = await supabase
        .from('client_dates')
        .update({ date_value: bday, recurring, notes, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) { console.warn('[clientDates] update:', error.message); return null; }
      DATES.set(key(name, label), data);
      window.dispatchEvent(new Event('kdt-client-dates-changed'));
      return data;
    }
    const { data, error } = await supabase
      .from('client_dates')
      .insert({ client_name: name, date_label: label, date_value: bday, recurring, notes })
      .select()
      .single();
    if (error) { console.warn('[clientDates] insert:', error.message); return null; }
    DATES.set(key(name, label), data);
    window.dispatchEvent(new Event('kdt-client-dates-changed'));
    return data;
  } catch (e) {
    console.warn('[clientDates] upsert error:', e.message);
    return null;
  }
}

export async function deleteClientDate(clientName, dateLabel) {
  const name = (clientName || '').trim();
  const label = (dateLabel || '').trim();
  const existing = DATES.get(key(name, label));
  if (!existing) { DATES.delete(key(name, label)); return true; }
  try {
    const { error } = await supabase.from('client_dates').delete().eq('id', existing.id);
    if (error) console.warn('[clientDates] delete:', error.message);
    DATES.delete(key(name, label));
    window.dispatchEvent(new Event('kdt-client-dates-changed'));
    return true;
  } catch (e) {
    console.warn('[clientDates] delete error:', e.message);
    return false;
  }
}

// Parse a YYYY-MM-DD or M/D/YYYY string as a LOCAL date (not UTC) so
// the day doesn't shift backward in US timezones.
export function parseLocalDate(str) {
  if (!str) return null;
  const s = String(str).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]));
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Build a deduped, sorted list of every label the team has used so far,
// plus the predefined defaults. Drives the autocomplete on the
// "Add a date" form and the trigger-label dropdown on workflow tasks.
const DEFAULT_LABELS = ['Birthday', 'Wedding Anniversary', 'Closing Anniversary', 'Lease End'];
export function allKnownDateLabels() {
  const seen = new Set(DEFAULT_LABELS);
  DATES.forEach((row) => { if (row.date_label) seen.add(row.date_label); });
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Used by views to build the "all clients" picker.
export function collectClientNames(loans, pastClients) {
  const names = new Set();
  (loans || []).forEach((l) => { if (l.borrower) names.add(l.borrower.trim()); });
  (pastClients || []).forEach((c) => { if (c.name) names.add(c.name.trim()); });
  return [...names].sort((a, b) => a.localeCompare(b));
}
