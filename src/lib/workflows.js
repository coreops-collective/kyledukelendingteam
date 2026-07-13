import { supabase } from './supabase.js';
import { getDate, parseLocalDate } from './clientDates.js';
import { getProfile } from './clientProfiles.js';
import { showError } from './toaster.js';

// In-memory state for the Client for Life rebuild.
//
// WORKFLOWS: ordered list of templates from workflow_templates.
// TASKS_BY_WORKFLOW: Map<workflow_id, [...workflow_tasks ordered by position]>.
// COMPLETIONS: Map keyed by `${task_id}||${name}||${dueDateISO}` so the
//   live task generator can skip anything already done.
const WORKFLOWS = [];
const TASKS_BY_WORKFLOW = new Map();
const COMPLETIONS = new Map();

// Two key shapes so completions can be scoped either to a specific loan
// (new — added with migration 022_task_completion_loan_id) OR to a
// client name (legacy — completions written before loan_id existed).
// The dual scheme prevents the shared-name double-complete bug: two
// active loans for "Jane Smith" on the same task/due date now get
// separate keys.
const cKeyByLoan = (taskId, loanId, dueDate) =>
  `${taskId}||loan:${loanId}||${dueDate || ''}`;
const cKeyByName = (taskId, name, dueDate) =>
  `${taskId}||name:${(name || '').trim().toLowerCase()}||${dueDate || ''}`;

// Historical rows written before 022 landed had no loan_id, so they get
// indexed under the name key. New rows get indexed under BOTH keys so a
// later read that only knows the name (e.g. CFL past-client tasks with
// no live loan) can still hit them.
function indexCompletion(row) {
  const dueIso = row.due_date || '';
  COMPLETIONS.set(cKeyByName(row.task_id, row.client_name, dueIso), row);
  if (row.loan_id) COMPLETIONS.set(cKeyByLoan(row.task_id, row.loan_id, dueIso), row);
}

export function getWorkflows() { return WORKFLOWS; }
export function getTasksFor(workflowId) { return TASKS_BY_WORKFLOW.get(workflowId) || []; }
export function isCompleted(taskId, clientName, dueDate, loanId) {
  if (loanId && COMPLETIONS.has(cKeyByLoan(taskId, loanId, dueDate))) return true;
  return COMPLETIONS.has(cKeyByName(taskId, clientName, dueDate));
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
    (cs || []).forEach((c) => indexCompletion(c));
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
  if (error) {
    console.warn('[workflows] createWorkflow:', error.message);
    showError(`Couldn't create workflow "${name}": ${error.message}`, {
      retry: () => createWorkflow(name, description, category),
    });
    return null;
  }
  WORKFLOWS.push(data);
  TASKS_BY_WORKFLOW.set(data.id, []);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
  return data;
}

export async function updateWorkflow(id, patch) {
  const { error } = await supabase.from('workflow_templates').update(patch).eq('id', id);
  if (error) {
    console.warn('[workflows] updateWorkflow:', error.message);
    showError(`Couldn't update workflow: ${error.message}`, {
      retry: () => updateWorkflow(id, patch),
    });
    return;
  }
  const wf = WORKFLOWS.find((w) => w.id === id);
  if (wf) Object.assign(wf, patch);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function deleteWorkflow(id) {
  const { error } = await supabase.from('workflow_templates').delete().eq('id', id);
  if (error) {
    console.warn('[workflows] deleteWorkflow:', error.message);
    showError(`Couldn't delete workflow: ${error.message}`, {
      retry: () => deleteWorkflow(id),
    });
    return;
  }
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
    email_recipient: ['client', 'co_borrower', 'agent', 'other'].includes(task.email_recipient) ? task.email_recipient : null,
    email_other_recipient: task.email_recipient === 'other' ? (task.email_other_recipient || null) : null,
    email_subject: task.email_subject || null,
    email_body: task.email_body || null,
    depends_on_task_id: task.depends_on_task_id || null,
    depends_on_outcome: task.depends_on_outcome || null,
    decision_options: Array.isArray(task.decision_options) && task.decision_options.length > 0 ? task.decision_options : null,
    notes: task.notes || null,
    position: list.length,
  };
  let { data, error } = await supabase.from('workflow_tasks').insert(row).select().single();
  // Same graceful downgrade as updateTask — strip email_other_recipient
  // and retry on either the Postgres "column does not exist" or the
  // PostgREST "in the schema cache" wording.
  if (error && (error.message || '').includes('email_other_recipient')) {
    console.warn('[workflows] email_other_recipient column missing on insert — retrying without.');
    const { email_other_recipient: _, ...safeRow } = row;
    ({ data, error } = await supabase.from('workflow_tasks').insert(safeRow).select().single());
  }
  if (error) {
    console.warn('[workflows] createTask:', error.message);
    showError(`Couldn't add task "${row.title}": ${error.message}`, {
      retry: () => createTask(workflowId, task),
    });
    return null;
  }
  if (!TASKS_BY_WORKFLOW.has(workflowId)) TASKS_BY_WORKFLOW.set(workflowId, []);
  TASKS_BY_WORKFLOW.get(workflowId).push(data);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
  return data;
}

// Cycle guard: refuse a depends_on_task_id patch that would create a
// loop (A depends on B, B depends on A → both branches stay dormant
// forever, no user-facing symptom). Walks the chain up from the
// candidate parent until it hits the task being edited, a null, or
// a step limit.
function wouldCreateCycle(taskId, proposedParentId) {
  if (!proposedParentId || proposedParentId === taskId) return proposedParentId === taskId;
  let cursor = proposedParentId;
  for (let steps = 0; steps < 32 && cursor; steps++) {
    if (cursor === taskId) return true;
    let parent = null;
    for (const list of TASKS_BY_WORKFLOW.values()) {
      const t = list.find((x) => x.id === cursor);
      if (t) { parent = t.depends_on_task_id || null; break; }
    }
    cursor = parent;
  }
  return false;
}

// `opts.quiet` skips the per-row error toast so batch callers (e.g. the
// drag-reorder that fires N updates in parallel) can aggregate failures
// into a single toast instead of spamming N of them.
export async function updateTask(id, patch, opts = {}) {
  if ('depends_on_task_id' in patch && wouldCreateCycle(id, patch.depends_on_task_id)) {
    console.warn('[workflows] updateTask: refusing to create decision cycle');
    // Signal failure so the caller can toast, but don't touch the DB.
    return { error: 'cycle' };
  }
  let { error } = await supabase.from('workflow_tasks').update(patch).eq('id', id);
  // Graceful downgrade: migration 027_workflow_task_email_other adds an
  // email_other_recipient column. Before it runs, sending the field
  // fails with either the Postgres "column ... does not exist" or the
  // PostgREST "Could not find the 'x' column ... in the schema cache"
  // depending on which layer surfaced the error. Detect either wording
  // and retry without the field so the rest of the save lands.
  if (error && 'email_other_recipient' in patch && (error.message || '').includes('email_other_recipient')) {
    console.warn('[workflows] email_other_recipient column missing — retrying without. Run migration 027_workflow_task_email_other.');
    const { email_other_recipient: _, ...safe } = patch;
    ({ error } = await supabase.from('workflow_tasks').update(safe).eq('id', id));
  }
  if (error) {
    console.warn('[workflows] updateTask:', error.message);
    if (!opts.quiet) {
      showError(`Couldn't save task change: ${error.message}`, {
        retry: () => updateTask(id, patch),
      });
    }
    return { error: error.message || 'update failed' };
  }
  for (const list of TASKS_BY_WORKFLOW.values()) {
    const t = list.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
    // If position changed, re-sort in place so the workflow editor
    // reflects the drag-and-drop reorder without needing a page
    // reload. Without this, updating each task's position in Supabase
    // succeeds but the in-memory array stays in its original order.
    if ('position' in patch) list.sort((a, b) => (a.position || 0) - (b.position || 0));
  }
  window.dispatchEvent(new Event('kdt-workflows-changed'));
  return { ok: true };
}

export async function deleteTask(id) {
  const { error } = await supabase.from('workflow_tasks').delete().eq('id', id);
  if (error) {
    console.warn('[workflows] deleteTask:', error.message);
    showError(`Couldn't delete task: ${error.message}`, {
      retry: () => deleteTask(id),
    });
    return;
  }
  for (const [wid, list] of TASKS_BY_WORKFLOW.entries()) {
    const idx = list.findIndex((x) => x.id === id);
    if (idx >= 0) list.splice(idx, 1);
    // Mirror the DB's ON DELETE SET NULL in memory so any child
    // task that used to hang off this decision point promotes to
    // top-level and stays visible in the editor. Without this the
    // children became neither top-level nor nested and effectively
    // disappeared until page reload.
    list.forEach((t) => {
      if (t.depends_on_task_id === id) {
        t.depends_on_task_id = null;
        t.depends_on_outcome = null;
      }
    });
  }
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function markTaskCompleted(taskId, clientName, dueDate, completedBy, outcome, loanId) {
  const dueIso = dueDate ? toIsoDate(dueDate) : null;
  const baseRow = {
    task_id: taskId,
    client_name: clientName,
    due_date: dueIso,
    completed_by: completedBy || null,
    outcome: outcome || null,
  };
  // Include loan_id when the caller has one — after 022_task_completion_loan_id
  // this scopes the completion to a specific loan so two loans sharing a
  // borrower name don't double-complete.
  //
  // Graceful downgrade: if the migration hasn't run yet, Postgres rejects
  // the insert with "column loan_id does not exist". Detect that specific
  // error, log once, and retry without loan_id so the completion still
  // lands (falling back to name-scoped keying, which was the pre-022
  // behavior). Any other error propagates to the toaster.
  const withLoan = loanId ? { ...baseRow, loan_id: loanId } : baseRow;
  let { data, error } = await supabase.from('task_completions').insert(withLoan).select().single();
  if (error && loanId && /column\s+.*loan_id.*does not exist/i.test(error.message || '')) {
    console.warn('[workflows] loan_id column missing — falling back. Run migration 022_task_completion_loan_id.');
    ({ data, error } = await supabase.from('task_completions').insert(baseRow).select().single());
  }
  if (error) {
    console.warn('[workflows] markCompleted:', error.message);
    showError(`Couldn't mark task complete: ${error.message}`, {
      retry: () => markTaskCompleted(taskId, clientName, dueDate, completedBy, outcome, loanId),
    });
    return;
  }
  indexCompletion(data);
  window.dispatchEvent(new Event('kdt-workflows-changed'));
}

export async function unmarkTaskCompleted(taskId, clientName, dueDate, loanId) {
  const dueIso = dueDate ? (typeof dueDate === 'string' ? dueDate : toIsoDate(dueDate)) : '';
  // Prefer the loan-scoped completion when we have a loan_id — that's the
  // one that got clicked. Fall back to the name-scoped key so historical
  // rows (no loan_id) still delete correctly.
  const completion = (loanId && COMPLETIONS.get(cKeyByLoan(taskId, loanId, dueIso)))
    || COMPLETIONS.get(cKeyByName(taskId, clientName, dueIso));
  if (!completion) return;
  const { error } = await supabase.from('task_completions').delete().eq('id', completion.id);
  if (error) {
    console.warn('[workflows] unmark:', error.message);
    showError(`Couldn't unmark task: ${error.message}`, {
      retry: () => unmarkTaskCompleted(taskId, clientName, dueDate, loanId),
    });
  }
  // Clear BOTH key shapes so a stale entry can't linger under the other one.
  COMPLETIONS.delete(cKeyByName(taskId, clientName, dueIso));
  if (completion.loan_id) COMPLETIONS.delete(cKeyByLoan(taskId, completion.loan_id, dueIso));
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
  else if (recipient === 'other') {
    // Custom recipient — a title company, HOA, insurance broker, etc.
    // The literal email address is stored on the task itself so it
    // routes the same way every time the template fires.
    to = (task.email_other_recipient || '').trim();
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
  // Email body is now stored as HTML from the rich text editor. mailto:
  // links can only carry plain text, so strip tags and decode entities
  // before adding to the query string. The line breaks and bullet
  // characters keep the layout roughly intact so the plain-text email
  // still reads okay when the user opens it in Outlook or Mail.
  const rawBody = swap(task.email_body || '');
  const body = htmlToPlainText(rawBody);
  const qs = new URLSearchParams();
  if (subject) qs.set('subject', subject);
  if (body) qs.set('body', body);
  return `mailto:${to}?${qs.toString()}`;
}

function htmlToPlainText(html) {
  if (!html) return '';
  // If the string contains no HTML tags at all, treat it as plain text
  // so pre-RTE templates still work unchanged.
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // Convert bullet items to "• text" lines, then <br> and block ends to
  // newlines. Everything else drops to its text content.
  tmp.querySelectorAll('li').forEach((li) => {
    li.textContent = '• ' + li.textContent + '\n';
  });
  tmp.querySelectorAll('br').forEach((br) => { br.replaceWith(document.createTextNode('\n')); });
  tmp.querySelectorAll('p,div').forEach((el) => {
    el.appendChild(document.createTextNode('\n'));
  });
  return tmp.textContent.replace(/\n{3,}/g, '\n\n').trim();
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
        // Yearly recurrence — next month/day occurrence relative to
        // today. Two cases:
        //   * Calendar-date triggers (t.trigger_calendar_date set)
        //     represent a FIXED civil date like "12-25". The next
        //     occurrence is this year's Dec 25 if it hasn't passed,
        //     otherwise next year's. Skipping to next year always
        //     (as the anniversary logic below does) would miss the
        //     current Christmas by 12 months.
        //   * Client-anchored recurrences (Closing Anniversary,
        //     Birthday) skip the anchor's own year: the first
        //     "anniversary" of a fresh close is next year, not now.
        const isCalendarDate = !!t.trigger_calendar_date;
        const minYear = isCalendarDate
          ? today.getFullYear()
          : Math.max(today.getFullYear(), anchor.getFullYear() + 1);
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
        // Same decision-branch gating as date-triggered tasks: don't
        // emit a status-triggered branch task until its upstream
        // decision has been answered with the matching outcome for
        // this same client. Previously status-generated branches
        // fired unconditionally, so "Send denial email" showed up
        // for every New Lead regardless of the review decision.
        if (!satisfiesDependency(t, l.borrower)) continue;
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
        const completed = isCompleted(t.id, l.borrower, iso, l.id);
        out.push({
          id: `status||${t.id}||${l.id}||${iso}`,
          task: t,
          loan_id: l.id,
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

// Built-in trigger labels sourced directly from the loan record.
// Kimberly needs to anchor workflow tasks to things like "3 days
// after the appraisal deadline" or "1 day before ICD signed" and
// these are all fields we already have on every loan.
//
// Format: [ label shown in the picker, loan field to pull the date from ]
export const LOAN_DATE_ANCHORS = [
  ['Closing', 'closeDate'],
  ['Closing Anniversary', 'closeDate'],
  ['Loan Intake Submitted', 'dateApplied'],
  ['Appraisal Ordered', 'apprOrdered'],
  ['Appraisal Deadline', 'apprDeadline'],
  ['Appraisal Received', 'apprReceived'],
  ['Title Received', 'titleReceived'],
  ['Rate Lock Expiration', 'lockExp'],
  ['ICD Deadline', 'icdDeadline'],
  ['ICD Sent', 'icdSent'],
  ['ICD Signed', 'icdSigned'],
];

// Build the anchor-date map for one client. Sources:
//   - Every built-in loan date field (LOAN_DATE_ANCHORS) that's set
//     on the loan record.
//   - Every client_dates row matching this client (Birthday, custom
//     labels, etc.).
// Labels are lowercased before insertion so the case-insensitive
// generator lookup finds them regardless of how they're capitalized
// in the picker.
export function buildAnchorsForClient(clientName, sources) {
  const anchors = new Map();
  const loan = sources || {};
  LOAN_DATE_ANCHORS.forEach(([label, field]) => {
    const raw = loan[field];
    if (!raw) return;
    const d = parseLocalDate(raw);
    if (d) anchors.set(label.toLowerCase(), d);
  });
  // Client-managed date rows layer on top of the loan built-ins,
  // so a user-supplied Birthday overrides nothing but adds to the map.
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
