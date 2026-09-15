// Occupancy type for a loan — Kim's 2026-09-15 request, marked urgent:
// "Please add option to all loans cards and loan management page to select
//  occupancy: primary, 2nd home, or investment".
//
// Labels use her wording rather than the longer regulatory phrasing
// ("Primary Residence" / "Investment Property") so they fit a spreadsheet
// column and read the way the team talks.
//
// Stored as a plain `occupancy` key on the loan's jsonb blob, so no schema
// change and no migration. A loan with no value shows as "—" everywhere.
//
// Display and entry only — deliberately not wired into any filter bar.
export const OCCUPANCY_OPTIONS = ['Primary', 'Second Home', 'Investment'];
