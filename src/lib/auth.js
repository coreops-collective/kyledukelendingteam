import { USERS } from '../data/users.js';

const KEY = 'kdt_user_id';
const USER_KEY = 'kdt_user';

// We cache the full user record returned by the login RPC because the
// client doesn't have read access to the locked-down public.users table —
// looking the user up by id in the in-memory USERS array would fail.
// Falls back to USERS-by-id for sessions that pre-date this change.
export function getCurrentUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  const id = sessionStorage.getItem(KEY);
  return id ? USERS.find(u => u.id === id) : null;
}

export function setCurrentUser(u) {
  if (u) {
    sessionStorage.setItem(KEY, u.id);
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
  } else {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(USER_KEY);
  }
  window.dispatchEvent(new Event('kdt-auth-changed'));
}

export function isBranchManager() {
  const u = getCurrentUser();
  return !!(u && u.role === 'branch_manager');
}

export function isAdmin() {
  const u = getCurrentUser();
  return !!(u && (u.role === 'branch_manager' || u.role === 'admin'));
}
