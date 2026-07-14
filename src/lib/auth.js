import { USERS } from '../data/users.js';

const KEY = 'kdt_user_id';
const USER_KEY = 'kdt_user';
const LOGIN_AT_KEY = 'kdt.login_at';

// Absolute session cap. Twelve hours from login → forced logout regardless
// of activity. Closes the "logged in forever on a borrowed laptop" hole
// with zero UX friction — nobody's on the app for 12 straight hours in a
// day, and a browser tab kept open overnight quietly kicks to Login when
// the user comes back. No idle timer (deliberately — the team uses
// personal devices and a 30-min kick would just be annoying).
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

function isExpired() {
  const stamp = Number(sessionStorage.getItem(LOGIN_AT_KEY) || 0);
  if (!stamp) return false; // pre-cap sessions grandfathered — they'll get a cap on next login
  return Date.now() - stamp > SESSION_MAX_MS;
}

// We cache the full user record returned by the login RPC because the
// client doesn't have read access to the locked-down public.users table —
// looking the user up by id in the in-memory USERS array would fail.
// Falls back to USERS-by-id for sessions that pre-date this change.
// Also enforces the absolute session cap: an expired session self-clears
// and returns null on the next read.
export function getCurrentUser() {
  if (isExpired()) {
    clearSession();
    return null;
  }
  const raw = sessionStorage.getItem(USER_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch { /* fall through */ }
  }
  const id = sessionStorage.getItem(KEY);
  return id ? USERS.find(u => u.id === id) : null;
}

function clearSession() {
  sessionStorage.removeItem(KEY);
  sessionStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(LOGIN_AT_KEY);
}

export function setCurrentUser(u) {
  if (u) {
    sessionStorage.setItem(KEY, u.id);
    sessionStorage.setItem(USER_KEY, JSON.stringify(u));
    sessionStorage.setItem(LOGIN_AT_KEY, String(Date.now()));
  } else {
    clearSession();
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

// Called from App.jsx on mount + on window focus + on a periodic timer.
// If the session just expired, fires kdt-auth-changed so the router
// re-renders and returns the user to Login.
export function enforceSessionCap() {
  if (isExpired()) {
    clearSession();
    window.dispatchEvent(new Event('kdt-auth-changed'));
    return true;
  }
  return false;
}
