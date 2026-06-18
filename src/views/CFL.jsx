import { useEffect, useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import {
  loadClientDates, getAllDates, upsertClientDate, deleteClientDate,
  parseLocalDate, allKnownDateLabels, collectClientNames,
} from '../lib/clientDates.js';
import {
  loadWorkflows, getWorkflows, getTasksFor,
  createWorkflow, updateWorkflow, deleteWorkflow,
  createTask, updateTask, deleteTask,
  markTaskCompleted, unmarkTaskCompleted,
  generateTasksForClient, buildAnchorsForClient,
  ROLES, ROLE_LABELS, TRIGGER_BUILTIN_CLOSING,
} from '../lib/workflows.js';

const DAY = 86400000;
const fmtDate = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtMonthDay = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function CFL() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [filterRole, setFilterRole] = useState('All');
  const [filterStatus, setFilterStatus] = useState('Open');
  const [datesOpen, setDatesOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  useEffect(() => {
    loadClientDates().then(bump);
    loadWorkflows().then(bump);
    const onChange = () => bump();
    ['kdt-client-dates-changed', 'kdt-client-dates-loaded',
     'kdt-workflows-changed', 'kdt-workflows-loaded'].forEach((evt) =>
      window.addEventListener(evt, onChange)
    );
    return () => {
      ['kdt-client-dates-changed', 'kdt-client-dates-loaded',
       'kdt-workflows-changed', 'kdt-workflows-loaded'].forEach((evt) =>
        window.removeEventListener(evt, onChange)
      );
    };
  }, []);

  // Build the live task list. For every active loan and every past
  // client we generate every workflow_task that resolves against the
  // anchor dates we have on file for them. Sorted by due date.
  const generated = useMemo(() => {
    const clientDates = getAllDates();
    const seen = new Map();
    const collect = (name, closeDate) => {
      if (!name) return;
      const k = name.trim().toLowerCase();
      const prev = seen.get(k);
      // Prefer the more recent closeDate when a client appears in both
      // LOANS and PAST_CLIENTS (rare but possible).
      if (prev && prev.closeDate && (!closeDate || closeDate < prev.closeDate)) return;
      seen.set(k, { name: name.trim(), closeDate });
    };
    LOANS.forEach((l) => collect(l.borrower, l.closeDate));
    PAST_CLIENTS.forEach((c) => collect(c.name, c.closeDate));
    const items = [];
    seen.forEach(({ name, closeDate }) => {
      const anchors = buildAnchorsForClient(name, { closeDate, clientDates });
      if (anchors.size === 0) return;
      items.push(...generateTasksForClient(name, anchors));
    });
    items.sort((a, b) => a.due_date - b.due_date);
    return items;
  }, [filterRole, filterStatus]); // re-run when filters change too, to read fresh COMPLETIONS

  const filtered = generated.filter((it) => {
    if (filterRole !== 'All' && (it.task.role || 'lo') !== filterRole.toLowerCase()) return false;
    if (filterStatus === 'Open' && it.completed) return false;
    if (filterStatus === 'Done' && !it.completed) return false;
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = [
    { label: 'Overdue', items: [] },
    { label: 'Today', items: [] },
    { label: 'This Week', items: [] },
    { label: 'This Month', items: [] },
    { label: 'Later', items: [] },
  ];
  filtered.forEach((it) => {
    const days = Math.round((it.due_date - today) / DAY);
    if (days < 0) buckets[0].items.push(it);
    else if (days === 0) buckets[1].items.push(it);
    else if (days <= 7) buckets[2].items.push(it);
    else if (days <= 31) buckets[3].items.push(it);
    else buckets[4].items.push(it);
  });

  // Birthdays this month — separate from the task list since the user
  // specifically asked for an at-a-glance panel.
  const birthdaysThisMonth = useMemo(() => {
    const month = today.getMonth();
    const out = [];
    getAllDates().forEach((row) => {
      if (!row.date_value) return;
      if (!/birthday/i.test(row.date_label)) return;
      const d = parseLocalDate(row.date_value);
      if (!d) return;
      if (d.getMonth() !== month) return;
      const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      const daysAway = Math.round((next - today) / DAY);
      out.push({ name: row.client_name, label: row.date_label, raw: row.date_value, monthDay: fmtMonthDay(d), daysAway });
    });
    return out.sort((a, b) => a.daysAway - b.daysAway);
  }, [generated]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            Client for Life · Task List
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Auto-generated from your workflows + each client's key dates · {filtered.length} of {generated.length} tasks
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="form-btn" type="button" onClick={() => setDatesOpen(true)}>Manage Key Dates</button>
          <button className="form-btn primary" type="button" onClick={() => setEditorOpen(true)}>Edit Workflows</button>
        </div>
      </div>

      <BirthdaysPanel rows={birthdaysThisMonth} onOpenDates={() => setDatesOpen(true)} />

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <FilterChip label="Role" value={filterRole} options={['All', 'LO', 'LOA', 'Admin', 'Automated']} onChange={setFilterRole} />
        <FilterChip label="Status" value={filterStatus} options={['Open', 'Done', 'All']} onChange={setFilterStatus} />
      </div>

      {generated.length === 0 ? (
        <EmptyState onDates={() => setDatesOpen(true)} onWorkflows={() => setEditorOpen(true)} />
      ) : (
        buckets.map((b) => b.items.length > 0 && (
          <Section key={b.label} label={b.label} items={b.items} today={today} />
        ))
      )}

      {datesOpen && <ManageDatesDrawer onClose={() => setDatesOpen(false)} />}
      {editorOpen && <WorkflowEditorDrawer onClose={() => setEditorOpen(false)} />}
    </div>
  );
}

function FilterChip({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0A0A0A', color: '#fff', borderRadius: 999, padding: '6px 12px' }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#aaa' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'transparent', color: '#fff', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        {options.map((o) => <option key={o} value={o} style={{ color: '#000' }}>{o}</option>)}
      </select>
    </div>
  );
}

function BirthdaysPanel({ rows, onOpenDates }) {
  if (rows.length === 0) return null;
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="section-title">Birthdays This Month</div>
          <div className="section-sub">{rows.length} client{rows.length === 1 ? '' : 's'} · click Manage Key Dates to add more</div>
        </div>
        <button className="form-btn" type="button" onClick={onOpenDates}>+ Add</button>
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {rows.map((r) => (
          <div key={`${r.name}-${r.label}`} style={{
            display: 'grid', gridTemplateColumns: '1fr 140px 100px', gap: 10,
            padding: '10px 18px', borderTop: '1px solid #f1f1f1', alignItems: 'center',
            background: r.daysAway <= 3 ? '#fff8e1' : '#fff',
          }}>
            <div style={{ fontWeight: 600 }}>{r.name}</div>
            <div style={{ color: '#555' }}>{r.monthDay}</div>
            <div style={{ textAlign: 'right', fontSize: 11, fontWeight: r.daysAway <= 3 ? 700 : 400, color: r.daysAway <= 3 ? '#c62828' : '#888' }}>
              {r.daysAway === 0 ? 'TODAY' : `${r.daysAway}d away`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ label, items, today }) {
  const headerColor = label === 'Overdue' ? '#c62828' : label === 'Today' ? '#e65100' : '#555';
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: headerColor, margin: '6px 0 8px' }}>
        {label} ({items.length})
      </div>
      <div className="section-card">
        {items.map((it, i) => (
          <TaskRow key={it.id} item={it} today={today} first={i === 0} />
        ))}
      </div>
    </div>
  );
}

function TaskRow({ item, today, first }) {
  const role = item.task.role || 'lo';
  const roleColors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
  const days = Math.round((item.due_date - today) / DAY);
  const dueLabel = days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `${days}d`;
  const onToggle = () => {
    const due = item.due_date;
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    if (item.completed) unmarkTaskCompleted(item.task.id, item.client_name, iso);
    else markTaskCompleted(item.task.id, item.client_name, iso);
  };
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '30px 1fr 180px 90px 80px', gap: 10,
      padding: '12px 14px', borderTop: first ? 'none' : '1px solid #f1f1f1',
      alignItems: 'center', background: item.completed ? '#fafafa' : '#fff',
    }}>
      <input type="checkbox" checked={item.completed} onChange={onToggle}
        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-red)' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: item.completed ? '#aaa' : '#222', textDecoration: item.completed ? 'line-through' : 'none' }}>
          {item.task.title}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          {item.client_name} · {item.workflow.name}
          {item.task.notes ? ` · ${item.task.notes}` : ''}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#666' }}>{fmtDate(item.due_date)}</div>
      <div>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: roleColors[role] || '#555', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {ROLE_LABELS[role] || role}
        </span>
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, fontWeight: days < 0 ? 700 : 400, color: days < 0 ? '#c62828' : days === 0 ? '#e65100' : '#888' }}>
        {dueLabel}
      </div>
    </div>
  );
}

function EmptyState({ onDates, onWorkflows }) {
  return (
    <div className="section-card">
      <div className="section-body" style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No tasks yet</div>
        <div style={{ fontSize: 12, color: '#666', marginBottom: 18 }}>
          Add at least one workflow with one task, then add a key date for at least one client.
        </div>
        <div style={{ display: 'inline-flex', gap: 10 }}>
          <button className="form-btn" onClick={onDates}>Add Key Dates</button>
          <button className="form-btn primary" onClick={onWorkflows}>Build Workflows</button>
        </div>
      </div>
    </div>
  );
}

// ─── Manage Key Dates drawer ────────────────────────────────────
function ManageDatesDrawer({ onClose }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [draft, setDraft] = useState({ client: '', label: 'Birthday', value: '', recurring: true });
  const clientNames = useMemo(() => collectClientNames(LOANS, PAST_CLIENTS), []);
  const labels = allKnownDateLabels();

  const submit = async () => {
    if (!draft.client || !draft.label || !draft.value) return;
    await upsertClientDate(draft.client, draft.label, draft.value, { recurring: draft.recurring });
    setDraft({ client: '', label: draft.label, value: '', recurring: draft.recurring });
    bump();
  };

  const allDates = [...getAllDates().values()].sort(
    (a, b) => (a.client_name || '').localeCompare(b.client_name || '') ||
              (a.date_label || '').localeCompare(b.date_label || '')
  );

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4, display: 'block' };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Client for Life</div>
          <div className="drawer-borrower">Key Dates</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Birthdays + anything else worth tracking · workflows trigger off these</div>
        </div>
        <div className="drawer-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Client</label>
              <input list="cfl-clients" value={draft.client} onChange={(e) => setDraft((d) => ({ ...d, client: e.target.value }))}
                placeholder="Type or pick" style={inputStyle} />
              <datalist id="cfl-clients">
                {clientNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div>
              <label style={labelStyle}>Label</label>
              <input list="cfl-date-labels" value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="Birthday, Lease End, etc." style={inputStyle} />
              <datalist id="cfl-date-labels">
                {labels.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input type="date" value={draft.value} onChange={(e) => setDraft((d) => ({ ...d, value: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Recurring?</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555', padding: '8px 0' }}>
                <input type="checkbox" checked={draft.recurring} onChange={(e) => setDraft((d) => ({ ...d, recurring: e.target.checked }))} />
                Yearly (birthdays, anniversaries)
              </label>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <button className="form-btn primary" type="button" onClick={submit} disabled={!draft.client || !draft.label || !draft.value}>
                + Save Date
              </button>
            </div>
          </div>

          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 8 }}>
            Saved Dates ({allDates.length})
          </div>
          {allDates.length === 0 ? (
            <div style={{ color: '#888', fontSize: 12, fontStyle: 'italic' }}>None yet — add one above.</div>
          ) : (
            allDates.map((row) => (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 90px 30px', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee', alignItems: 'center', fontSize: 12 }}>
                <div style={{ fontWeight: 600 }}>{row.client_name}</div>
                <div style={{ color: '#555' }}>{row.date_label}</div>
                <div style={{ color: '#222' }}>{fmtMonthDay(parseLocalDate(row.date_value))}</div>
                <button onClick={async () => { await deleteClientDate(row.client_name, row.date_label); bump(); }}
                  title="Delete this date"
                  style={{ background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" type="button" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

// ─── Workflow Editor drawer ─────────────────────────────────────
function WorkflowEditorDrawer({ onClose }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeId, setActiveId] = useState(getWorkflows()[0]?.id || null);
  const [editingTask, setEditingTask] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);

  useEffect(() => {
    if (!activeId && getWorkflows()[0]) setActiveId(getWorkflows()[0].id);
  }, [activeId]);

  const handleNewWorkflow = async () => {
    const name = window.prompt('Name the workflow (e.g. "New Funded Loan", "Birthday Outreach")');
    if (!name) return;
    const wf = await createWorkflow(name.trim());
    if (wf) setActiveId(wf.id);
    bump();
  };

  const handleDeleteWorkflow = async (wf) => {
    if (!window.confirm(`Delete workflow "${wf.name}" and all of its tasks? This can't be undone.`)) return;
    await deleteWorkflow(wf.id);
    const remaining = getWorkflows();
    setActiveId(remaining[0]?.id || null);
    bump();
  };

  const handleAddTask = async () => {
    if (!active) return;
    const t = await createTask(active.id, { title: 'New task' });
    if (t) setEditingTask(t);
    bump();
  };

  const handleDuplicateTask = async (t) => {
    const copy = await createTask(active.id, {
      title: `${t.title} (copy)`,
      role: t.role,
      trigger_label: t.trigger_label,
      trigger_days: t.trigger_days,
      trigger_recurring: t.trigger_recurring,
      notes: t.notes,
    });
    if (copy) setEditingTask(copy);
    bump();
  };

  // Drag-to-reorder: track which task is being dragged, swap positions
  // on drop, persist new ordering to Supabase one updateTask call per
  // task. Cheap for typical workflow sizes (5–30 tasks).
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = async (targetTask) => {
    if (!draggingTaskId || draggingTaskId === targetTask.id) return;
    const list = [...(getTasksFor(active.id) || [])];
    const fromIdx = list.findIndex((t) => t.id === draggingTaskId);
    const toIdx = list.findIndex((t) => t.id === targetTask.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    await Promise.all(list.map((t, i) =>
      t.position !== i ? updateTask(t.id, { position: i }) : null
    ));
    setDraggingTaskId(null);
    bump();
  };

  const active = getWorkflows().find((w) => w.id === activeId);
  const tasks = active ? getTasksFor(active.id) : [];
  const triggerLabels = [TRIGGER_BUILTIN_CLOSING, ...allKnownDateLabels()];

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 980, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Client for Life</div>
          <div className="drawer-borrower">Workflows</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Build templates · drag to reorder · click a task to edit</div>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
          <WorkflowSidebar
            workflows={getWorkflows()}
            activeId={activeId}
            onPick={setActiveId}
            onNew={handleNewWorkflow}
          />

          {active ? (
            <div>
              <WorkflowHeader workflow={active} onDelete={() => handleDeleteWorkflow(active)} bump={bump} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555' }}>
                  Tasks ({tasks.length})
                </div>
                <button className="form-btn primary" onClick={handleAddTask}>+ Add Task</button>
              </div>

              {tasks.length === 0 ? (
                <EmptyTaskState onAdd={handleAddTask} />
              ) : (
                tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isDragging={draggingTaskId === t.id}
                    onDragStart={() => setDraggingTaskId(t.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(t)}
                    onEdit={() => setEditingTask(t)}
                    onDuplicate={() => handleDuplicateTask(t)}
                    onDelete={async () => {
                      if (window.confirm(`Delete task "${t.title}"?`)) {
                        await deleteTask(t.id);
                        bump();
                      }
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            <div style={{ color: '#888', fontSize: 13, padding: '40px 20px', textAlign: 'center' }}>
              Create a workflow on the left to start building tasks.
            </div>
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" type="button" onClick={onClose}>Done</button>
        </div>
      </aside>

      {editingTask && (
        <TaskEditDrawer
          task={editingTask}
          triggerLabels={triggerLabels}
          onClose={() => { setEditingTask(null); bump(); }}
          onDelete={async () => {
            await deleteTask(editingTask.id);
            setEditingTask(null);
            bump();
          }}
        />
      )}
    </>
  );
}

function WorkflowSidebar({ workflows, activeId, onPick, onNew }) {
  return (
    <div style={{ borderRight: '1px solid #eee', paddingRight: 12 }}>
      <button className="form-btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={onNew}>+ New Workflow</button>
      {workflows.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', padding: 8 }}>
          No workflows yet. Create one to get started.
        </div>
      ) : (
        workflows.map((wf) => {
          const count = (getTasksFor(wf.id) || []).length;
          const isActive = wf.id === activeId;
          return (
            <div key={wf.id} onClick={() => onPick(wf.id)} style={{
              padding: '10px 12px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
              background: isActive ? '#0A0A0A' : 'transparent',
              color: isActive ? '#fff' : '#222',
              fontSize: 13,
              transition: 'background .12s',
            }}>
              <div style={{ fontWeight: 600 }}>{wf.name || 'Untitled'}</div>
              <div style={{ fontSize: 10, color: isActive ? '#bbb' : '#888', marginTop: 2 }}>
                {count} task{count === 1 ? '' : 's'}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function WorkflowHeader({ workflow, onDelete, bump }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, padding: '4px 0' }}>
      <div style={{ flex: 1 }}>
        <input
          defaultValue={workflow.name}
          onBlur={(e) => {
            const v = e.target.value.trim() || workflow.name;
            if (v !== workflow.name) updateWorkflow(workflow.id, { name: v }).then(bump);
          }}
          style={{
            width: '100%', fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700,
            border: 'none', borderBottom: '1px solid transparent', padding: '4px 2px',
            background: 'transparent', outline: 'none',
          }}
          onFocus={(e) => e.target.style.borderBottomColor = '#0A0A0A'}
          onBlurCapture={(e) => e.target.style.borderBottomColor = 'transparent'}
        />
        <input
          defaultValue={workflow.description || ''}
          placeholder="Description (optional)"
          onBlur={(e) => updateWorkflow(workflow.id, { description: e.target.value }).then(bump)}
          style={{
            width: '100%', fontSize: 12, color: '#666',
            border: 'none', padding: '4px 2px',
            background: 'transparent', outline: 'none',
          }}
        />
      </div>
      <button className="form-btn" style={{ color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>
        Delete workflow
      </button>
    </div>
  );
}

function EmptyTaskState({ onAdd }) {
  return (
    <div style={{
      padding: 30, textAlign: 'center', border: '2px dashed #e0e0e0',
      borderRadius: 8, color: '#888',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 6 }}>No tasks yet</div>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        Add tasks that should fire against every client this workflow runs on.
      </div>
      <button className="form-btn primary" onClick={onAdd}>+ Add first task</button>
    </div>
  );
}

function TaskCard({ task, isDragging, onDragStart, onDragOver, onDrop, onEdit, onDuplicate, onDelete }) {
  const role = task.role || 'lo';
  const roleColors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ color: '#bbb', fontSize: 16, padding: '4px 4px 0', userSelect: 'none', cursor: 'grab' }} title="Drag to reorder">⋮⋮</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#fff',
            background: roleColors[role] || '#555',
            padding: '3px 8px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>{ROLE_LABELS[role] || role}</span>
          <span style={{ fontSize: 11, color: '#888' }}>{triggerSummary(task)}</span>
        </div>
        <div
          style={{ fontSize: 14, fontWeight: 600, color: task.title ? '#222' : '#bbb', cursor: 'pointer' }}
          onClick={onEdit}
        >
          {task.title || 'Untitled task — click Edit'}
        </div>
        {task.notes && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.4 }}>{task.notes}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={onEdit}>Edit</button>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px' }} title="Duplicate" onClick={onDuplicate}>Copy</button>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px', color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>×</button>
      </div>
    </div>
  );
}

function triggerSummary(t) {
  const days = t.trigger_days || 0;
  const label = t.trigger_label || TRIGGER_BUILTIN_CLOSING;
  const when = days === 0
    ? `On ${label}`
    : days < 0
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} before ${label}`
      : `${days} day${days === 1 ? '' : 's'} after ${label}`;
  return t.trigger_recurring ? `${when} · every year` : when;
}

// ─── Single-task edit drawer (opens over the workflow editor) ──
function TaskEditDrawer({ task, triggerLabels, onClose, onDelete }) {
  const [title, setTitle] = useState(task.title || '');
  const [role, setRole] = useState(task.role || 'lo');
  const [triggerLabel, setTriggerLabel] = useState(task.trigger_label || TRIGGER_BUILTIN_CLOSING);
  // Convert the raw days int into mode + magnitude so the UI can be
  // friendly. Mode is one of 'before' / 'on' / 'after'.
  const initialDays = task.trigger_days || 0;
  const [mode, setMode] = useState(initialDays === 0 ? 'on' : initialDays < 0 ? 'before' : 'after');
  const [magnitude, setMagnitude] = useState(Math.abs(initialDays));
  const [recurring, setRecurring] = useState(!!task.trigger_recurring);
  const [notes, setNotes] = useState(task.notes || '');

  const effectiveDays = mode === 'on' ? 0 : mode === 'before' ? -Math.abs(magnitude) : Math.abs(magnitude);

  const save = async () => {
    await updateTask(task.id, {
      title: title.trim() || 'Untitled task',
      role,
      trigger_label: triggerLabel,
      trigger_days: effectiveDays,
      trigger_recurring: recurring,
      notes: notes.trim() || null,
    });
    onClose();
  };

  // Live preview: when would this task fire for a representative client?
  const previewDate = useMemo(() => {
    // Just project from today as a stand-in anchor.
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const due = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + effectiveDays);
    return due;
  }, [effectiveDays]);

  const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6, display: 'block' };
  const sectionStyle = { marginBottom: 18 };

  return (
    <>
      <div className="drawer-overlay open" style={{ zIndex: 200 }} onClick={onClose} />
      <aside className="drawer open" style={{ width: 560, maxWidth: '95vw', zIndex: 201 }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Workflow Task</div>
          <div className="drawer-borrower">{title || 'Untitled task'}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{triggerSummary({ trigger_label: triggerLabel, trigger_days: effectiveDays, trigger_recurring: recurring })}</div>
        </div>
        <div className="drawer-body">
          <div style={sectionStyle}>
            <label style={labelStyle}>Task</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} autoFocus />
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Owner</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROLES.map((r) => {
                const active = role === r;
                const colors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
                return (
                  <button key={r} type="button" onClick={() => setRole(r)} style={{
                    padding: '8px 14px', borderRadius: 999,
                    border: `1px solid ${active ? colors[r] : '#d0d0d0'}`,
                    background: active ? colors[r] : '#fff',
                    color: active ? '#fff' : '#333',
                    fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px',
                    cursor: 'pointer',
                  }}>{ROLE_LABELS[r]}</button>
                );
              })}
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>When</label>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 1fr', gap: 8, alignItems: 'stretch' }}>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}>
                <option value="on">On the day</option>
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
              <input
                type="number" min={0} value={magnitude}
                disabled={mode === 'on'}
                onChange={(e) => setMagnitude(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{ ...inputStyle, textAlign: 'center', opacity: mode === 'on' ? 0.4 : 1 }}
              />
              <select value={triggerLabel} onChange={(e) => setTriggerLabel(e.target.value)} style={inputStyle}>
                {triggerLabels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'On day', m: 'on', n: 0 },
                { label: '1d before', m: 'before', n: 1 },
                { label: '3d before', m: 'before', n: 3 },
                { label: '1wk before', m: 'before', n: 7 },
                { label: '1d after', m: 'after', n: 1 },
                { label: '7d after', m: 'after', n: 7 },
                { label: '30d after', m: 'after', n: 30 },
                { label: '90d after', m: 'after', n: 90 },
              ].map((p) => (
                <button key={p.label} type="button"
                  onClick={() => { setMode(p.m); setMagnitude(p.n); }}
                  style={{
                    padding: '4px 10px', borderRadius: 999,
                    border: '1px solid #d0d0d0', background: '#fafafa',
                    fontSize: 11, cursor: 'pointer',
                  }}>{p.label}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Repeat every year (birthdays, anniversaries)
            </label>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Notes / script (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
              placeholder="What to say, gift ideas, special instructions, etc."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
          </div>

          <div style={{ padding: 14, background: '#fff8e1', border: '1px solid #f5e7a3', borderRadius: 8, fontSize: 12, color: '#5a4a1a' }}>
            <strong>Preview</strong>
            <div style={{ marginTop: 4 }}>
              If a client's <em>{triggerLabel}</em> were today, this task would be due{' '}
              <strong>{effectiveDays === 0 ? 'today' : fmtDate(previewDate)}</strong>
              {recurring ? ' · regenerates every year' : ''}.
            </div>
          </div>
        </div>
        <div className="drawer-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button className="drawer-btn" style={{ color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>Delete</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="drawer-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="drawer-btn primary" type="button" onClick={save}>Save</button>
          </div>
        </div>
      </aside>
    </>
  );
}
