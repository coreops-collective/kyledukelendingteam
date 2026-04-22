// Seed loan list — subset shown; full seed lives in legacy/index.html and
// will move to Supabase as the source of truth during the porting pass.
export const LOANS = [
  { id: 'P001', borrower: 'Earley, Preston', phone: '850-241-3830', email: 'prestonel@gmail.com', amount: 250000, stage: 'hotpa', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', agent: 'Montana Branca - KYLE', notes: 'Yes — called out', property: 'TBD' },
  { id: 'P015', borrower: 'Brandon — Will Peters GB', amount: null, stage: 'new', type: 'VA', purpose: 'Purchase', lo: 'Kyle', notes: 'Selling one home to upsize — police officer, national guard', property: 'TBD' },
  { id: 'P016', borrower: 'Meyer, Gaylyn', phone: '813-787-3831', amount: null, stage: 'new', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', notes: 'Veteran from Vegas to Tampa', property: 'TBD' },
  { id: 'L001', borrower: 'Boylin, Ryan', amount: 209400, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.875, lo: 'Kyle', closeDate: '4/1/2026', notes: 'Inglet Rast Pre Close Review', property: '3680 Lawton Ave, Macon GA 31201' },
  { id: 'L008', borrower: 'Goll, Adrianne', amount: 79500, stage: 'approved', type: 'VA', purpose: 'Refi', rate: 5.625, lo: 'Kyle', closeDate: '4/3/2026', property: '555 Taylor Road, Jacksonville NC 28546', notes: 'Stationed in Korea' },
];
