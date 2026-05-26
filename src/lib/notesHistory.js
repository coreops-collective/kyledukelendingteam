import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

// Snapshot the PREVIOUS notes value before an edit overwrites it, so the
// team can recover from accidental clears / overwrites. Skipped if there
// was nothing to back up (no prior notes). Best-effort: failures are
// logged but don't block the underlying loan save.
export async function appendNotesHistory(loanId, previousNotes) {
  if (!loanId || !previousNotes) return;
  const user = getCurrentUser();
  try {
    const { error } = await supabase.from('notes_history').insert({
      loan_id: loanId,
      notes: previousNotes,
      edited_by: user ? (user.name || user.email || '') : '',
    });
    if (error) console.warn('[notes_history] insert failed:', error.message);
  } catch (e) {
    console.warn('[notes_history] insert error:', e.message);
  }
}

export async function loadNotesHistory(loanId) {
  if (!loanId) return [];
  try {
    const { data, error } = await supabase
      .from('notes_history')
      .select('*')
      .eq('loan_id', loanId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) {
      console.warn('[notes_history] load failed:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[notes_history] load error:', e.message);
    return [];
  }
}
