import { LOANS } from '../data/loans.js';
import { LOS_STAGES } from '../data/stages.js';

// Canonical "active in LOS" set. Filter-independent by design so both
// Loan Management's top-banner count and Snapshot's Active Files box
// resolve to the same number. Rules match what Kim spelled out:
//   * archived: NO
//   * status Adversed: NO
//   * stage in { fresh, disclosed, processing, uw, ctcreq, ctc, approved }
//     (this covers new contract → approved, plus BTP which is stored as
//     stage=processing per STATUS_TO_STAGE, so it's already in the set)
//
// Do NOT branch on the current view's Status filter here — that's what
// caused the top banner to drift from what the team actually considers
// active, and what caused Snapshot's active tile to disagree with Loan
// Management. This helper is the single source of truth from now on.
export function activeLosLoans(loans = LOANS) {
  return loans.filter(
    (l) =>
      l &&
      !l.archived &&
      (l.status || '') !== 'Adversed' &&
      LOS_STAGES.includes(l.stage)
  );
}

export function activeLosCount(loans = LOANS) {
  return activeLosLoans(loans).length;
}
