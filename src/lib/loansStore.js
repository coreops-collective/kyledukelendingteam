import { supabase } from './supabase.js';
import { LOANS } from '../data/loans.js';

// Persistence layer for LOANS. Strategy:
// 1. On app load, fetch all rows from the `loans` table.
//    - If the table has rows, replace the in-memory LOANS array with them.
//    - If the table is empty, seed it from the static LOANS seed data so a
//      fresh Supabase project auto-populates.
// 2. After any mutation (UI call), views call markLoansDirty() which triggers
//    a debounced upsert of the full current LOANS array.
// 3. A beforeunload handler fires a sync flush as a last-ditch save.
//
// We store each loan as a jsonb blob keyed by id so we don't have to keep
// schema in sync with arbitrary shape drift.

let dirty = false;
let saveTimer = null;
const DEBOUNCE_MS = 1500;

export async function loadLoansFromSupabase() {
  try {
    const { data, error } = await supabase.from('loans').select('id,data');
    if (error) {
      console.warn('[loans] load failed, using static seed:', error.message);
      return { seeded: false };
    }
    if (!data || data.length === 0) {
      // Seed the table from whatever is currently in LOANS (the module seed).
      console.log('[loans] table empty — seeding from static data');
      await supabase.from('loans').upsert(
        LOANS.map((l) => ({ id: l.id, data: l })),
        { onConflict: 'id' }
      );
      return { seeded: true };
    }
    // Replace LOANS contents in-place so existing imports keep working.
    LOANS.length = 0;
    for (const row of data) {
      if (row.data) LOANS.push(row.data);
    }
    return { seeded: false };
  } catch (e) {
    console.warn('[loans] load error:', e.message);
    return { seeded: false };
  }
}

async function flushLoansToSupabase() {
  if (!dirty) return;
  dirty = false;
  try {
    const payload = LOANS.map((l) => ({ id: l.id, data: l, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from('loans').upsert(payload, { onConflict: 'id' });
    if (error) console.warn('[loans] save failed:', error.message);
  } catch (e) {
    console.warn('[loans] save error:', e.message);
    dirty = true;
  }
}

export function markLoansDirty() {
  dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushLoansToSupabase, DEBOUNCE_MS);
}

export function saveLoansNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return flushLoansToSupabase();
}

// Save on tab close / refresh as a last-ditch.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (!dirty) return;
    // Use keepalive fetch via sendBeacon — but supabase-js doesn't expose that
    // easily. Best-effort: fire-and-forget async upsert. Browser will typically
    // give us ~1s after beforeunload to complete it.
    flushLoansToSupabase();
  });
}
