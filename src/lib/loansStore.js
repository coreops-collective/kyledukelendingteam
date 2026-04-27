import { supabase } from './supabase.js';
import { LOANS } from '../data/loans.js';

// Persistence layer for LOANS. Strategy:
// 1. On app load, fetch all rows from the `loans` table.
//    - If the table has rows, replace the in-memory LOANS array with them.
//    - If the table is empty, seed it from the static LOANS seed data so a
//      fresh Supabase project auto-populates.
// 2. After any mutation, views call markLoansDirty(loan) with the specific
//    loan that was changed. Only those rows get upserted (per-row), which
//    means two people editing different loans at the same time can't
//    overwrite each other via a stale full-array snapshot.
// 3. beforeunload flush as a last-ditch save.

const DEBOUNCE_MS = 1500;
const dirtyIds = new Set();
let allDirty = false; // fallback when caller doesn't pass a specific loan
let saveTimer = null;

export async function loadLoansFromSupabase() {
  try {
    const { data, error } = await supabase.from('loans').select('id,data');
    if (error) {
      console.warn('[loans] load failed, using static seed:', error.message);
      return { seeded: false };
    }
    if (!data || data.length === 0) {
      console.log('[loans] table empty — seeding from static data');
      await supabase.from('loans').upsert(
        LOANS.map((l) => ({ id: l.id, data: l })),
        { onConflict: 'id' }
      );
      return { seeded: true };
    }
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
  // Snapshot and clear so edits during the await queue for the next flush.
  const ids = Array.from(dirtyIds);
  const wasAllDirty = allDirty;
  dirtyIds.clear();
  allDirty = false;

  if (!ids.length && !wasAllDirty) return;

  try {
    const loansToSave = wasAllDirty
      ? LOANS
      : ids.map((id) => LOANS.find((l) => l.id === id)).filter(Boolean);

    if (!loansToSave.length) return;

    const payload = loansToSave.map((l) => ({
      id: l.id,
      data: l,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('loans').upsert(payload, { onConflict: 'id' });
    if (error) {
      console.warn('[loans] save failed:', error.message);
      // Restore so we retry on next flush.
      ids.forEach((id) => dirtyIds.add(id));
      if (wasAllDirty) allDirty = true;
    }
  } catch (e) {
    console.warn('[loans] save error:', e.message);
  }
}

export function markLoansDirty(loan) {
  if (loan && loan.id) {
    dirtyIds.add(loan.id);
  } else {
    // No specific loan given — safest fallback is to flag everything dirty.
    // Callers should prefer passing the loan so only that row is written.
    allDirty = true;
  }
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushLoansToSupabase, DEBOUNCE_MS);
}

export function saveLoansNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  return flushLoansToSupabase();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (dirtyIds.size === 0 && !allDirty) return;
    flushLoansToSupabase();
  });
}

// Subscribe to live changes on the `loans` table. Each row stores the loan
// as a jsonb blob in `data`, so applying an event is just "drop in the new
// data". Calls onChange() after every applied event. Returns unsubscribe fn.
//
// Echo: a write from this client also fires an UPDATE event. Replacing the
// in-memory loan with the same data is a no-op, so we don't bother
// suppressing echoes.
export function subscribeLoans(onChange) {
  const channel = supabase
    .channel('loans-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'loans' }, ({ new: row }) => {
      if (!row || !row.data) return;
      if (LOANS.some((l) => l.id === row.id)) return;
      LOANS.push(row.data);
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'loans' }, ({ new: row }) => {
      if (!row || !row.data) return;
      const idx = LOANS.findIndex((l) => l.id === row.id);
      if (idx >= 0) {
        LOANS[idx] = row.data;
      } else {
        LOANS.push(row.data);
      }
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'loans' }, ({ old: row }) => {
      if (!row) return;
      const idx = LOANS.findIndex((l) => l.id === row.id);
      if (idx >= 0) {
        LOANS.splice(idx, 1);
        onChange && onChange();
      }
    })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
