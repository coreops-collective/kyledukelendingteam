import { supabase } from '../lib/supabase.js';
import { showError } from '../lib/toaster.js';

// USERS — mutable module-level array. Populated on app mount from the
// Supabase users table via loadUsersFromSupabase(). Previously carried a
// hardcoded seed with plaintext passwords in the JS bundle (removed
// when migration 028 hashed everything server-side — those seed rows
// were also the "backdoor" from the security audit). Starts empty now
// so nothing sensitive ships in the browser bundle.
export const USERS = [];

export const ROLE_LABELS = {
  branch_manager: 'Branch Manager',
  admin: 'Admin',
  loan_officer: 'Loan Officer',
};

export async function sbInsertUser(user) {
  // New users route through the create_user RPC introduced in migration
  // 028 so the password is bcrypt-hashed server-side. The client never
  // gets the hash back and never touches password_hash directly.
  try {
    const { data, error } = await supabase.rpc('create_user', {
      p_name: user.name,
      p_email: user.email,
      p_password: user.password,
      p_role: user.role,
      p_initials: user.initials || '',
      p_nmls: user.nmls || '',
      p_phone: user.phone || '',
    });
    if (error) {
      console.warn('sbInsertUser:', error.message);
      showError(`Couldn't add ${user.name}: ${error.message}`, {
        retry: () => sbInsertUser(user),
      });
      return null;
    }
    return Array.isArray(data) && data.length ? data[0] : null;
  } catch (e) {
    console.warn('sbInsertUser error:', e.message);
    showError(`Couldn't add ${user.name}: ${e.message}`, {
      retry: () => sbInsertUser(user),
    });
    return null;
  }
}

// Admin-initiated password reset. Called from Setup UI (Branch Manager
// only). Routes through the set_user_password RPC so the new password
// is bcrypt-hashed server-side. Returns true on success.
export async function sbSetUserPassword(userId, newPassword) {
  try {
    const { data, error } = await supabase.rpc('set_user_password', {
      p_target_id: userId,
      p_new_password: newPassword,
    });
    if (error) {
      console.warn('sbSetUserPassword:', error.message);
      showError(`Couldn't reset password: ${error.message}`);
      return false;
    }
    return !!data;
  } catch (e) {
    console.warn('sbSetUserPassword error:', e.message);
    showError(`Couldn't reset password: ${e.message}`);
    return false;
  }
}

// User-initiated password change (requires current password so a
// hijacked session can't rotate someone else's credentials).
export async function sbChangeMyPassword(email, currentPassword, newPassword) {
  try {
    const { data, error } = await supabase.rpc('change_password', {
      p_email: email,
      p_current_password: currentPassword,
      p_new_password: newPassword,
    });
    if (error) {
      console.warn('sbChangeMyPassword:', error.message);
      showError(`Couldn't change password: ${error.message}`);
      return false;
    }
    return !!data;
  } catch (e) {
    console.warn('sbChangeMyPassword error:', e.message);
    showError(`Couldn't change password: ${e.message}`);
    return false;
  }
}

export async function sbUpdateUser(id, patch) {
  // Routes through the update_user_profile RPC (RLS blocks direct writes
  // after migration 006). Role changes go through set_user_role. Password
  // changes go through sbSetUserPassword (admin) or sbChangeMyPassword.
  try {
    // Split off role — that goes through its own RPC so role changes are
    // isolatable in a future audit log.
    const wantsRole = patch.role !== undefined && patch.role !== null;
    const profileArgs = {
      p_target_id: id,
      p_name: patch.name ?? null,
      p_email: patch.email ?? null,
      p_initials: patch.initials ?? null,
      p_nmls: patch.nmls ?? null,
      p_phone: patch.phone ?? null,
      p_birthday: patch.birthday ?? null,
      p_spouse_name: patch.spouse_name ?? null,
      p_spouse_birthday: patch.spouse_birthday ?? null,
      p_marriage_anniversary: patch.marriage_anniversary ?? null,
      p_work_anniversary: patch.work_anniversary ?? null,
    };
    const hasProfile = Object.entries(profileArgs).some(([k, v]) => k !== 'p_target_id' && v !== null);
    if (hasProfile) {
      const { error } = await supabase.rpc('update_user_profile', profileArgs);
      if (error) {
        console.warn('sbUpdateUser (profile):', error.message);
        showError(`Couldn't save team member changes: ${error.message}`, {
          retry: () => sbUpdateUser(id, patch),
        });
        return;
      }
    }
    if (wantsRole) {
      const { error } = await supabase.rpc('set_user_role', {
        p_target_id: id,
        p_new_role: patch.role,
      });
      if (error) {
        console.warn('sbUpdateUser (role):', error.message);
        showError(`Couldn't update role: ${error.message}`);
      }
    }
  } catch (e) {
    console.warn('sbUpdateUser error:', e.message);
    showError(`Couldn't save team member changes: ${e.message}`, {
      retry: () => sbUpdateUser(id, patch),
    });
  }
}

export async function sbDeleteUser(id) {
  try {
    const { error } = await supabase.rpc('delete_user', { p_target_id: id });
    if (error) {
      console.warn('sbDeleteUser:', error.message);
      showError(`Couldn't remove team member: ${error.message}`, {
        retry: () => sbDeleteUser(id),
      });
    }
  } catch (e) {
    console.warn('sbDeleteUser error:', e.message);
    showError(`Couldn't remove team member: ${e.message}`, {
      retry: () => sbDeleteUser(id),
    });
  }
}

export async function loadUsersFromSupabase() {
  // Routes through the list_users RPC. Direct `select * from users` was
  // blocked by RLS anyway (migration 006 locked the table). The RPC
  // returns every profile field but never password or password_hash,
  // so nothing sensitive touches the browser.
  try {
    const { data, error } = await supabase.rpc('list_users');
    if (error) { console.warn('loadUsersFromSupabase:', error.message); return false; }
    if (!data || !data.length) return false;
    USERS.splice(0, USERS.length, ...data.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      initials: u.initials || '??',
      nmls: u.nmls || '',
      phone: u.phone || '',
      birthday: u.birthday || '',
      spouse_name: u.spouse_name || '',
      spouse_birthday: u.spouse_birthday || '',
      marriage_anniversary: u.marriage_anniversary || '',
      work_anniversary: u.work_anniversary || '',
    })));
    window.dispatchEvent(new Event('kdt-users-loaded'));
    return true;
  } catch (e) {
    console.warn('loadUsersFromSupabase error:', e.message);
    return false;
  }
}
