import { supabase } from './supabase.js';
import { LOANS } from '../data/loans.js';

// Load loan.status_changed events from audit_log and compute average
// time-in-stage per (LO, stage). Uses the audit trail that Sprint 1
// started recording, so results only cover activity from that point on
// — no retroactive history. That's fine for a moving average.
//
// Each pair of consecutive events for the same loan is one "stage
// segment": the OLD status was held for (next_event_time -
// this_event_time). Aggregate those segments across all loans.
export async function computeCycleTimes(loName) {
  const events = await fetchStatusEvents();
  const loanIdsForLo = new Set(
    LOANS.filter((l) => !loName || l.lo === loName).map((l) => l.id)
  );

  // Group events by loan_id, ordered oldest first.
  const byLoan = new Map();
  for (const ev of events) {
    if (!loanIdsForLo.has(ev.loan_id)) continue;
    if (!byLoan.has(ev.loan_id)) byLoan.set(ev.loan_id, []);
    byLoan.get(ev.loan_id).push(ev);
  }
  for (const [, list] of byLoan) {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // Sum up time-in-stage segments per old_status.
  const totals = new Map(); // status → { days, count }
  for (const [, list] of byLoan) {
    for (let i = 0; i < list.length - 1; i++) {
      const cur = list[i];
      const next = list[i + 1];
      const from = cur.new_status; // stage entered at this event
      const days = (new Date(next.created_at) - new Date(cur.created_at)) / 86400000;
      if (!from || !isFinite(days) || days < 0) continue;
      const bucket = totals.get(from) || { days: 0, count: 0 };
      bucket.days += days;
      bucket.count += 1;
      totals.set(from, bucket);
    }
  }

  const rows = Array.from(totals.entries()).map(([stage, b]) => ({
    stage,
    avgDays: b.count ? b.days / b.count : 0,
    sampleCount: b.count,
  }));
  // Sort by avg descending — biggest bottleneck at the top.
  rows.sort((a, b) => b.avgDays - a.avgDays);

  return {
    rows,
    totalLoansCovered: byLoan.size,
    // Earliest event we've seen — a "since X" caption for the user.
    startedRecordingAt: events.length ? events[events.length - 1].created_at : null,
  };
}

async function fetchStatusEvents() {
  try {
    const { data, error } = await supabase
      .from('audit_log')
      // Pull the newest 5000 status change events — enough for a 4-LO
      // team's history, cheap even at high volume. Client-side we still
      // sort per-loan so the exact order doesn't matter.
      .select('entity_id, details, created_at')
      .eq('action', 'loan.status_changed')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (error) {
      console.warn('[cycleTime] load audit_log:', error.message);
      return [];
    }
    return (data || []).map((row) => ({
      loan_id: row.entity_id,
      new_status: row.details?.new_status || '',
      old_status: row.details?.old_status || '',
      created_at: row.created_at,
    }));
  } catch (e) {
    console.warn('[cycleTime] load error:', e.message);
    return [];
  }
}
