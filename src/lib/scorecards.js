import { LOANS } from '../data/loans.js';
import { parseLocalDate } from './clientDates.js';

// A loan counts as "funded" when either the stage or the status has
// been set to the funded value. Both are kept in sync by the app but
// historical rows sometimes have only one, so match on either.
export function isFundedLoan(l) {
  return (l.stage === 'funded') || ((l.status || '') === 'Funded');
}

// Time-window helpers. Match `closeDate` (funding date) for funded
// loans; used to slice production into "last 30 days", "YTD", etc.
export const WINDOWS = [
  { key: 't30d', label: 'Last 30 days',  days: 30 },
  { key: 't90d', label: 'Last 90 days',  days: 90 },
  { key: 'ytd',  label: 'Year to date',  ytd: true },
  { key: 't12m', label: 'Last 12 months', days: 365 },
  { key: 'all',  label: 'All time' },
];

export function inWindow(dateString, windowKey) {
  if (windowKey === 'all') return true;
  const d = parseLocalDate(dateString);
  if (!d) return false;
  const now = new Date();
  const w = WINDOWS.find((x) => x.key === windowKey);
  if (!w) return true;
  if (w.ytd) return d.getFullYear() === now.getFullYear();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - w.days);
  return d >= cutoff;
}

function sum(arr) {
  return arr.reduce((a, n) => a + (Number(n) || 0), 0);
}
function countBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const k = keyFn(item) || '—';
    out.set(k, (out.get(k) || 0) + 1);
  }
  return Array.from(out.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}
function volumeBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const k = keyFn(item) || '—';
    const v = Number(item.amount) || 0;
    out.set(k, (out.get(k) || 0) + v);
  }
  return Array.from(out.entries()).map(([label, volume]) => ({ label, volume })).sort((a, b) => b.volume - a.volume);
}

// Compute a full LO scorecard for one loan officer over a time window.
// Returns funded counts + volume + pipeline snapshot + type/source
// breakdowns. Never throws — a missing LO returns an empty scorecard.
export function computeScorecard(loName, windowKey = 't12m') {
  const all = LOANS.filter((l) => l.lo === loName && !l.archived);
  const funded = all.filter(isFundedLoan);
  const pipeline = all.filter((l) => !isFundedLoan(l));
  const fundedInWindow = funded.filter((l) => inWindow(l.closeDate, windowKey));

  const fundedCount = fundedInWindow.length;
  const fundedVolume = sum(fundedInWindow.map((l) => l.amount));
  const avgLoanSize = fundedCount ? fundedVolume / fundedCount : 0;

  const pipelineCount = pipeline.length;
  const pipelineValue = sum(pipeline.map((l) => l.amount));

  // Pull-through is funded / total-that-has-been-active-in-window. For
  // a rough version, count everything with a closeDate or dateApplied
  // in the window and see how many funded. Not perfect but useful.
  const activityInWindow = all.filter((l) =>
    inWindow(l.closeDate, windowKey) || inWindow(l.dateApplied, windowKey)
  );
  const pullThroughPct = activityInWindow.length
    ? Math.round((fundedInWindow.length / activityInWindow.length) * 100)
    : 0;

  return {
    fundedCount,
    fundedVolume,
    avgLoanSize,
    pipelineCount,
    pipelineValue,
    pullThroughPct,
    byType:       countBy(fundedInWindow, (l) => l.type),
    byPurpose:    countBy(fundedInWindow, (l) => l.purpose),
    volumeByType: volumeBy(fundedInWindow, (l) => l.type),
    recentFunded: fundedInWindow
      .slice()
      .sort((a, b) => (parseLocalDate(b.closeDate) || 0) - (parseLocalDate(a.closeDate) || 0))
      .slice(0, 10),
  };
}

// Cross-LO comparison. Returns a scorecard per LO name for one window.
export function computeTeamScorecards(loNames, windowKey = 't12m') {
  return loNames.map((name) => ({ name, ...computeScorecard(name, windowKey) }));
}
