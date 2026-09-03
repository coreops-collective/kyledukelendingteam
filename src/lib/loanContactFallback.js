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
  const byName = loan?.borrower ? (profileLookup(loan.borrower) || null) : null;
  const bySeed = (loan?.past_client_seed_name
    && loan.past_client_seed_name.toLowerCase() !== (loan.borrower || '').toLowerCase())
    ? (profileLookup(loan.past_client_seed_name) || null)
    : null;
  return {
    phone: rawPhone || byName?.corrected_phone || bySeed?.corrected_phone || '',
    email: rawEmail || byName?.corrected_email || bySeed?.corrected_email || '',
  };
}
