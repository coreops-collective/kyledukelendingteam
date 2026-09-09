// Pure resolver for the "past-client contact fallback" pattern —
// extracted so it can be unit-tested without pulling in the whole
// clientProfiles + supabase surface (see loanContactFallback.test.js).
//
// Kim's 2026-09-03 bug: past-client contacts Kim entered while the
// records were legacy past clients live in
// client_profiles.corrected_phone / corrected_email. Migrations
// 043/044 imported those clients into `loans` rows with blank
// phone/email; the mapper used to short-circuit contact fields to
// blank once _source flipped to 'loans' (isLive=true). This resolver
// runs regardless of source: if the loan blob has phone/email, use
// them; otherwise fall back to the profile's corrected_* values.
//
// Rename-safe: consults both the current borrower name AND the
// original past_client_seed_name stamped by migration 045, so a
// renamed imported loan still finds its profile.

export function resolveLoanContact(loan, profileLookup) {
  const rawPhone = loan?.phone || '';
  const rawEmail = loan?.email || '';
  if (rawPhone && rawEmail) {
    return { phone: rawPhone, email: rawEmail };
  }
  const { byName, bySeed } = lookupProfiles(loan, profileLookup);
  return {
    phone: rawPhone || byName?.corrected_phone || bySeed?.corrected_phone || '',
    email: rawEmail || byName?.corrected_email || bySeed?.corrected_email || '',
  };
}

// Shared identity resolution: a record's profile can be keyed to the
// current borrower name or — after a drawer rename — to the original
// PAST_CLIENTS name stamped by migration 045.
function lookupProfiles(loan, profileLookup) {
  const byName = loan?.borrower ? (profileLookup(loan.borrower) || null) : null;
  const bySeed = (loan?.past_client_seed_name
    && loan.past_client_seed_name.toLowerCase() !== (loan.borrower || '').toLowerCase())
    ? (profileLookup(loan.past_client_seed_name) || null)
    : null;
  return { byName, bySeed };
}

// Same stranded-data shape as resolveLoanContact, for co-borrowers.
// Kim entered co-borrower details on 95 clients while they were legacy
// past clients, so they live in client_profiles.co_borrower_*. The
// 043/044 import created `loans` rows with no co-borrower keys at all,
// and CoBorrowerEditor only read the profile columns when the record
// was still legacy — so those entries went invisible on ~105 cards.
//
// Reads both key families: the canonical co* names and the legacy c2*
// names NewLoan still mirrors every write to.
export function resolveCoBorrower(loan, profileLookup) {
  const raw = (canonical, legacy) => loan?.[canonical] || loan?.[legacy] || '';
  const first = raw('coFirst', 'c2first');
  const last = raw('coLast', 'c2last');
  const phone = raw('coPhone', 'c2phone');
  const email = raw('coEmail', 'c2email');
  if (first && last && phone && email) {
    return { first, last, phone, email };
  }
  const { byName, bySeed } = lookupProfiles(loan, profileLookup);
  const fill = (own, column) => own
    || byName?.[column] || bySeed?.[column] || '';
  return {
    first: fill(first, 'co_borrower_first'),
    last: fill(last, 'co_borrower_last'),
    phone: fill(phone, 'co_borrower_phone'),
    email: fill(email, 'co_borrower_email'),
  };
}
