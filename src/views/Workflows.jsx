import { useEffect, useMemo, useState } from 'react';
import {
  getWorkflows, getTasksFor, loadWorkflows,
  createWorkflow, deleteWorkflow, createTask, updateTask, deleteTask,
  ROLES, ROLE_LABELS, TRIGGER_BUILTIN_CLOSING,
  WORKFLOW_CATEGORIES, allWorkflowCategories, addWorkflowCategory,
} from '../lib/workflows.js';
import { loadKeyDateTypes, getKeyDateTypeLabels } from '../lib/keyDateTypes.js';
import {
  ManageKeyDateTypesDrawer, TaskEditDrawer, TaskCard, WorkflowHeader, triggerSummary,
} from './CFL.jsx';

// Workflows & SOPs — the one and only workflow management surface.
// Reads from the same workflow_templates + workflow_tasks tables as
// Client for Life. Tasks are editable INLINE on this page (no
// secondary drawer needed): click any task to open its editor,
// + Add Task drops a new one at the bottom, × removes it, drag to
// reorder. New Workflow creates a new bucket via a two-prompt flow.
export default function Workflows() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeId, setActiveId] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [datesOpen, setDatesOpen] = useState(false);
  const [category, setCategory] = useState('Loan');
  const [draggingTaskId, setDraggingTaskId] = useState(null);

  useEffect(() => {
    loadWorkflows().then(bump);
    loadKeyDateTypes().then(bump);
    const events = [
      'kdt-workflows-changed', 'kdt-workflows-loaded',
      'kdt-key-date-types-changed', 'kdt-key-date-types-loaded',
      'kdt-workflow-categories-changed',
    ];
    const on = () => bump();
    events.forEach((e) => window.addEventListener(e, on));
    return () => events.forEach((e) => window.removeEventListener(e, on));
  }, []);

  const allWorkflows = getWorkflows();
  const workflows = allWorkflows.filter((w) => (w.category || 'Loan') === category);
  const wf = workflows.find((w) => w.id === activeId) || workflows[0] || null;
  const tasks = wf ? getTasksFor(wf.id) : [];

  // Compute counts inline every render. Can't useMemo on allWorkflows
  // — it's a mutable module-level array that keeps the same reference
  // when items are added/removed, so a memo keyed on it goes stale
  // and the badges freeze at their first-render values.
  const knownCategories = allWorkflowCategories();
  const categoryCounts = {};
  knownCategories.forEach((c) => { categoryCounts[c] = 0; });
  allWorkflows.forEach((w) => {
    const c = w.category || 'Loan';
    categoryCounts[c] = (categoryCounts[c] || 0) + 1;
  });

  const promptForNewCategory = () => {
    const raw = window.prompt('Name the new category:');
    const clean = (raw || '').trim();
    if (!clean) return null;
    addWorkflowCategory(clean);
    setCategory(clean);
    bump();
    return clean;
  };

  const catalogLabels = getKeyDateTypeLabels();
  const triggerLabels = catalogLabels.length > 0
    ? [TRIGGER_BUILTIN_CLOSING, ...catalogLabels]
    : [TRIGGER_BUILTIN_CLOSING];

  const handleNewWorkflow = async () => {
    const name = window.prompt(`Name the new "${category}" workflow:`);
    if (!name || !name.trim()) return;
    const created = await createWorkflow(name.trim(), '', category);
    if (created) setActiveId(created.id);
    bump();
  };

  const handleDeleteWorkflow = async () => {
    if (!wf) return;
    if (!window.confirm(`Delete workflow "${wf.name}" and all of its tasks? This can't be undone.`)) return;
    await deleteWorkflow(wf.id);
    setActiveId(null);
    bump();
  };

  const handleAddTask = async () => {
    if (!wf) return;
    const t = await createTask(wf.id, { title: 'New task' });
    if (t) setEditingTask(t);
    bump();
  };

  // "+ Add task for this branch" on a decision-parent task auto-wires
  // the new task's depends_on_task_id + depends_on_outcome so it only
  // appears once the parent's decision has been answered with that
  // specific outcome. Editor opens on the new task ready to fill in.
  const handleAddBranchTask = async (parent, outcome) => {
    if (!wf) return;
    const t = await createTask(wf.id, {
      title: `New task (if ${outcome})`,
      role: parent.role || 'lo',
      trigger_kind: parent.trigger_kind || 'status',
      trigger_label: parent.trigger_label,
      depends_on_task_id: parent.id,
      depends_on_outcome: outcome,
    });
    if (t) setEditingTask(t);
    bump();
  };

  const handleDuplicate = async (t) => {
    const copy = await createTask(wf.id, {
      title: `${t.title} (copy)`,
      role: t.role,
      trigger_kind: t.trigger_kind,
      trigger_label: t.trigger_label,
      trigger_days: t.trigger_days,
      trigger_recurring: t.trigger_recurring,
      repeat_interval: t.repeat_interval,
      condition_field: t.condition_field,
      condition_op: t.condition_op,
      email_recipient: t.email_recipient,
      email_subject: t.email_subject,
      email_body: t.email_body,
      notes: t.notes,
    });
    if (copy) setEditingTask(copy);
    bump();
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    await deleteTask(t.id);
    bump();
  };

  const handleDrop = async (targetTask) => {
    if (!draggingTaskId || draggingTaskId === targetTask.id) return;
    const list = [...tasks];
    const from = list.findIndex((t) => t.id === draggingTaskId);
    const to = list.findIndex((t) => t.id === targetTask.id);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await Promise.all(list.map((t, i) =>
      t.position !== i ? updateTask(t.id, { position: i }) : null
    ));
    setDraggingTaskId(null);
    bump();
  };

  const categoryBar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      {knownCategories.map((c) => {
        const active = c === category;
        return (
          <button
            key={c}
            onClick={() => { setCategory(c); setActiveId(null); }}
            style={{
              padding: '8px 14px', borderRadius: 999,
              border: `1px solid ${active ? '#0A0A0A' : '#d0d0d0'}`,
              background: active ? '#0A0A0A' : '#fff',
              color: active ? '#fff' : '#333',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {c}
            <span style={{
              padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: active ? 'rgba(255,255,255,.2)' : '#eee',
              color: active ? '#fff' : '#666',
            }}>{categoryCounts[c] || 0}</span>
          </button>
        );
      })}
      <button
        onClick={promptForNewCategory}
        title="Add a custom category"
        style={{
          padding: '8px 14px', borderRadius: 999,
          border: '1px dashed #d0d0d0',
          background: '#fff',
          color: '#666',
          fontWeight: 600, fontSize: 12, cursor: 'pointer',
        }}
      >+ New category</button>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          Click any task to edit · drag ⋮⋮ to reorder · + Add Task to append
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="form-btn" onClick={() => setDatesOpen(true)}>Manage Key Date Types</button>
          <button className="form-btn primary" onClick={handleNewWorkflow}>+ New Workflow</button>
        </div>
      </div>

      {categoryBar}

      {workflows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', border: '2px dashed #e0e0e0', borderRadius: 8, color: '#888' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 6 }}>
            No <em>{category}</em> workflows yet
          </div>
          <div style={{ fontSize: 12 }}>
            Click <strong>+ New Workflow</strong> above to build the first one in this category.
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
          {/* Workflow list on the left, click to switch */}
          <div style={{ borderRight: '1px solid #eee', paddingRight: 12 }}>
            {workflows.map((w) => {
              const isActive = w.id === (wf && wf.id);
              const count = (getTasksFor(w.id) || []).length;
              return (
                <div key={w.id} onClick={() => setActiveId(w.id)} style={{
                  padding: '10px 12px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
                  background: isActive ? '#0A0A0A' : 'transparent',
                  color: isActive ? '#fff' : '#222',
                  fontSize: 13,
                }}>
                  <div style={{ fontWeight: 600 }}>{w.name || 'Untitled'}</div>
                  <div style={{ fontSize: 10, color: isActive ? '#bbb' : '#888', marginTop: 2 }}>
                    {count} task{count === 1 ? '' : 's'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active workflow — header + inline-editable task list */}
          {wf && (
            <div>
              <WorkflowHeader workflow={wf} onDelete={handleDeleteWorkflow} bump={bump} />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555' }}>
                  Tasks ({tasks.length})
                </div>
                <button className="form-btn primary" onClick={handleAddTask}>+ Add Task</button>
              </div>

              {tasks.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', border: '2px dashed #e0e0e0', borderRadius: 8, color: '#888' }}>
                  <div style={{ fontSize: 12, marginBottom: 12 }}>No tasks in this workflow yet.</div>
                  <button className="form-btn primary" onClick={handleAddTask}>+ Add first task</button>
                </div>
              ) : (
                <TaskTree
                  tasks={tasks}
                  draggingTaskId={draggingTaskId}
                  setDraggingTaskId={setDraggingTaskId}
                  onDrop={handleDrop}
                  onEdit={(t) => setEditingTask(t)}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onAddBranchTask={handleAddBranchTask}
                />
              )}
            </div>
          )}
        </div>
      )}

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
      {datesOpen && <ManageKeyDateTypesDrawer onClose={() => { setDatesOpen(false); bump(); }} />}
    </>
  );
}

// Nested-branch renderer. Each top-level task (no depends_on_task_id)
// gets a TaskCard. If it has decision_options, we render the
// question + answers below the card, and beneath each answer we
// indent every task that depends_on that specific (parent, outcome)
// pair. "+ Add task for this branch" per answer wires the new
// child correctly.
function TaskTree({ tasks, draggingTaskId, setDraggingTaskId, onDrop, onEdit, onDuplicate, onDelete, onAddBranchTask }) {
  // Group child tasks by parent id.
  const childrenByParent = new Map();
  tasks.forEach((t) => {
    if (!t.depends_on_task_id) return;
    if (!childrenByParent.has(t.depends_on_task_id)) childrenByParent.set(t.depends_on_task_id, []);
    childrenByParent.get(t.depends_on_task_id).push(t);
  });

  const topLevel = tasks.filter((t) => !t.depends_on_task_id);

  const cardProps = (t) => ({
    task: t,
    isDragging: draggingTaskId === t.id,
    onDragStart: () => setDraggingTaskId(t.id),
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => onDrop(t),
    onEdit: () => onEdit(t),
    onDuplicate: () => onDuplicate(t),
    onDelete: () => onDelete(t),
  });

  return (
    <>
      {topLevel.map((t) => {
        const options = Array.isArray(t.decision_options) ? t.decision_options : [];
        const children = childrenByParent.get(t.id) || [];
        return (
          <div key={t.id}>
            <TaskCard {...cardProps(t)} />
            {options.length > 0 && (
              <div style={{
                marginLeft: 40, marginBottom: 14, padding: '12px 14px',
                borderLeft: '3px solid #0d47a1', background: '#f5f9ff',
                borderRadius: '0 8px 8px 0',
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0d47a1', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 10 }}>
                  Question: "{t.title}"
                </div>
                {options.map((outcome) => {
                  const branchTasks = children.filter((c) => (c.depends_on_outcome || '') === outcome);
                  return (
                    <div key={outcome} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#333' }}>
                          If answered <span style={{ padding: '2px 8px', background: '#0d47a1', color: '#fff', borderRadius: 4, fontSize: 11, marginLeft: 4 }}>{outcome}</span>
                        </div>
                        <button
                          className="form-btn"
                          style={{ fontSize: 11, padding: '4px 10px' }}
                          onClick={() => onAddBranchTask(t, outcome)}
                        >+ Add task</button>
                      </div>
                      {branchTasks.length === 0 ? (
                        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', padding: 6, marginLeft: 6 }}>
                          No tasks for this branch yet.
                        </div>
                      ) : (
                        branchTasks.map((child) => (
                          <div key={child.id} style={{ marginLeft: 6 }}>
                            <TaskCard {...cardProps(child)} />
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
                {/* Any children whose outcome isn't in the parent's
                    options list (e.g. was removed) get surfaced so
                    they aren't invisible. */}
                {children.filter((c) => !options.includes(c.depends_on_outcome || '')).length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #cfe4f5' }}>
                    <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>
                      Orphan branches (answer no longer in the list — edit the child or restore the answer):
                    </div>
                    {children.filter((c) => !options.includes(c.depends_on_outcome || '')).map((child) => (
                      <div key={child.id} style={{ marginLeft: 6, opacity: 0.7 }}>
                        <TaskCard {...cardProps(child)} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
