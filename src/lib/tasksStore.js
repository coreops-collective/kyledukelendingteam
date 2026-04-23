import { supabase } from './supabase.js';

// Direct async CRUD for the `tasks` table. Tasks are only read/written by
// one view (Tasks.jsx) so a debounced store isn't necessary — each action
// (add / edit / delete) hits Supabase directly.

function rowToTask(row) {
  return {
    id: row.id,
    projectId: row.project_id || 'proj5',
    title: row.title || '',
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    assignee: row.assignee || '',
    due: row.due || '',
    notes: row.notes || '',
    createdVia: row.created_via || 'manual',
    created: row.created_at ? row.created_at.slice(0, 10) : '',
  };
}

function taskToRow(t) {
  return {
    project_id: t.projectId || null,
    title: t.title,
    status: t.status || 'todo',
    priority: t.priority || 'medium',
    assignee: t.assignee || null,
    due: t.due || null,
    notes: t.notes || '',
    created_via: t.createdVia || 'manual',
  };
}

export async function loadTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  return { data: (data || []).map(rowToTask), error: null };
}

export async function insertTask(task) {
  const { data, error } = await supabase
    .from('tasks')
    .insert(taskToRow(task))
    .select()
    .single();
  if (error) return { data: null, error };
  return { data: rowToTask(data), error: null };
}

export async function updateTask(id, patch) {
  const row = { ...taskToRow(patch), updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('tasks')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) return { data: null, error };
  return { data: rowToTask(data), error: null };
}

export async function deleteTaskById(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  return { error };
}
