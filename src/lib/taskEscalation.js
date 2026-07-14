import { supabase } from './supabase.js';
import { LOANS } from '../data/loans.js';
import { USERS } from '../data/users.js';
import { getCurrentUser } from './auth.js';

// Automatic overdue-LOA-task escalation. Any pipeline task assigned to
// an LOA that's past its due date + not completed + hasn't been
// escalated in the last 24h fires a `send-notification` call with
// event_type='task.overdue'. The team can wire this to an email rule
// in Setup so the LO gets a nudge.
//
// De-duplication uses audit_log: a task counts as "already escalated"
// if there's a task.escalated event for it within the last 24h. Cheap
// query, no dedicated notifications table.

// One escalation per task per 24h.
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

function loFullEmailFor(loName) {
  if (!loName) return null;
  const first = String(loName).split(/\s+/)[0].toLowerCase();
  const u = USERS.find((x) => (x.name || '').toLowerCase().startsWith(first));
  return u?.email || null;
}

// Query audit_log for already-fired escalations in the dedupe window.
// Returns a Set of task ids we shouldn't re-fire for.
async function loadRecentEscalations() {
  try {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    const { data, error } = await supabase
      .from('audit_log')
      .select('entity_id, created_at')
      .eq('action', 'task.escalated')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) return new Set();
    return new Set((data || []).map((r) => r.entity_id));
  } catch { return new Set(); }
}

// Fire a task.overdue notification via the existing netlify function.
// Fire-and-forget — network failures shouldn't wedge the escalation
// loop. Also writes a task.escalated audit row so we don't re-fire
// within the dedupe window.
async function escalateOne(item, loEmail) {
  const loan = LOANS.find((l) => l.id === item.loan_id) || {};
  const context = {
    task_title: item.task?.title || '(untitled task)',
    task_id: item.id,
    borrower: item.client_name || loan.borrower || '',
    loan_id: item.loan_id,
    due_date: item.due_date ? new Date(item.due_date).toLocaleDateString('en-US') : '',
    lo_email: loEmail,
    lo: loan.lo || '',
    stage: loan.status || loan.stage || '',
    workflow: item.workflow?.name || '',
  };
  const me = getCurrentUser();
  try {
    await fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(me?.email ? { 'x-kdt-user-email': me.email } : {}),
      },
      body: JSON.stringify({
        callerEmail: me?.email || '',
        event_type: 'task.overdue',
        context,
      }),
    }).catch(() => {});
  } catch { /* swallow */ }
  try {
    await supabase.rpc('audit_write', {
      p_actor_id: me?.id || '',
      p_actor_email: me?.email || '',
      p_action: 'task.escalated',
      p_entity_type: 'workflow_task',
      p_entity_id: item.id,
      p_details: {
        borrower: context.borrower,
        loan_id: item.loan_id,
        task_title: context.task_title,
        lo_email: loEmail,
      },
    });
  } catch { /* swallow */ }
}

// Walk the current task list, escalate anything that qualifies. Called
// from Tasks.jsx on mount + on a periodic timer. items = the same
// task item list Tasks.jsx already renders.
export async function escalateOverdueTasks(items) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const eligible = items.filter((it) => {
    if (!it.task || it.completed) return false;
    if ((it.task.role || '').toLowerCase() !== 'loa') return false;
    if (!it.due_date) return false;
    const due = it.due_date instanceof Date ? it.due_date : new Date(it.due_date);
    return due < today;
  });
  if (!eligible.length) return { fired: 0, skipped: 0 };

  const recent = await loadRecentEscalations();
  let fired = 0;
  let skipped = 0;
  for (const it of eligible) {
    if (recent.has(it.id)) { skipped++; continue; }
    const loan = LOANS.find((l) => l.id === it.loan_id);
    const loEmail = loFullEmailFor(loan?.lo);
    if (!loEmail) { skipped++; continue; }
    await escalateOne(it, loEmail);
    fired++;
  }
  return { fired, skipped };
}
