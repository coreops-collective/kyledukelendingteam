import { useEffect, useMemo, useState } from 'react';
import { USERS } from '../data/users.js';
import { parseLocalDate } from '../lib/clientDates.js';
import {
  PROJECTS as PROJECTS_SEED,
  TASKS_SEED,
  TASK_STATUSES,
  TASK_PRIORITIES,
  newTrackerTaskId,
} from '../data/tasks.js';
import Tour from '../components/Tour.jsx';
import { getCurrentUser } from '../lib/auth.js';

// Projects (formerly the "Tasks" tab under Pipeline Tasks). Manual
// Kanban of the team's non-workflow work — recruiting, marketing,
// tech stack, etc. Grouped by project (color-coded), managed in
// swim-lane columns (To Do / In Progress / Blocked / Done).
//
// Completion semantics: when a user marks a task done (drawer status
// dropdown → 'done' OR bulk-complete), the row disappears from view.
// Behind the scenes the task keeps its 'done' status so audit / stats
// aren't lost, but the Kanban never shows the Done column — the whole
// point of this page is "what am I working on right now".

const TASKS_KEY = 'kdt-tasks-v1';
const PROJECTS_KEY = 'kdt-projects-v1';

const VISIBLE_STATUSES = TASK_STATUSES.filter((s) => s.key !== 'done');

function loadStored(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export default function Projects() {
  const [tasks, setTasks] = useState(() => loadStored(TASKS_KEY, TASKS_SEED));
  const [projects, setProjects] = useState(() => loadStored(PROJECTS_KEY, PROJECTS_SEED));
  const [activeProjectId, setActiveProjectId] = useState('all');
  const [activeTab, setActiveTab] = useState('tasks');
  const [openTaskId, setOpenTaskId] = useState(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickProject, setQuickProject] = useState(PROJECTS_SEED[0]?.id || '');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [toastMsg, setToastMsg] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);

  // Persist every change immediately — 200 small objects is cheap.
  useEffect(() => { try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch {} }, [projects]);

  const me = useMemo(() => getCurrentUser(), []);

  const toast = (body, title = 'Task') => {
    setToastMsg({ title, body });
    setTimeout(() => setToastMsg(null), 1600);
  };

  // Only show open tasks — completed ones drop out immediately so the
  // board reads as "what I'm actively working on". The user wanted this
  // behavior — leaving a Done column visible was cluttering things up.
  const openTasks = tasks.filter((t) => t.status !== 'done');
  const visibleTasks = activeProjectId === 'all'
    ? openTasks
    : openTasks.filter((t) => t.projectId === activeProjectId);
  const allCount = openTasks.length;

  const addTrackerTaskQuick = () => {
    const title = quickTitle.trim();
    if (!title) return;
    const newTask = {
      id: newTrackerTaskId(),
      projectId: quickProject,
      title,
      status: 'todo',
      priority: 'medium',
      assignee: me?.name || 'Kyle Duke',
      due: '',
      createdVia: 'manual',
      created: new Date().toISOString().slice(0, 10),
      notes: '',
    };
    setTasks((prev) => [...prev, newTask]);
    setQuickTitle('');
    toast('Task added', 'New Task');
  };

  const addProject = () => {
    const name = window.prompt('Project name?');
    if (!name) return;
    setProjects((prev) => [...prev, { id: 'proj' + (prev.length + 1), name, color: '#555', desc: '' }]);
  };

  const saveTask = (id, patch) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
    toast('Task saved');
    setOpenTaskId(null);
  };

  // Delete = hard remove. Confirm first because this can't be undone.
  const deleteTask = (id) => {
    const target = tasks.find((t) => t.id === id);
    if (!window.confirm(`Delete "${target?.title || 'this task'}"? This can't be undone.`)) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
    toast('Task deleted', 'Removed');
    setOpenTaskId(null);
  };

  // Complete a task: mark status='done'. It disappears from the visible
  // Kanban immediately (VISIBLE_STATUSES excludes 'done').
  const completeTask = (id) => {
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: 'done' } : t));
    toast('Task complete');
  };

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const bulkComplete = () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Mark ${selected.size} task${selected.size === 1 ? '' : 's'} done? They\'ll disappear from the board.`)) return;
    setTasks((prev) => prev.map((t) => selected.has(t.id) ? { ...t, status: 'done' } : t));
    setSelected(new Set());
    setSelectMode(false);
    toast(`${selected.size} task${selected.size === 1 ? '' : 's'} completed`, 'Bulk update');
  };
  const exitSelectMode = () => { setSelected(new Set()); setSelectMode(false); };

  const openTask = tasks.find((t) => t.id === openTaskId) || null;

  const PROJECTS_TOUR_STEPS = [
    {
      title: 'Projects',
      body: 'Your own Kanban board for non-workflow work — recruiting, marketing, tech stack, quarterly initiatives. Not tied to any loan.\n\nColumns: To Do · In Progress · Blocked. Click any task to edit assignee, priority, due date, notes.',
    },
    {
      title: 'Add a task',
      body: 'Type in the "Quick add a task" input at the top, pick a project, hit Enter. It lands in To Do.\n\nClick any task card to open the drawer for full editing.',
    },
    {
      title: 'Complete a task',
      body: 'Open the task, set Status to "Done", Save. The task disappears from the board — the whole point of this page is "what am I working on right now", not a graveyard of completed items.\n\nTo knock out several at once: click "Select multiple" at the top of a column, tap the tasks to select, then "✓ Complete N".',
    },
    {
      title: 'Manage projects',
      body: 'Switch to the Projects sub-tab to rename, recolor, or delete a project. Deleting a project doesn\'t delete its tasks — they just lose their project tag.',
    },
  ];

  return (
    <>
      <div className="section-card" style={{ marginBottom: 20 }}>
        <div className="section-header">
          <div>
            <div className="section-title">
              {allCount} Open Task{allCount === 1 ? '' : 's'}
            </div>
            <div className="section-sub">
              {projects.length} project{projects.length === 1 ? '' : 's'} · completed tasks disappear from view
            </div>
          </div>
          <div data-tour="tracker-tabs" style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,.12)', padding: 4, borderRadius: 8 }}>
            <button
              onClick={() => setActiveTab('tasks')}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700,
                background: activeTab === 'tasks' ? '#fff' : 'transparent',
                color: activeTab === 'tasks' ? '#0A0A0A' : '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                boxShadow: activeTab === 'tasks' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
            >Board</button>
            <button
              onClick={() => setActiveTab('projects')}
              style={{
                padding: '6px 14px', fontSize: 12, fontWeight: 700,
                background: activeTab === 'projects' ? '#fff' : 'transparent',
                color: activeTab === 'projects' ? '#0A0A0A' : '#fff',
                border: 'none', borderRadius: 6, cursor: 'pointer',
                boxShadow: activeTab === 'projects' ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
              }}
            >Projects</button>
          </div>
        </div>

        <div className="section-body" style={{ padding: 16 }}>
          {activeTab === 'projects' ? (
            <ProjectsTab
              projects={projects}
              tasks={tasks}
              onAdd={addProject}
              onRename={(id, name) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, name } : p))}
              onRecolor={(id, color) => setProjects((prev) => prev.map((p) => p.id === id ? { ...p, color } : p))}
              onDelete={(id) => {
                const p = projects.find((x) => x.id === id);
                if (!window.confirm(`Delete project "${p?.name || 'this project'}"? Tasks inside it stay put but move to no project.`)) return;
                setProjects((prev) => prev.filter((x) => x.id !== id));
                setTasks((prev) => prev.map((t) => t.projectId === id ? { ...t, projectId: null } : t));
              }}
              onOpenProject={(id) => { setActiveProjectId(id); setActiveTab('tasks'); }}
            />
          ) : (
            <>
              <div className="tk-layout">
                <div className="tk-sidebar">
                  <h3>Projects</h3>
                  <div className={`tk-project ${activeProjectId === 'all' ? 'active' : ''}`} onClick={() => setActiveProjectId('all')}>
                    <div className="tk-project-dot" style={{ background: '#333' }} />
                    <span>All Tasks</span>
                    <span className="tk-project-count">{allCount}</span>
                  </div>
                  {projects.map((p) => {
                    const openCount = openTasks.filter((t) => t.projectId === p.id).length;
                    return (
                      <div key={p.id} className={`tk-project ${activeProjectId === p.id ? 'active' : ''}`} onClick={() => setActiveProjectId(p.id)}>
                        <div className="tk-project-dot" style={{ background: p.color }} />
                        <span>{p.name}</span>
                        <span className="tk-project-count">{openCount}</span>
                      </div>
                    );
                  })}
                  <button className="form-btn" onClick={addProject} style={{ width: '100%', marginTop: 10, background: '#fafafa', color: '#666', border: '1px dashed var(--border)' }}>+ New Project</button>
                </div>
                <div className="tk-main">
                  <div className="tk-add-row">
                    <input
                      placeholder="Quick add a task... (press Enter)"
                      value={quickTitle}
                      onChange={(e) => setQuickTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTrackerTaskQuick(); }}
                    />
                    <select value={quickProject} onChange={(e) => setQuickProject(e.target.value)}>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button onClick={addTrackerTaskQuick}>Add Task</button>
                  </div>

                  {/* Select-multiple toolbar */}
                  {!selectMode && visibleTasks.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                      <button
                        onClick={() => setSelectMode(true)}
                        style={{
                          padding: '5px 12px', fontSize: 11, fontWeight: 700,
                          fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                          background: '#fff', color: '#0A0A0A', border: '1px solid #d0d0d0',
                          borderRadius: 4, cursor: 'pointer',
                        }}
                      >Select multiple</button>
                    </div>
                  )}
                  {selectMode && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                      padding: '8px 14px', background: selected.size > 0 ? '#fff3cd' : '#eef4fb',
                      border: '1px solid #e5e5e5', borderRadius: 6,
                      fontSize: 12, marginBottom: 10,
                    }}>
                      <span style={{
                        fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '.6px', color: '#0A0A0A',
                        background: '#fff', border: '1px solid #d0d0d0',
                        padding: '3px 8px', borderRadius: 999,
                      }}>Selection mode</span>
                      <span style={{ color: '#666', fontWeight: 600 }}>
                        {selected.size > 0 ? `${selected.size} selected` : 'Tap a card checkbox to select it'}
                      </span>
                      {selected.size > 0 && (
                        <button
                          onClick={bulkComplete}
                          style={{
                            padding: '5px 12px', fontSize: 11, fontWeight: 700,
                            background: '#0A0A0A', color: '#fff', border: 'none',
                            borderRadius: 4, cursor: 'pointer',
                            textTransform: 'uppercase', letterSpacing: '.4px',
                          }}
                        >✓ Complete {selected.size}</button>
                      )}
                      <button
                        onClick={exitSelectMode}
                        style={{
                          marginLeft: 'auto',
                          padding: '5px 10px', fontSize: 11, fontWeight: 700,
                          background: 'transparent', color: '#555', border: '1px solid #d0d0d0',
                          borderRadius: 4, cursor: 'pointer',
                          textTransform: 'uppercase', letterSpacing: '.4px',
                          fontFamily: "'Oswald',sans-serif",
                        }}
                      >Exit</button>
                    </div>
                  )}

                  <div className="tk-columns">
                    {VISIBLE_STATUSES.map((st) => {
                      const list = visibleTasks.filter((t) => t.status === st.key);
                      return (
                        <div key={st.key} className="tk-col" style={{ borderTopColor: st.color }}>
                          <div className="tk-col-head">
                            <span style={{ color: st.color }}>{st.label}</span>
                            <span className="tk-col-count">{list.length}</span>
                          </div>
                          {list.length ? list.map((t) => {
                            const proj = projects.find((p) => p.id === t.projectId);
                            const pri = TASK_PRIORITIES.find((p) => p.key === t.priority) || TASK_PRIORITIES[1];
                            const dueObj = t.due ? parseLocalDate(t.due) : null;
                            const today = new Date(); today.setHours(0, 0, 0, 0);
                            const overdue = dueObj && dueObj < today;
                            const dueLabel = dueObj ? dueObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
                            const isSelected = selected.has(t.id);
                            return (
                              <div
                                key={t.id}
                                className="tk-card"
                                onClick={() => !selectMode && setOpenTaskId(t.id)}
                                style={isSelected ? { background: '#fffce7', borderColor: '#f5c518' } : undefined}
                              >
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                  {selectMode ? (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => toggleOne(t.id)}
                                      style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer', accentColor: '#0A0A0A' }}
                                      aria-label="Select"
                                    />
                                  ) : (
                                    <input
                                      type="checkbox"
                                      checked={false}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={() => completeTask(t.id)}
                                      style={{ width: 16, height: 16, marginTop: 2, cursor: 'pointer', accentColor: 'var(--brand-red)' }}
                                      title="Mark complete"
                                      aria-label="Complete"
                                    />
                                  )}
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="tk-card-title">{t.title}</div>
                                    <div className="tk-card-meta">
                                      <span className="tk-card-pri" style={{ background: pri.color + '20', color: pri.color }}>{pri.label}</span>
                                      {proj ? (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: proj.color }} />
                                          {proj.name}
                                        </span>
                                      ) : null}
                                      {dueLabel ? (
                                        <span style={{ color: overdue ? '#c8102e' : '#888', fontWeight: overdue ? 700 : 500 }}>
                                          {overdue ? '⚠ ' : ''}Due {dueLabel}
                                        </span>
                                      ) : null}
                                      {t.assignee ? <span>· {t.assignee}</span> : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }) : (
                            <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: 11, fontStyle: 'italic' }}>Nothing here</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {openTask && (
        <TaskDrawer
          task={openTask}
          projects={projects}
          onClose={() => setOpenTaskId(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      )}

      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#222', color: '#fff', padding: '10px 16px', borderRadius: 8, zIndex: 1000, boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.6px', color: '#bbb' }}>{toastMsg.title}</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{toastMsg.body}</div>
        </div>
      )}
      {tourOpen && <Tour steps={PROJECTS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </>
  );
}

// Projects sub-tab: shows each project as a card with name, color,
// task count, and open-count. Rename inline, recolor via a color
// input, delete with confirmation.
function ProjectsTab({ projects, tasks, onAdd, onRename, onRecolor, onDelete, onOpenProject }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {projects.map((p) => {
          const total = tasks.filter((t) => t.projectId === p.id).length;
          const open = tasks.filter((t) => t.projectId === p.id && t.status !== 'done').length;
          const overdueCount = tasks.filter((t) => {
            if (t.projectId !== p.id || t.status === 'done' || !t.due) return false;
            const d = parseLocalDate(t.due);
            const today = new Date(); today.setHours(0, 0, 0, 0);
            return !!d && d < today;
          }).length;
          return (
            <div
              key={p.id}
              style={{
                background: '#fff', border: '1px solid #e5e5e5', borderTop: `4px solid ${p.color || '#555'}`,
                borderRadius: 10, padding: 14,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input
                  type="color"
                  value={p.color || '#555555'}
                  onChange={(e) => onRecolor(p.id, e.target.value)}
                  style={{ width: 28, height: 28, padding: 0, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }}
                  aria-label={`${p.name} color`}
                />
                <input
                  defaultValue={p.name}
                  onBlur={(e) => onRename(p.id, e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 14, fontWeight: 700, border: '1px solid transparent', borderRadius: 6, background: '#fafafa' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#666', marginBottom: 12 }}>
                <span>{open} open</span>
                <span>·</span>
                <span>{total} total</span>
                {overdueCount > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: '#c62828', fontWeight: 700 }}>⚠ {overdueCount} overdue</span>
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onOpenProject(p.id)}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 700,
                    fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                    background: '#0A0A0A', color: '#fff', border: 'none',
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >Open board</button>
                <button
                  onClick={() => onDelete(p.id)}
                  style={{
                    padding: '6px 10px', fontSize: 11, fontWeight: 700,
                    fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
                    background: '#fff', color: '#c62828', border: '1px solid #f5cccc',
                    borderRadius: 4, cursor: 'pointer',
                  }}
                >Delete</button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={onAdd}
        style={{
          marginTop: 12, padding: '8px 16px', fontSize: 12, fontWeight: 700,
          fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px',
          background: '#fff', color: '#0A0A0A', border: '1px dashed #d0d0d0',
          borderRadius: 6, cursor: 'pointer',
        }}
      >+ Add project</button>
    </div>
  );
}

function TaskDrawer({ task, projects, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task.title,
    projectId: task.projectId,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    due: task.due || '',
    notes: task.notes || '',
  });
  const proj = projects.find((p) => p.id === form.projectId);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const teamNames = useMemo(() => USERS.map((u) => u.name), []);
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" id="drawer" style={{ width: 520, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">
            {proj ? proj.name : 'Task'}
          </div>
          <div className="drawer-borrower">{task.title}</div>
        </div>
        <div className="drawer-body">
          <div className="form-grid" style={{ padding: 0 }}>
            <div className="form-field full"><label>Title</label>
              <input value={form.title} onChange={set('title')} />
            </div>
            <div className="form-field"><label>Project</label>
              <select value={form.projectId} onChange={set('projectId')}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Status</label>
              <select value={form.status} onChange={set('status')}>
                {TASK_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Priority</label>
              <select value={form.priority} onChange={set('priority')}>
                {TASK_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Assignee</label>
              <select value={form.assignee} onChange={set('assignee')}>
                {teamNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Due Date</label>
              <input type="date" value={form.due} onChange={set('due')} />
            </div>
            <div className="form-field"><label>Created</label>
              <input value={`${task.created || ''} · manual`} disabled />
            </div>
            <div className="form-field full"><label>Notes</label>
              <textarea rows={5} value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={() => onDelete(task.id)} style={{ color: '#c8102e' }}>Delete</button>
          <button className="drawer-btn primary" onClick={() => onSave(task.id, form)}>Save</button>
        </div>
      </aside>
    </>
  );
}
