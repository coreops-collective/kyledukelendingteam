import { supabase } from './supabase.js';
import { showError } from './toaster.js';
import {
  supabaseRowToTask, taskToSupabaseRow, newTrackerTaskId,
} from '../data/tasks.js';

// Supabase-backed persistence for the /projects Kanban.
//
// Before this store: Projects.jsx used localStorage only. Kyle's
// deletes only touched his own browser — Kim's browser still showed
// the task on refresh (or on first-mount fell back to the static
// TASKS_SEED). Kim's 2026-08-24 report: "old tasks of Kyle's keep
// coming back even after checking off or deleting" — that's this bug.
//
// After this store: every mutation writes to public.tasks (RLS
// tasks_all policy from migration 023 already allows this). Realtime
// subscribe means Kyle's delete flips Kim's view within a beat. Soft
// delete via deleted_at (added by migration 050) so a checked-off
// or removed task never comes back on any client.
//
// In-memory cache: TASKS holds only NON-hidden, NON-deleted rows so
// the render loop doesn't have to filter every pass. Any consumer
// that needs the full history (audit / restore) reads via the raw
// table.

const TASKS = new Map();
const LOCAL_LISTENERS = new Set();

function notify() {
  window.dispatchEvent(new Event('kdt-projects-tasks-changed'));
  LOCAL_LISTENERS.forEach((fn) => { try { fn(); } catch { /* swallow */ } });
}

// Rows are hidden from the visible board if they were soft-deleted.
// Completed rows (status='done') stay in the store — the Projects
// view filters them at render time so the "Done" state can still be
// undone from a drawer. Delete is the terminal state.
function includeRow(row) {
  return !!row && !row.deleted_at;
}

export function getTasks() {
  return [...TASKS.values()];
}

export async function loadTasks() {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .is('deleted_at', null);
    if (error) {
      // If the column is missing (migration 050 hasn't run yet), fall
      // back to reading everything and treating the row as visible —
      // matches the pre-migration behavior so the app degrades
      // gracefully during a mid-deploy window.
      if (/column\s+.*deleted_at.*does not exist/i.test(error.message || '')
          || /schema cache/i.test(error.message || '')) {
        return loadTasksLegacyNoDeletedAt();
      }
      console.warn('[projectsStore] load:', error.message);
      return;
    }
    TASKS.clear();
    (data || []).forEach((row) => {
      TASKS.set(row.id, supabaseRowToTask(row));
    });
    window.dispatchEvent(new Event('kdt-projects-tasks-loaded'));
    notify();
  } catch (e) {
    console.warn('[projectsStore] load error:', e.message);
  }
}

async function loadTasksLegacyNoDeletedAt() {
  const { data, error } = await supabase.from('tasks').select('*');
  if (error) { console.warn('[projectsStore] load (legacy):', error.message); return; }
  TASKS.clear();
  (data || []).forEach((row) => { TASKS.set(row.id, supabaseRowToTask(row)); });
  window.dispatchEvent(new Event('kdt-projects-tasks-loaded'));
  notify();
}

// Insert-or-update semantics. Local task shape uses `id` = tk<random>
// synthesised client-side; when writing to Supabase the row's real
// UUID is either the incoming id (if it looks like a UUID) or a
// fresh uuid — the returned row is what gets cached so subsequent
// updates and deletes hit the right primary key.
function looksLikeUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function createTask(task) {
  const row = taskToSupabaseRow(task);
  const insertPayload = looksLikeUuid(task.id) ? { ...row, id: task.id } : row;
  try {
    const { data, error } = await supabase.from('tasks').insert(insertPayload).select().single();
    if (error) {
      console.warn('[projectsStore] createTask:', error.message);
      showError(`Couldn't add task "${task.title}": ${error.message}`, {
        retry: () => createTask(task),
      });
      return null;
    }
    const local = supabaseRowToTask(data);
    TASKS.set(local.id, local);
    notify();
    return local;
  } catch (e) {
    console.warn('[projectsStore] createTask error:', e.message);
    return null;
  }
}

export async function updateTask(id, patch) {
  // Optimistic: mutate the local cache immediately so the UI stays
  // snappy. Roll back on error.
  const existing = TASKS.get(id);
  if (!existing) return null;
  const before = { ...existing };
  const next = { ...existing, ...patch };
  TASKS.set(id, next);
  notify();

  // Only PATCH the columns the caller changed. Translate camelCase
  // local shape to the DB column names via taskToSupabaseRow but
  // strip anything not actually in `patch` so we don't accidentally
  // clobber a concurrent-edit column.
  const rowPatch = {};
  const full = taskToSupabaseRow({ ...existing, ...patch });
  const map = {
    projectId: 'project_id', title: 'title', status: 'status',
    priority: 'priority', assignee: 'assignee', due: 'due',
    notes: 'notes', createdVia: 'created_via',
  };
  for (const localKey of Object.keys(patch)) {
    const dbKey = map[localKey];
    if (dbKey && full[dbKey] !== undefined) rowPatch[dbKey] = full[dbKey];
  }
  // If the caller set status to 'done', stamp completed_at server-side.
  if (patch.status === 'done') rowPatch.completed_at = new Date().toISOString();
  // If the caller reopened a task (status back to anything else), clear it.
  else if (patch.status && patch.status !== 'done') rowPatch.completed_at = null;
  rowPatch.updated_at = new Date().toISOString();

  try {
    const { data, error } = await supabase.from('tasks').update(rowPatch).eq('id', id).select().single();
    if (error) {
      // Rollback on error.
      TASKS.set(id, before);
      notify();
      // completed_at is 050-added. If the column is missing pre-migration,
      // strip and retry so the rest of the patch lands.
      if (/column\s+.*completed_at.*does not exist/i.test(error.message || '')
          || /schema cache/i.test(error.message || '')) {
        delete rowPatch.completed_at;
        const retry = await supabase.from('tasks').update(rowPatch).eq('id', id).select().single();
        if (!retry.error) {
          TASKS.set(id, supabaseRowToTask(retry.data));
          notify();
          return TASKS.get(id);
        }
      }
      console.warn('[projectsStore] updateTask:', error.message);
      showError(`Couldn't save task: ${error.message}`, {
        retry: () => updateTask(id, patch),
      });
      return null;
    }
    TASKS.set(id, supabaseRowToTask(data));
    notify();
    return TASKS.get(id);
  } catch (e) {
    TASKS.set(id, before);
    notify();
    console.warn('[projectsStore] updateTask error:', e.message);
    return null;
  }
}

// Soft delete — sets deleted_at instead of removing the row. Every
// read filter in the store treats a soft-deleted row as invisible
// (loadTasks fetches WHERE deleted_at IS NULL) so it never comes back
// on any client. Reversible in one SQL statement:
//   update public.tasks set deleted_at = null where id = '<uuid>';
export async function deleteTask(id) {
  const existing = TASKS.get(id);
  if (!existing) return true;
  // Optimistic: drop from cache immediately.
  TASKS.delete(id);
  notify();
  try {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      // Rollback.
      TASKS.set(id, existing);
      notify();
      if (/column\s+.*deleted_at.*does not exist/i.test(error.message || '')
          || /schema cache/i.test(error.message || '')) {
        // Migration 050 hasn't run yet — fall back to a hard delete
        // so Kim's action still succeeds. Log a warning so ops can
        // see the migration is pending.
        console.warn('[projectsStore] deleted_at column missing — hard-deleting. Run migration 050.');
        const hard = await supabase.from('tasks').delete().eq('id', id);
        if (hard.error) {
          TASKS.set(id, existing);
          notify();
          showError(`Couldn't delete task: ${hard.error.message}`, {
            retry: () => deleteTask(id),
          });
          return false;
        }
        return true;
      }
      console.warn('[projectsStore] deleteTask:', error.message);
      showError(`Couldn't delete task: ${error.message}`, {
        retry: () => deleteTask(id),
      });
      return false;
    }
    return true;
  } catch (e) {
    TASKS.set(id, existing);
    notify();
    console.warn('[projectsStore] deleteTask error:', e.message);
    return false;
  }
}

// Realtime subscribe — Kyle's delete becomes Kim's view refresh
// within one WebSocket round-trip. Also runs the caller's onChange
// immediately for any local mutation so we don't have to wait on
// the echo. Returns an unsubscribe.
export function subscribeTasks(onChange) {
  if (onChange) LOCAL_LISTENERS.add(onChange);
  const channel = supabase
    .channel('projects-tasks-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tasks' }, ({ new: row }) => {
      if (!includeRow(row)) return;
      if (TASKS.has(row.id)) return;
      TASKS.set(row.id, supabaseRowToTask(row));
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tasks' }, ({ new: row }) => {
      if (!row) return;
      if (!includeRow(row)) {
        // Row was soft-deleted elsewhere — drop from cache.
        if (TASKS.has(row.id)) { TASKS.delete(row.id); onChange && onChange(); }
        return;
      }
      TASKS.set(row.id, supabaseRowToTask(row));
      onChange && onChange();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'tasks' }, ({ old: row }) => {
      if (!row) return;
      if (TASKS.has(row.id)) { TASKS.delete(row.id); onChange && onChange(); }
    })
    .subscribe();
  return () => {
    if (onChange) LOCAL_LISTENERS.delete(onChange);
    supabase.removeChannel(channel);
  };
}

// Convenience for the Projects view — synthesise a fresh local id
// that maps 1:1 to the eventual DB uuid. The store lets Postgres
// assign the real uuid on insert; this id is only used until the
// insert returns, then swapped out.
export function synthLocalTaskId() {
  return newTrackerTaskId();
}
