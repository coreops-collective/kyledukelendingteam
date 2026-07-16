export const STAGES = [
  { key: 'new', label: 'New Lead' },
  { key: 'applied', label: 'Applied' },
  { key: 'hotpa', label: 'HOT PA' },
  { key: 'fresh', label: 'New Contract' },
  { key: 'disclosed', label: 'Disclosed' },
  { key: 'processing', label: 'Processing' },
  { key: 'uw', label: 'Underwriting' },
  { key: 'ctcreq', label: 'CTC Required' },
  { key: 'ctc', label: 'Clear to Close' },
  { key: 'approved', label: 'Approved' },
  { key: 'funded', label: 'Funded' },
  { key: 'cold', label: 'Archived' },
];

export const REFI_WATCH_STAGE = { key: 'refiwatch', label: 'REFI - Watch' };
// Nurture PA is the "warm but not hot" bucket between HOT PA and REFI
// Watch. Files here are pre-approved but the borrower isn't actively
// making offers — the team keeps them warm with periodic touches until
// they turn active (→ HOT PA) or funded elsewhere / dropped (→ Archived).
// Not part of the main STAGES flow so it doesn't distort the linear
// pipeline ordering; injected into columns in Pipeline.jsx.
export const NURTURE_PA_STAGE = { key: 'nurturepa', label: 'Nurture PA' };

export const STAGE_TO_STATUS = {
  new: 'New Lead', hotpa: 'HOT PA', nurturepa: 'Nurture PA', applied: 'Applied', refiwatch: 'REFI Watch', fresh: 'New Contract',
  disclosed: 'Disclosed', processing: 'Processing', uw: 'Underwriting',
  ctcreq: 'CTC Required', ctc: 'CTC', approved: 'Approved', funded: 'Funded',
  cold: 'Archived',
};

export const STATUS_TO_STAGE = {
  'New Lead': 'new', 'HOT PA': 'hotpa', 'Nurture PA': 'nurturepa', 'Applied': 'applied', 'REFI Watch': 'refiwatch', 'New Contract': 'fresh',
  'Disclosed': 'disclosed', 'Processing': 'processing', 'Underwriting': 'uw',
  'CTC Required': 'ctcreq', 'CTC': 'ctc', 'Approved': 'approved', 'Funded': 'funded',
  'Archived': 'cold',
  'BTP': 'processing',
};

export const LOS_STAGES = ['fresh', 'disclosed', 'processing', 'uw', 'ctcreq', 'ctc', 'approved'];

export const PRE_CONTRACT_STAGES = ['new', 'applied', 'hotpa', 'nurturepa', 'refiwatch'];

export function stageByKey(key) {
  return STAGES.find(s => s.key === key)
    || (key === REFI_WATCH_STAGE.key ? REFI_WATCH_STAGE : null)
    || (key === NURTURE_PA_STAGE.key ? NURTURE_PA_STAGE : null);
}
