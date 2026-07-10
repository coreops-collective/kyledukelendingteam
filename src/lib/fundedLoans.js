import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import { getProfile } from './clientProfiles.js';
import { parseLocalDate } from './clientDates.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Project a LOANS row into the PAST_CLIENTS shape so callers can treat
// the merged list uniformly. Pulls month / year off closeDate so the
// existing INCOME / All Loans filters keep working.
function loanToFundedRecord(l) {
  const d = l.closeDate ? parseLocalDate(l.closeDate) : null;
  const valid = !!d;
  return {
    id: l.id,
    name: l.borrower || '',
    closeDate: l.closeDate || '',
    saleType: l.saleType || '',
    property: l.property || '',
    price: l.price || 0,
    amount: l.amount || 0,
    type: l.type || '',
    rate: l.rate || null,
    agent: l.agent || '',
    phone: l.phone || '',
    email: l.email || '',
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

  const seen = new Set(fromLoans.map((r) => `${(r.name || '').toLowerCase()}|${r.closeDate}`));
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
