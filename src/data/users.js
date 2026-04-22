// USERS — seed fallback mirrored from legacy/index.html.
// In the legacy app these are replaced by rows from Supabase on load;
// that sync is deferred in the React port.
export const USERS = [
  { id:'u1', name:'Kyle Duke',   email:'kyle@valorhl.com',   password:'kyle',   role:'branch_manager', initials:'KD', nmls:'2172565' },
  { id:'u2', name:'Missy',       email:'missy@valorhl.com',  password:'missy',  role:'loan_officer',   initials:'MS', nmls:'' },
  { id:'u3', name:'Amber Chen',  email:'amber@valorhl.com',  password:'amber',  role:'admin',          initials:'AC', nmls:'' },
  { id:'u4', name:'Marcus Reid', email:'marcus@valorhl.com', password:'marcus', role:'loan_officer',   initials:'MR', nmls:'' },
];

export const ROLE_LABELS = {
  branch_manager: 'Branch Manager',
  admin: 'Admin',
  loan_officer: 'Loan Officer',
};
