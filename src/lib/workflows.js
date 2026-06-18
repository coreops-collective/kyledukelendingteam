import { supabase } from './supabase.js';
import { getDate, parseLocalDate } from './clientDates.js';
import { getProfile } from './clientProfiles.js';

// In-memory state for the Client for Life rebuild.
//
// WORKFLOWS: ordered list of templates from workflow_templates.
// TASKS_BY_WORKFLOW: Map<workflow_id, [...workflow_tasks ordered by position]>.
// COMPLETIONS: Map keyed by `${task_id}||${name}||${dueDateISO}` so the
//   live task generator can skip anything already done.
const WORKFLOWS = [];
const TASKS_BY_WORKFLOW = new Map();
const COMPLETIONS = new Map();

const cKey = (taskId, name, dueDate) =>
  `${taskId}||${(name || '').trim().toLowerCase()}||${dueDate || ''}`;

export function getWorkflows() { return WORKFLOWS; }
export function getTasksFor(workflowId) { return TASKS_BY_WORKFLOW.get(workflowId) || []; }
export function isCompleted(taskId, clientName, dueDate) {
  return COMPLETIONS.has(cKey(taskId, clientName, dueDate));
}

export const TRIGGER_BUILTIN_CLOSING = 'Closing';
export const ROLES = ['lo', 'loa', 'admin', 'automated'];
export const ROLE_LABELS = { lo: 'LO', loa: 'LOA', admin: 'Admin', automated: 'Automated' };

export async function loadWorkflows() {
  try {
    const [{ data: wfs }, { data: ts }, { data: cs }] = await Promise.all([
      supabase.from('workflow_templates').select('*').order('position'),
      supabase.from('workflow_tasks').select('*').order('position'),
      supabase.from('task_completions').select('*'),
    ]);
    WORKFLOWS.splice(0, WORKFLOWS.length, ...(wfs || []));
    TASKS_BY_WORKFLOW.clear();
    (ts || []).forEach((t) => {
      if (!TASKS_BY_WORKFLOW.has(t.workflow_id)) TASKS_BY_WORKFLOW.set(t.workflow_id, []);
      TASKS_BY_WORKFLOW.get(t.workflow_id).push(t);
    });
    COMPLETIONS.clear();
    (cs || []).forEach((c) => COMPLETIONS.set(cKey(c.task_id, c.client_name, c.due_date), c));
    window.dispatchEvent(new Event('kdt-workflows-loaded'));
  } catch (e) {
    console.warn('[workflows] load:', e.message);
  }
}

export async function createWorkflow(name, description = '') {
  const { data, error } = await supabase
    .from('workflow_templates')
    .insert({ name, description, position: WORKFLOWS.length })
    .select().single();
  if (error) { console.warn('[workflows] createWorkflow:', error.message); return null; }
  WORKFLOWS.push(data);
  TASKS_BY_WORKFLOW.set(data.id, []);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
  return data;
}

export async function updateWorkflow(id, patch) {
  const { error } = await supabase.from('workflow_templates').update(patch).eq('id', id);
  if (error) { console.warn('[workflows] updateWorkflow:', error.message); return; }
  const wf = WORKFLOWS.find((w) => w.id === id);
  if (wf) Object.assign(wf, patch);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function deleteWorkflow(id) {
  const { error } = await supabase.from('workflow_templates').delete().eq('id', id);
  if (error) { console.warn('[workflows] deleteWorkflow:', error.message); return; }
  const idx = WORKFLOWS.findIndex((w) => w.id === id);
  if (idx >= 0) WORKFLOWS.splice(idx, 1);
  TASKS_BY_WORKFLOW.delete(id);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function createTask(workflowId, task) {
  const list = TASKS_BY_WORKFLOW.get(workflowId) || [];
  const row = {
    workflow_id: workflowId,
    title: task.title || 'Untitled task',
    role: task.role || 'lo',
    trigger_label: task.trigger_label || TRIGGER_BUILTIN_CLOSING,
    trigger_days: Number.isFinite(+task.trigger_days) ? +task.trigger_days : 0,
    trigger_recurring: !!task.trigger_recurring,
    condition_field: task.condition_field || null,
    condition_op: task.condition_op || null,
    notes: task.notes || null,
    position: list.length,
  };
  const { data, error } = await supabase.from('workflow_tasks').insert(row).select().single();
  if (error) { console.warn('[workflows] createTask:', error.message); return null; }
  if (!TASKS_BY_WORKFLOW.has(workflowId)) TASKS_BY_WORKFLOW.set(workflowId, []);
  TASKS_BY_WORKFLOW.get(workflowId).push(data);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
  return data;
}

export async function updateTask(id, patch) {
  const { error } = await supabase.from('workflow_tasks').update(patch).eq('id', id);
  if (error) { console.warn('[workflows] updateTask:', error.message); return; }
  for (const list of TASKS_BY_WORKFLOW.values()) {
    const t = list.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  }
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function deleteTask(id) {
  const { error } = await supabase.from('workflow_tasks').delete().eq('id', id);
  if (error) { console.warn('[workflows] deleteTask:', error.message); return; }
  for (const [wid, list] of TASKS_BY_WORKFLOW.entries()) {
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
  }
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function markTaskCompleted(taskId, clientName, dueDate, completedBy) {
  const k = cKey(taskId, clientName, dueDate);
  const dueIso = dueDate ? toIsoDate(dueDate) : null;
  const { data, error } = await supabase.from('task_completions').insert({
    task_id: taskId,
    client_name: clientName,
    due_date: dueIso,
    completed_by: completedBy || null,
  }).select().single();
  if (error) { console.warn('[workflows] markCompleted:', error.message); return; }
  COMPLETIONS.set(k, data);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function unmarkTaskCompleted(taskId, clientName, dueDate) {
  const k = cKey(taskId, clientName, dueDate);
  const completion = COMPLETIONS.get(k);
  if (!completion) return;
  const { error } = await supabase.from('task_completions').delete().eq('id', completion.id);
  if (error) console.warn('[workflows] unmark:', error.message);
  COMPLETIONS.delete(k);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

// Available client-profile fields a task can gate on. Keep this list
// in sync with the conditional UI in the task editor.
export const CONDITION_FIELDS = [
  { value: 'review_left', label: 'Review left', type: 'bool' },
];

export const CONDITION_OPS = {
  bool: [
    { value: 'is_true', label: 'is YES' },
    { value: 'is_false', label: 'is NO' },
  ],
};

// True when a task's condition (if any) matches the client's profile.
// Tasks with no condition_field always match.
function matchesCondition(task, profile) {
  const field = task.condition_field;
  const op = task.condition_op;
  if (!field || field === 'none' || !op) return true;
  const raw = profile ? profile[field] : null;
  switch (op) {
    case 'is_true': return raw === true;
    case 'is_false': return !raw;
    default: return true;
  }
}

function toIsoDate(d) {
  if (d instanceof Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return String(d);
}

// Core scheduler: given a client (name + a Map of label -> anchor Date)
// produce a list of concrete tasks (one per workflow_task that resolves
// against the available anchor dates).
//
// Output items: {
//   id: synthetic key,
//   task: workflow_task row,
//   workflow: workflow_template row,
//   client_name,
//   due_date: Date,
//   completed: boolean,
// }
export function generateTasksForClient(clientName, anchorDates) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  const profile = getProfile(clientName) || {};
  for (const wf of WORKFLOWS) {
    if (wf.active === false) continue;
    const tasks = TASKS_BY_WORKFLOW.get(wf.id) || [];
    for (const t of tasks) {
      if (!matchesCondition(t, profile)) continue;
      const anchor = anchorDates.get((t.trigger_label || '').toLowerCase());
      if (!anchor) continue;
      let due;
      if (t.trigger_recurring) {
        // Yearly anchor — find the next occurrence of (month, day)
        // relative to today, then apply the offset.
        const next = new Date(today.getFullYear(), anchor.getMonth(), anchor.getDate());
        if (next < today) next.setFullYear(today.getFullYear() + 1);
        due = new Date(next.getFullYear(), next.getMonth(), next.getDate() + (t.trigger_days || 0));
      } else {
        due = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + (t.trigger_days || 0));
      }
      const completed = isCompleted(t.id, clientName, toIsoDate(due));
      out.push({
        id: `${t.id}||${clientName}||${toIsoDate(due)}`,
        task: t,
        workflow: wf,
        client_name: clientName,
        due_date: due,
        completed,
      });
    }
  }
  return out;
}

// Build the anchor-date map for one client from the available sources:
// loan.closeDate (for "Closing"), past-client closeDate (for "Closing"
// anniversary etc), and every client_dates row matching this client.
export function buildAnchorsForClient(clientName, sources) {
  const anchors = new Map();
  const closing = sources?.closeDate ? parseLocalDate(sources.closeDate) : null;
  if (closing) anchors.set('closing', closing);
  // Pull every client_dates row that matches this client.
  const datesMap = sources?.clientDates;
  if (datesMap) {
    datesMap.forEach((row) => {
      if (!row.client_name || !row.date_label || !row.date_value) return;
      if (row.client_name.trim().toLowerCase() !== clientName.trim().toLowerCase()) return;
      const d = parseLocalDate(row.date_value);
      if (d) anchors.set(row.date_label.toLowerCase(), d);
    });
  }
  return anchors;
}
