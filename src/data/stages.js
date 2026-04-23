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

export const STAGE_TO_STATUS = {
  new: 'New Lead', hotpa: 'HOT PA', applied: 'Applied', refiwatch: 'REFI Watch', fresh: 'New Contract',
  disclosed: 'Disclosed', processing: 'Processing', uw: 'Underwriting',
  ctcreq: 'CTC Required', ctc: 'CTC', approved: 'Approved', funded: 'Funded',
  cold: 'Archived',
};

export const STATUS_TO_STAGE = {
  'New Lead': 'new', 'HOT PA': 'hotpa', 'Applied': 'applied', 'REFI Watch': 'refiwatch', 'New Contract': 'fresh',
  'Disclosed': 'disclosed', 'Processing': 'processing', 'Underwriting': 'uw',
  'CTC Required': 'ctcreq', 'CTC': 'ctc', 'Approved': 'approved', 'Funded': 'funded',
  'Archived': 'cold',
  'BTP': 'processing',
};

export const LOS_STAGES = ['fresh', 'disclosed', 'processing', 'uw', 'ctcreq', 'ctc', 'approved'];

export const PRE_CONTRACT_STAGES = ['new', 'applied', 'hotpa', 'refiwatch'];

export function stageByKey(key) {
  return STAGES.find(s => s.key === key) || (key === REFI_WATCH_STAGE.key ? REFI_WATCH_STAGE : null);
}
