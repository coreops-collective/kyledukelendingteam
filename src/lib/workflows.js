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

// Predefined workflow categories. Custom values added via
// addWorkflowCategory() persist to localStorage and are appended to
// this list at read time via allWorkflowCategories().
export const WORKFLOW_CATEGORIES = ['Client for Life', 'Loan', 'Lead Nurture'];

const CUSTOM_CATS_KEY = 'kdt-workflow-categories';

function loadCustomCategories() {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((c) => typeof c === 'string' && c.trim()) : [];
  } catch { return []; }
}

// Full category list = predefined + team-added custom + any category
// already in use on a workflow row (so a category typed on one
// device shows up on another once workflows sync).
export function allWorkflowCategories() {
  const seen = new Set(WORKFLOW_CATEGORIES);
  loadCustomCategories().forEach((c) => seen.add(c));
  WORKFLOWS.forEach((w) => { if (w.category) seen.add(w.category); });
  const predefined = WORKFLOW_CATEGORIES;
  const extras = [...seen].filter((c) => !predefined.includes(c)).sort((a, b) => a.localeCompare(b));
  return [...predefined, ...extras];
}

// Persist a new custom category and fire an event so any open UI
// picks it up without a reload. Safe to call with an already-known
// category — it's just a set-insert.
export function addWorkflowCategory(name) {
  const clean = (name || '').trim();
  if (!clean) return false;
  if (WORKFLOW_CATEGORIES.includes(clean)) return false;
  const current = loadCustomCategories();
  if (current.includes(clean)) return false;
  try {
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify([...current, clean]));
    window.dispatchEvent(new Event('kdt-workflow-categories-changed'));
    return true;
  } catch { return false; }
}

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

export async function createWorkflow(name, description = '', category = 'Loan') {
  const { data, error } = await supabase
    .from('workflow_templates')
    .insert({ name, description, category, position: WORKFLOWS.length })
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
    trigger_kind: task.trigger_kind === 'status' ? 'status' : 'date',
    trigger_label: task.trigger_label || TRIGGER_BUILTIN_CLOSING,
    trigger_days: Number.isFinite(+task.trigger_days) ? +task.trigger_days : 0,
    trigger_unit: TRIGGER_UNITS.includes(task.trigger_unit) ? task.trigger_unit : 'days',
    trigger_calendar_date: task.trigger_calendar_date || null,
    trigger_recurring: !!task.trigger_recurring,
    recur_every_n: Number.isFinite(+task.recur_every_n) && +task.recur_every_n > 0 ? +task.recur_every_n : null,
    recur_every_unit: TRIGGER_UNITS.includes(task.recur_every_unit) ? task.recur_every_unit : null,
    repeat_interval: ['daily', 'weekly', 'monthly'].includes(task.repeat_interval) ? task.repeat_interval : null,
    condition_field: task.condition_field || null,
    condition_op: task.condition_op || null,
    email_recipient: ['client', 'co_borrower', 'agent'].includes(task.email_recipient) ? task.email_recipient : null,
    email_subject: task.email_subject || null,
    email_body: task.email_body || null,
    depends_on_task_id: task.depends_on_task_id || null,
    depends_on_outcome: task.depends_on_outcome || null,
    decision_options: Array.isArray(task.decision_options) && task.decision_options.length > 0 ? task.decision_options : null,
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

export async function markTaskCompleted(taskId, clientName, dueDate, completedBy, outcome) {
  const k = cKey(taskId, clientName, dueDate);
  const dueIso = dueDate ? toIsoDate(dueDate) : null;
  const { data, error } = await supabase.from('task_completions').insert({
    task_id: taskId,
    client_name: clientName,
    due_date: dueIso,
    completed_by: completedBy || null,
    outcome: outcome || null,
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

// Decision-branch dependency check. A task with depends_on_task_id
// only generates once the upstream task has been completed for the
// same client. If depends_on_outcome is set too, the completion
// must have that specific outcome (e.g. "Approved" vs "Denied") for
// the branch to activate.
function satisfiesDependency(task, clientName) {
  const parentId = task.depends_on_task_id;
  if (!parentId) return true;
  const wanted = (task.depends_on_outcome || '').trim();
  const nameKey = (clientName || '').trim().toLowerCase();
  for (const [k, c] of COMPLETIONS.entries()) {
    if (!k.startsWith(`${parentId}||${nameKey}||`)) continue;
    if (!wanted) return true; // any completion of the parent unlocks
    if ((c.outcome || '').trim().toLowerCase() === wanted.toLowerCase()) return true;
  }
  return false;
}

// Resolve a workflow task's email template into a real mailto: URL for
// a given client + loan record. Substitutes {{first_name}} /
// {{last_name}} / {{property}} / {{close_date}} / {{agent_name}}
// tokens in both subject and body. Returns null if the task has no
// email template configured or the target recipient's email address
// isn't on file.
export function composeMailto(task, clientName, loan) {
  if (!task || !task.email_subject) return null;
  const recipient = task.email_recipient || 'client';
  let to = '';
  const parts = (clientName || '').split(',').map((s) => s.trim());
  const lastName = parts[0] || '';
  const firstName = parts[1] || clientName || '';
  if (recipient === 'client') to = loan?.email || '';
  else if (recipient === 'co_borrower') to = loan?.coEmail || loan?.c2email || '';
  else if (recipient === 'agent') {
    // Agents are looked up in partners.js by loan.agent; we don't
    // wire that in yet — for now fall through to blank so the user
    // fills it in themselves.
    to = '';
  }
  const substitutions = {
    '{{first_name}}': firstName,
    '{{last_name}}': lastName,
    '{{name}}': clientName || '',
    '{{property}}': loan?.property || '',
    '{{close_date}}': loan?.closeDate || '',
    '{{agent_name}}': loan?.agent || '',
  };
  const swap = (s) => Object.entries(substitutions).reduce(
    (acc, [k, v]) => acc.split(k).join(v),
    s || ''
  );
  const subject = swap(task.email_subject);
  const body = swap(task.email_body || '');
  const qs = new URLSearchParams();
  if (subject) qs.set('subject', subject);
  if (body) qs.set('body', body);
  return `mailto:${to}?${qs.toString()}`;
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

export const TRIGGER_UNITS = ['days', 'weeks', 'months', 'quarters', 'years'];

// Add N units to a Date. Returns a fresh Date. Handles month/quarter/
// year rollovers via native Date arithmetic.
function addUnits(date, n, unit) {
  const d = new Date(date);
  const amount = n || 0;
  switch (unit) {
    case 'weeks':    d.setDate(d.getDate() + amount * 7); break;
    case 'months':   d.setMonth(d.getMonth() + amount); break;
    case 'quarters': d.setMonth(d.getMonth() + amount * 3); break;
    case 'years':    d.setFullYear(d.getFullYear() + amount); break;
    case 'days':
    default:         d.setDate(d.getDate() + amount);
  }
  return d;
}

// Parse a workflow_task's calendar-day trigger. Accepts 'MM-DD' or
// 'YYYY-MM-DD'. Returns a Date for the NEXT occurrence relative to
// today. Null if malformed.
function nextCalendarOccurrence(str) {
  if (!str) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const md = String(str).trim().match(/^(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (!md) return null;
  const month = Number(md[2]) - 1;
  const day = Number(md[3]);
  const y = today.getFullYear();
  const candidate = new Date(y, month, day);
  if (candidate < today) return new Date(y + 1, month, day);
  return candidate;
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
      // Status-triggered tasks are handled by a separate generator
      // pass (generateStatusTasks). Skip here so we don't double-fire.
      if (t.trigger_kind === 'status') continue;
      // Decision-branch dependencies: skip tasks whose upstream
      // decision hasn't been made yet, or whose recorded outcome
      // doesn't match this task's branch.
      if (!satisfiesDependency(t, clientName)) continue;

      // Resolve the anchor. Calendar-day triggers take a fixed
      // month/day irrespective of the client. Otherwise pull from
      // the client's anchor map (Birthday, Closing, etc.).
      let anchor;
      if (t.trigger_calendar_date) {
        anchor = nextCalendarOccurrence(t.trigger_calendar_date);
      } else {
        anchor = anchorDates.get((t.trigger_label || '').toLowerCase());
      }
      if (!anchor) continue;

      const unit = TRIGGER_UNITS.includes(t.trigger_unit) ? t.trigger_unit : 'days';
      let due;
      let anchorOccurrence;
      if (t.trigger_recurring) {
        // Yearly recurrence — find next month/day occurrence AFTER
        // the original anchor year. Preserves "first anniversary is
        // next year, not this year" behavior.
        const minYear = Math.max(today.getFullYear(), anchor.getFullYear() + 1);
        const next = new Date(minYear, anchor.getMonth(), anchor.getDate());
        while (next < today) next.setFullYear(next.getFullYear() + 1);
        anchorOccurrence = new Date(next.getFullYear(), next.getMonth(), next.getDate());
        due = addUnits(anchorOccurrence, t.trigger_days || 0, unit);
      } else {
        anchorOccurrence = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
        due = addUnits(anchorOccurrence, t.trigger_days || 0, unit);
      }
      const completed = isCompleted(t.id, clientName, toIsoDate(due));
      out.push({
        id: `${t.id}||${clientName}||${toIsoDate(due)}`,
        task: t,
        workflow: wf,
        client_name: clientName,
        due_date: due,
        anchor_date: anchorOccurrence,
        anchor_label: t.trigger_label || TRIGGER_BUILTIN_CLOSING,
        completed,
      });
    }
  }
  return out;
}

// Generator for status-triggered workflow tasks. Called ONCE with the
// live LOANS array (not per-client) because these tasks are keyed off
// the loan's current status, not the client's dates.
//
// For each task with trigger_kind === 'status':
//   - Iterate LOANS whose current status matches the task's
//     trigger_label (e.g., "New Lead").
//   - Emit a task due today for the client on that loan.
//   - If repeat_interval is set, the task will re-emit on the next
//     interval boundary (tomorrow for daily, next Monday for weekly,
//     the 1st of next month for monthly) as long as the loan still
//     sits in that status. When the loan advances, the task stops
//     generating fresh copies.
export function generateStatusTasks(loans) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayIso = toIsoDate(today);
  const out = [];
  for (const wf of WORKFLOWS) {
    if (wf.active === false) continue;
    const tasks = TASKS_BY_WORKFLOW.get(wf.id) || [];
    for (const t of tasks) {
      if (t.trigger_kind !== 'status') continue;
      const wantedStatus = (t.trigger_label || '').trim().toLowerCase();
      if (!wantedStatus) continue;
      for (const l of loans) {
        if (!l || l.archived) continue;
        const status = (l.status || '').trim().toLowerCase();
        if (status !== wantedStatus) continue;
        if (!l.borrower) continue;
        const profile = getProfile(l.borrower) || {};
        if (!matchesCondition(t, profile)) continue;
        // Emission cadence:
        //   null / undefined → single fire due today (idempotent by day)
        //   'daily'          → one per calendar day
        //   'weekly'         → one per calendar week (Mon-Sun)
        //   'monthly'        → one per calendar month
        // Because task_completions is keyed by (task_id, client_name,
        // due_date), completing today's daily-recurring task doesn't
        // hide tomorrow's — a fresh task with tomorrow's due date
        // appears. That's the intended behavior.
        const dueDate = today;
        const iso = todayIso;
        const completed = isCompleted(t.id, l.borrower, iso);
        out.push({
          id: `status||${t.id}||${l.id}||${iso}`,
          task: t,
          workflow: wf,
          client_name: l.borrower,
          due_date: dueDate,
          anchor_date: dueDate,
          anchor_label: `Status: ${t.trigger_label}`,
          completed,
        });
      }
    }
  }
  return out;
}

// Build the anchor-date map for one client from the available sources:
// loan.closeDate (for "Closing"), past-client closeDate, and every
// client_dates row matching this client. Also auto-aliases derived
// labels: "Closing Anniversary" uses the loan's closeDate as its anchor
// since the anniversary is just the same month/day repeating each
// year — no one should have to manually re-enter it per client.
export function buildAnchorsForClient(clientName, sources) {
  const anchors = new Map();
  const closing = sources?.closeDate ? parseLocalDate(sources.closeDate) : null;
  if (closing) {
    anchors.set('closing', closing);
    anchors.set('closing anniversary', closing);
  }
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
