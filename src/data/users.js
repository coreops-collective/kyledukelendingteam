import { supabase } from '../lib/supabase.js';

// USERS — mutable module-level array. Seeded with a fallback that matches
// the legacy seed, then replaced on app mount by the real Supabase `users`
// rows (same pattern the legacy app uses via loadUsersFromSupabase).
export const USERS = [
  { id: 'u1', name: 'Kyle Duke',   email: 'kyle@valorhl.com',   password: 'kyle',   role: 'branch_manager', initials: 'KD', nmls: '2172565' },
  { id: 'u2', name: 'Missy',       email: 'missy@valorhl.com',  password: 'missy',  role: 'loan_officer',   initials: 'MS', nmls: '' },
  { id: 'u3', name: 'Amber Chen',  email: 'amber@valorhl.com',  password: 'amber',  role: 'admin',          initials: 'AC', nmls: '' },
  { id: 'u4', name: 'Marcus Reid', email: 'marcus@valorhl.com', password: 'marcus', role: 'loan_officer',   initials: 'MR', nmls: '' },
];

export const ROLE_LABELS = {
  branch_manager: 'Branch Manager',
  admin: 'Admin',
  loan_officer: 'Loan Officer',
};

export async function loadUsersFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) { console.warn('loadUsersFromSupabase:', error.message); return false; }
    if (!data || !data.length) return false;
    USERS.splice(0, USERS.length, ...data.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
      initials: u.initials || '??',
      nmls: u.nmls || '',
      phone: u.phone || '',
    })));
    window.dispatchEvent(new Event('kdt-users-loaded'));
    return true;
  } catch (e) {
    console.warn('loadUsersFromSupabase error:', e.message);
    return false;
  }
}
