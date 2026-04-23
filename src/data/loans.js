// Full seed ported 1:1 from legacy/index.html lines 741-796.
// Source of truth will move to Supabase later; for now this drives the views.
export const LOANS = [
  // --- Kyle's Pipeline: HOT PA ---
  { id: 'P001', borrower: 'Earley, Preston', phone: '850-241-3830', email: 'prestonel@gmail.com', amount: 250000, stage: 'hotpa', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', agent: 'Montana Branca - KYLE', dateApplied: '3/3/2025', notes: 'Yes — called out', property: 'TBD' },
  { id: 'P002', borrower: 'Emmanuel, Kimberly', amount: 360000, stage: 'hotpa', type: 'FHA', purpose: 'Purchase', lo: 'Kyle', agent: 'Charlie Ann Turner', notes: '', property: 'TBD' },
  { id: 'P003', borrower: 'Engelhardt, Barbara', amount: 400000, stage: 'hotpa', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', agent: 'Allisha Eytcheson Smith', property: 'TBD' },
  { id: 'P004', borrower: 'Goodwin, Michele / Donovan', phone: '860-381-3144', amount: 650000, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', property: 'TBD' },
  { id: 'P005', borrower: 'Hernandez, Nadia', amount: 250000, stage: 'hotpa', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', agent: 'Self-Generated', property: 'TBD' },
  { id: 'P006', borrower: 'Miller, Morgan / Cody', phone: '717-696-5930', email: 'morganbmiller44@gmail.com', amount: 360000, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Candace Hollon', dateApplied: '5/14/2025', property: 'TBD' },
  { id: 'P007', borrower: 'Monterion, Edward', amount: 340000, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Ajs Small', property: 'TBD' },
  { id: 'P008', borrower: 'Sala, Justin', phone: '440-552-7567', email: '13ssjs@att.net', amount: 250000, stage: 'hotpa', type: 'FHA', purpose: 'Purchase', lo: 'Kyle', agent: 'Allisha Eytcheson Smith', notes: 'Divorcing — approved — tight DTI', property: 'TBD' },
  { id: 'P009', borrower: 'Stewart, Christianne', amount: 300000, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Allisha Eytcheson Smith', property: 'TBD' },
  { id: 'P010', borrower: 'Vallefuoco, Robert', amount: null, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', property: 'TBD' },
  { id: 'P011', borrower: 'Vallington, Alexandra', phone: '410-547-3582', email: 'brandiet013@msn.com', amount: null, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Self-Generated', property: 'TBD' },
  { id: 'P012', borrower: 'Miles, Ron / Cat', amount: 400000, stage: 'hotpa', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', notes: 'Local CT — EMS', property: 'TBD' },
  { id: 'P013', borrower: 'Coughlin, Michael', amount: 500000, stage: 'fresh', type: 'VA', purpose: 'Purchase', lo: 'Kyle', closeDate: '5/21/2026', loa: '', property: 'TBD' },
  { id: 'P014', borrower: 'Ortega, Stephanie / Jonathan', amount: 1999999, stage: 'hotpa', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', notes: 'Triplex — airbnb + house', property: '2605 Bay Blvd, Indian Rocks FL' },

  // --- New Leads ---
  { id: 'P015', borrower: 'Brandon — Will Peters GB', amount: null, stage: 'new', type: 'VA', purpose: 'Purchase', lo: 'Kyle', notes: 'Selling one home to upsize — police officer, national guard', property: 'TBD' },
  { id: 'P016', borrower: 'Meyer, Gaylyn', phone: '813-787-3831', email: 'gameyer@breakthrut...', amount: null, stage: 'new', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', notes: 'Veteran from Vegas to Tampa', property: 'TBD' },
  { id: 'P017', borrower: 'Bruner, Megan', amount: null, stage: 'new', type: 'VA', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', notes: 'Army moving to CT — looking', property: 'TBD' },
  { id: 'P018', borrower: 'Regan, Nichole', amount: null, stage: 'new', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', agent: 'Olivia Evans', notes: 'Look at listings', property: 'TBD' },
  { id: 'P019', borrower: 'Hahn, Amy', amount: null, stage: 'applied', type: 'CONV', purpose: 'Purchase', lo: 'Kyle', property: 'TBD' },

  // --- REFI Watch ---
  { id: 'R001', borrower: 'Anderson, Chelsea', phone: '623-566-8100', amount: null, stage: 'refiwatch', type: 'CONV', purpose: 'Refi', lo: 'Kyle', agent: 'Self-Generated', notes: 'Run soft pull — potential refi Nov 2024 ~6.5%' },
  { id: 'R002', borrower: 'Brown, Morgan', phone: '832-426-3880', email: 'morganbrown5@gmail.com', amount: null, stage: 'refiwatch', type: 'VA', purpose: 'Refi', lo: 'Kyle', dateApplied: '3/29/2024', notes: 'New refi file — set up #2024051291' },
  { id: 'R003', borrower: 'Swisher, Kasey', phone: '543-820-5896', email: 'kaseyswisher@gmail.com', amount: null, stage: 'refiwatch', type: 'CONV', purpose: 'Refi', lo: 'Kyle', agent: 'Self-Generated', dateApplied: '12/4/2024', notes: 'Find clarity on refi goals — rate already low' },
  { id: 'R004', borrower: 'Wissel, Chad', phone: '404-804-6470', email: 'chadwissel@gmail.com', amount: null, stage: 'refiwatch', type: 'CONV', purpose: 'Refi', lo: 'Kyle' },

  // --- Loan Management: in-process LOS files ---
  { id: 'L001', borrower: 'Boykin, Ryan', amount: 209400, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.875, lo: 'Kyle', closeDate: '5/4/2026', loa: '', notes: 'Inglet Rast Pre Close Review (3-5 business days)', property: '3680 Lawton Ave, Macon GA 31201' },
  { id: 'L002', borrower: 'Cocheloa, Courtney', amount: 190000, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.625, lo: 'Missy', closeDate: '4/1/2026', agent: 'Renee A Selvridge', property: '425 Iz Bluff Ave' },
  { id: 'L003', borrower: 'Cocheloa, Courtney', amount: 190000, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.625, lo: 'Missy', closeDate: '4/1/2026', agent: 'Renee A Selvridge', property: '419 McKinley St, Sterling CO 80751' },
  { id: 'L004', borrower: 'Cocheloa, Courtney', amount: 77000, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.875, lo: 'Missy', closeDate: '4/1/2026', agent: 'Renee A Selvridge', property: '241 California St, Sterling CO 80751' },
  { id: 'L005', borrower: 'Cocheloa, Courtney', amount: 43000, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 6.875, lo: 'Missy', closeDate: '4/1/2026', agent: 'Renee A Selvridge', property: '428 Lincoln St, Sterling CO 80751' },
  { id: 'L006', borrower: 'Ruiz, Fabian', amount: 77000, stage: 'approved', type: 'FHA', purpose: 'Refi', rate: 6.625, lo: 'Kyle', closeDate: '4/27/2026', loa: '', notes: 'Low appraisal — needs ROV or restructure' },
  { id: 'L007', borrower: 'Martin, Amber', amount: 109500, stage: 'approved', type: 'CONV', purpose: 'Refi', rate: 5.625, lo: 'Missy', closeDate: '4/3/2026', loa: '', notes: 'Stationed cobornower co confidence — flight pay' },
  { id: 'L008', borrower: 'Gish, Adrienne', amount: 79500, stage: 'approved', type: 'VA', purpose: 'Refi', rate: 5.625, lo: 'Kyle', closeDate: '4/3/2026', loa: '', property: '555 Taylor Road, Jacksonville NC 28546', notes: 'Stationed in Korea' },
  { id: 'L009', borrower: 'Wagner, Michael', amount: 217500, stage: 'ctc', type: 'CONV', purpose: 'Refi', rate: 5.999, lo: 'Missy', closeDate: '4/3/2026', loa: '', agent: 'Melody Lopez', property: '519 Hancock Read, Hope Mills NC 28348' },
  { id: 'L010', borrower: 'Millwood, Jerimiah', amount: 415000, stage: 'processing', type: 'CONV', purpose: 'Refi', rate: 6.999, lo: 'Missy', closeDate: '4/16/2026', loa: '', agent: 'Renee A Selvridge' },
  { id: 'L011', borrower: 'Loftin, William', amount: 208302, stage: 'ctcreq', type: 'FHA', purpose: 'Purchase', rate: 5.999, lo: 'Kyle', closeDate: '4/16/2026', loa: '', agent: 'Maghan Marin', property: '18 Walter Ave Sr, Medina TN 38355', notes: 'Money 5K from RBO — PTF' },
  { id: 'L012', borrower: 'Lovelace, Jonathan', amount: 413701, stage: 'ctc', type: 'CONV', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '4/24/2026', loa: '', agent: 'Bernard Limage', property: '238 Cleansirpe Drive, San Angelo TX 78404' },
  { id: 'L013', borrower: 'Atkins, William', amount: 415000, stage: 'ctcreq', type: 'FHA', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '4/30/2026', loa: '', agent: 'Treasure Davis Team', property: '205 Duke Franklin Rd, Spruce Pine NC 28777' },
  { id: 'L014', borrower: 'Samson, Nikolas', amount: 312277, stage: 'processing', type: 'CONV', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '4/28/2026', loa: '', property: '135 Winnebago Road, Carson GA 25058' },
  { id: 'L015', borrower: 'Hayden, Kegan', amount: 150000, stage: 'processing', type: 'CONV', purpose: 'Purchase', rate: 5.529, lo: 'Missy', closeDate: '4/30/2026', loa: '', agent: 'Reise Adkins', property: '4350 Heaper Rd, Wichita Falls TX 76306' },
  { id: 'L016', borrower: 'Paxton, Alan', amount: 487000, stage: 'approved', type: 'CONV', purpose: 'Purchase', rate: 5.999, lo: 'Missy', closeDate: '4/30/2026', loa: '', property: '1946 Country Bd 341, Westcliffe CO 87251' },
  { id: 'L017', borrower: 'Miller, Miles', amount: 360000, stage: 'uw', type: 'VA', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '4/30/2026', loa: '', property: '5645 Bunk House Dr, Colorado Springs CO 80918' },
  { id: 'L018', borrower: 'Ellershaw, Brittany', amount: 128000, stage: 'approved', type: 'VA', purpose: 'Purchase', rate: 5.625, lo: 'Kyle', closeDate: '5/1/2026', loa: '', agent: 'Candice Hollon', property: '1037 Matthews St, Sumter SC 29154' },
  { id: 'L019', borrower: 'Koenig, Christopher', amount: 544895, stage: 'approved', type: 'CONV', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '5/4/2026', loa: '', property: '480 Knoles, Clarksville TN 37040' },
  { id: 'L020', borrower: 'Dufault, Michael', amount: 382000, stage: 'disclosed', type: 'CONV', purpose: 'Purchase', rate: 5.629, lo: 'Missy', closeDate: '5/29/2026', loa: '', agent: 'Ryan Schwab', property: '4444 Furtibrale Rd, Selma KS 47640' },
  { id: 'L021', borrower: 'Plante, Stephen', amount: 625425, stage: 'approved', type: 'VA', purpose: 'Purchase', rate: 6.125, lo: 'Missy', closeDate: '5/5/2026', loa: '', property: '7702 Blue Vale Way, Colorado Springs CO 80920' },
  { id: 'L022', borrower: 'Smith, Aubree', amount: 164500, stage: 'approved', type: 'FHA', purpose: 'Purchase', rate: 5.999, lo: 'Missy', closeDate: '5/6/2026', loa: '', agent: 'Bree Atkin', property: '381 Chamberlain Blvd, Bayheart NC 28524' },
  { id: 'L023', borrower: 'Dvorak, Jason', amount: 194000, stage: 'approved', type: 'FHA', purpose: 'Purchase', rate: 5.625, lo: 'Missy', closeDate: '5/12/2026', loa: '', agent: 'Allisha Eytcheson Sr', property: '363 Chestnut Dr, Vass NC 28394' },
  { id: 'L024', borrower: 'Estrada, Aiden', amount: 234873, stage: 'approved', type: 'CONV', purpose: 'Purchase', rate: 5.999, lo: 'Kyle', closeDate: '5/8/2026', loa: '', agent: 'Allisha Eytcheson Sr', property: '716 Roanoke Dr, Bayheart NC 28524' },
  { id: 'L025', borrower: 'Ladd, Danielle', amount: null, stage: 'fresh', type: 'CONV', purpose: 'Purchase', lo: 'Missy', closeDate: '5/14/2026', loa: '' },
];
