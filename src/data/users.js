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

export async function sbInsertUser(user) {
  try {
    const row = {
      name: user.name, email: user.email, password: user.password,
      role: user.role, initials: user.initials, nmls: user.nmls || '', phone: user.phone || '',
    };
    const { data, error } = await supabase.from('users').insert(row).select().single();
    if (error) { console.warn('sbInsertUser:', error.message); return null; }
    return data;
  } catch (e) { console.warn('sbInsertUser error:', e.message); return null; }
}

export async function sbUpdateUser(id, patch) {
  const allowed = ['name', 'email', 'password', 'role', 'initials', 'nmls', 'phone'];
  const row = {};
  allowed.forEach(k => { if (patch[k] !== undefined) row[k] = patch[k]; });
  if (!Object.keys(row).length) return;
  try {
    const { error } = await supabase.from('users').update(row).eq('id', id);
    if (error) console.warn('sbUpdateUser:', error.message);
  } catch (e) { console.warn('sbUpdateUser error:', e.message); }
}

export async function sbDeleteUser(id) {
  try {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) console.warn('sbDeleteUser:', error.message);
  } catch (e) { console.warn('sbDeleteUser error:', e.message); }
}

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
