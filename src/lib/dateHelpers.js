// Pure date-validation helpers shared across workflows.js /
// buildAnchorsForClient / any place that projects a user-typed date
// into a task anchor. Kept in its own module so they can be unit-
// tested without dragging in the whole clientDates + supabase surface.

// A user-managed date row (client_dates: Birthday, Wedding
// Anniversary, Kid's Birthday, Lease End, ...) should never plausibly
// land before 1900 or more than 120 years in the future. Older
// versions of the app briefly wrote empty-string / epoch-derived
// values that parse to Jan 1 1970 — those slipped past the existing
// empty-string guard because they're technically a valid Date. This
// helper rejects them so a phantom Jan 1 birthday can never anchor
// a workflow task.
//
// Loan-lifecycle anchors (LOAN_DATE_ANCHORS: closeDate, apprDeadline,
// icdSigned, etc.) are set programmatically by the app and don't
// need this filter — they get their own path.
//
// Special-cases 1970-01-01 (Unix epoch, the classic "0 timestamp got
// cast to a Date" signature) as always-invalid. A real client born
// that day can enter 1/2/1970 — one false-positive for 56 years of
// history is a fair trade for killing the phantom-birthday class of
// bug on every current and future client.
// End-of-calendar-week for a given `today`, defaulting to Saturday
// (US convention Kim's team uses). Returns midnight at the start of
// the day AFTER the week-end day so a "due <= end" check catches
// anything with a due date falling on or before that Saturday.
//
// weekEndsOn: 0=Sunday ... 6=Saturday. Change here if the team wants
// a different week end — no other file references the boundary.
export function endOfCalendarWeek(today, weekEndsOn = 6) {
  const base = today instanceof Date ? today : new Date();
  const start = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const currentDow = start.getDay(); // 0=Sun..6=Sat
  let daysToEnd = weekEndsOn - currentDow;
  if (daysToEnd < 0) daysToEnd += 7;
  // Return end-of-day for the week-end date so <= comparisons include it.
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + daysToEnd, 23, 59, 59, 999);
}

export function isPlausibleUserDate(d) {
  if (!d || !(d instanceof Date) || Number.isNaN(d.getTime())) return false;
  const y = d.getFullYear();
  if (y < 1900) return false;
  // Cap the future side at "today + 120 years" so a fat-finger like
  // 2260-04-05 (typed as 22600405) doesn't stealth in either. Not
  // strictly required for correctness — belt-and-suspenders.
  const now = new Date();
  const cap = now.getFullYear() + 120;
  if (y > cap) return false;
  // Epoch phantom: reject exactly Jan 1 1970 (both local-midnight
  // and UTC-midnight variants). Anything ELSE in 1970 is fine.
  if (y === 1970 && d.getMonth() === 0 && d.getDate() === 1) return false;
  return true;
}
