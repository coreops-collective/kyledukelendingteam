import { USERS } from '../data/users.js';

const KEY = 'kdt_user_id';

export function getCurrentUser() {
  const id = sessionStorage.getItem(KEY);
  return id ? USERS.find(u => u.id === id) : null;
}

export function setCurrentUser(u) {
  if (u) sessionStorage.setItem(KEY, u.id);
  else sessionStorage.removeItem(KEY);
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
