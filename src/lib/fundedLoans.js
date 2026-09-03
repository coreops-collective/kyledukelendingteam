import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import { getProfile } from './clientProfiles.js';
import { parseLocalDate } from './clientDates.js';
import { resolveLoanContact } from './loanContactFallback.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Project a LOANS row into the PAST_CLIENTS shape so callers can treat
// the merged list uniformly. Pulls month / year off closeDate so the
// existing INCOME / All Loans filters keep working.
//
// Phone / email pass through resolveLoanContact so a live/imported
// record whose blob is blank still surfaces the number Kim saved to
// client_profiles.corrected_* before the 043/044 import flipped the
// record to _source='loans'. See src/lib/loanContactFallback.js.
function loanToFundedRecord(l) {
  const d = l.closeDate ? parseLocalDate(l.closeDate) : null;
  const valid = !!d;
  const { phone, email } = resolveLoanContact(l, getProfile);
  return {
    id: l.id,
    name: l.borrower || '',
    // past_client_seed_name is stamped on loans imported from the
    // PAST_CLIENTS seed (migration 045). Keeping it on the mapped
    // record lets the dedupe pair the LOANS row back to its original
    // PAST_CLIENTS entry even after the borrower name gets edited.
    past_client_seed_name: l.past_client_seed_name || '',
    closeDate: l.closeDate || '',
    saleType: l.saleType || '',
    property: l.property || '',
    price: l.price || 0,
    amount: l.amount || 0,
    type: l.type || '',
    rate: l.rate || null,
    agent: l.agent || '',
    phone,
    email,
    lo: l.lo || 'Kyle',
    month: valid ? MONTH_NAMES[d.getMonth()] : '',
    year: valid ? d.getFullYear() : null,
    _source: 'loans',
  };
}

// Canonical funded-loan ledger: PAST_CLIENTS (historical seed) plus any
// LOANS that have been marked Funded since. Dedupes by lower-cased name +
// closeDate so a record present in both sources only appears once. The
// LOANS version wins on conflicts because it's the live, mutable record.
//
// Adversed and archived loans are excluded.
export function getAllFunded() {
  const fromLoans = LOANS
    .filter((l) => !l.archived && l.status !== 'Adversed' && (l.stage === 'funded' || l.status === 'Funded'))
    .map(loanToFundedRecord);

  // Dedupe key set includes BOTH the current borrower name and the
  // original PAST_CLIENTS seed name (stamped on imported rows by 045)
  // so a rename via the drawer doesn't unhinge the pairing and leave
  // two cards showing for the same closing — one with the new name from
  // LOANS, one with the old name from PAST_CLIENTS. Both spellings map
  // to the same close date, so PAST_CLIENTS gets deduped either way.
  const seen = new Set();
  for (const r of fromLoans) {
    const cd = r.closeDate;
    if (r.name) seen.add(`${r.name.toLowerCase()}|${cd}`);
    if (r.past_client_seed_name) seen.add(`${r.past_client_seed_name.toLowerCase()}|${cd}`);
  }
  const fromPast = PAST_CLIENTS
    .filter((pc) => !seen.has(`${(pc.name || '').toLowerCase()}|${pc.closeDate}`))
    .map((pc) => {
      // Legacy PAST_CLIENTS records can't be edited directly. If the
      // team has applied name/phone/email corrections via
      // IdentityEditor they live in client_profiles — surface them
      // here so the drawer + list show the corrected values without
      // the seed file ever changing.
      const profile = getProfile(pc.name);
      const overrides = profile ? {
        name: profile.corrected_name || pc.name,
        phone: profile.corrected_phone || pc.phone || '',
        email: profile.corrected_email || pc.email || '',
      } : {};
      return { ...pc, ...overrides, _source: 'past' };
    });

  return [...fromLoans, ...fromPast];
}
