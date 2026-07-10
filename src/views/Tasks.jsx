import { useState, useMemo, useEffect } from 'react';
import {
  PROJECTS as PROJECTS_SEED,
  TASKS_SEED,
  TASK_STATUSES,
  TASK_PRIORITIES,
  newTrackerTaskId,
} from '../data/tasks.js';
import { USERS } from '../data/users.js';
import { LOANS } from '../data/loans.js';
import { PRE_CONTRACT_STAGES, STAGE_TO_STATUS } from '../data/stages.js';
import {
  loadWorkflows, generateStatusTasks, markTaskCompleted, unmarkTaskCompleted, ROLE_LABELS,
} from '../lib/workflows.js';
import { loadClientProfiles } from '../lib/clientProfiles.js';
import { parseLocalDate } from '../lib/clientDates.js';
import { getRoleLabel, getRoleKeysForWorkflowDropdown } from '../lib/jobRoles.js';
import Tour from '../components/Tour.jsx';

const TASKS_KEY = 'kdt-tasks-v1';
const PROJECTS_KEY = 'kdt-projects-v1';

const fmtIsoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

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

// Port of renderTasks() from legacy/index.html. Tasks + projects persist
// to localStorage so deletes/edits actually stick across refreshes —
// the previous version was state-only (useState(TASKS_SEED)) and any
// deletion silently reset on reload. Cross-user sync would require a
// real Supabase table; for now this at least makes the page behave.
export default function Tasks() {
  const [tasks, setTasks] = useState(() => loadStored(TASKS_KEY, TASKS_SEED));
  const [projects, setProjects] = useState(() => loadStored(PROJECTS_KEY, PROJECTS_SEED));
  const [workflowVersion, setWorkflowVersion] = useState(0);
  const bumpWorkflow = () => setWorkflowVersion((n) => n + 1);

  // Load workflow templates + tasks + completions + client profiles
  // once on mount. All the reads below (generateStatusTasks etc.)
  // consult the in-memory caches these load functions populate.
  useEffect(() => {
    loadWorkflows().then(bumpWorkflow);
    loadClientProfiles().then(bumpWorkflow);
    const on = () => bumpWorkflow();
    ['kdt-workflows-changed', 'kdt-workflows-loaded',
     'kdt-client-profiles-changed', 'kdt-client-profiles-loaded'].forEach((e) => window.addEventListener(e, on));
    return () => {
      ['kdt-workflows-changed', 'kdt-workflows-loaded',
       'kdt-client-profiles-changed', 'kdt-client-profiles-loaded'].forEach((e) => window.removeEventListener(e, on));
    };
  }, []);

  // Workflow-generated tasks for loans in pre-contract stages
  // (New Lead / Applied / HOT PA / REFI Watch). Under Contract →
  // Approved is deferred to a future Loan Management task area, so
  // it's intentionally excluded here.
  const pipelineTasks = useMemo(() => {
    const preContractLoans = LOANS.filter((l) =>
      !l.archived && PRE_CONTRACT_STAGES.includes(l.stage)
    );
    const generated = generateStatusTasks(preContractLoans);
    generated.sort((a, b) => a.due_date - b.due_date);
    return generated;
  }, [workflowVersion]); // real counter — was previously the setter, which never changed identity so the memo went stale

  const toggleWorkflowTask = (item) => {
    const iso = fmtIsoToday();
    // item.loan_id is populated by generateStatusTasks when the task is
    // tied to a specific loan — passing it scopes the completion to that
    // loan so two loans sharing a borrower name don't double-complete.
    if (item.completed) unmarkTaskCompleted(item.task.id, item.client_name, iso, item.loan_id);
    else markTaskCompleted(item.task.id, item.client_name, iso, null, null, item.loan_id);
    bumpWorkflow();
  };

  // Bulk completion of workflow-generated pipeline tasks. Marks each
  // selected item complete in parallel, then bumps the workflow version
  // so the panel re-renders with them checked off.
  const bulkCompleteWorkflowTasks = async (items) => {
    const iso = fmtIsoToday();
    const targets = items.filter((it) => !it.completed);
    if (targets.length === 0) return;
    if (!window.confirm(`Mark ${targets.length} task${targets.length === 1 ? '' : 's'} complete?`)) return;
    await Promise.all(targets.map((it) =>
      markTaskCompleted(it.task.id, it.client_name, iso, null, null, it.loan_id)
    ));
    bumpWorkflow();
  };

  // Persist on every change. JSON-stringifying ~200 small task objects
  // is cheap; not worth debouncing.
  useEffect(() => {
    try { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); } catch {}
  }, [tasks]);
  useEffect(() => {
    try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch {}
  }, [projects]);
  const [activeProjectId, setActiveProjectId] = useState('all');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickProject, setQuickProject] = useState(() => activeProjectId === 'all' ? 'proj5' : activeProjectId);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Legacy's getCurrentUser(). Without auth wired up, default to Kyle.
  const me = USERS[0];

  const toast = (body, title) => {
    setToastMsg({ title, body });
    setTimeout(() => setToastMsg(null), 2500);
  };

  const allCount = tasks.filter(t => t.status !== 'done').length;

  const visibleTasks = activeProjectId === 'all'
    ? tasks
    : tasks.filter(t => t.projectId === activeProjectId);

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
    setTasks(prev => [...prev, newTask]);
    setQuickTitle('');
    toast('Task added', 'New Task');
    console.log('[stub] sbInsertTask', newTask);
  };

  const addProject = () => {
    const name = window.prompt('Project name?');
    if (!name) return;
    setProjects(prev => [...prev, { id: 'proj' + (prev.length + 1), name, color: '#555', desc: '' }]);
  };

  const saveTask = (id, patch) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
    toast('Task updated', 'Saved');
    console.log('[stub] sbUpdateTask', id, patch);
    setOpenTaskId(null);
  };

  const deleteTask = (id) => {
    const target = tasks.find((t) => t.id === id);
    // Prevent one-click accidental deletion — Task Delete used to fire
    // immediately with no undo, so a misclick on the red button in
    // TaskDrawer nuked the task.
    if (!window.confirm(`Delete "${target?.title || 'this task'}"? This can't be undone.`)) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    toast('Task deleted', 'Removed');
    console.log('[stub] sbDeleteTask', id);
    setOpenTaskId(null);
  };

  const openTask = tasks.find(t => t.id === openTaskId) || null;

  // Pipeline Tasks filter state \u2014 role, stage, client search, completed
  // toggle. All start at "All" so the panel opens showing everything.
  const [pfRole, setPfRole] = useState('All');
  const [pfStage, setPfStage] = useState('All');
  const [pfClient, setPfClient] = useState('');
  const [pfShowDone, setPfShowDone] = useState(false);

  // Manual tracker sub-tabs \u2014 "tasks" is the kanban board, "projects"
  // shows the project list itself so the user can rename / recolor them
  // or drill into just-one-project.
  const [activeTab, setActiveTab] = useState('tasks');
  const [tourOpen, setTourOpen] = useState(false);
  const [trackerSelected, setTrackerSelected] = useState(new Set());
  const toggleTrackerSelected = (id) => {
    setTrackerSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const trackerBulkComplete = () => {
    if (trackerSelected.size === 0) return;
    if (!window.confirm(`Mark ${trackerSelected.size} task${trackerSelected.size === 1 ? '' : 's'} done?`)) return;
    setTasks((prev) => prev.map((t) => trackerSelected.has(t.id) ? { ...t, status: 'done' } : t));
    setTrackerSelected(new Set());
    toast(`${trackerSelected.size} task${trackerSelected.size === 1 ? '' : 's'} completed`, 'Bulk update');
  };

  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);

  const filteredPipelineTasks = useMemo(() => {
    const needle = pfClient.trim().toLowerCase();
    return pipelineTasks.filter((it) => {
      if (!pfShowDone && it.completed) return false;
      if (pfRole !== 'All' && (it.task.role || '') !== pfRole) return false;
      if (pfStage !== 'All') {
        const loan = LOANS.find((l) => l.id === it.loan_id);
        if (!loan) return false;
        if ((loan.stage || '') !== pfStage) return false;
      }
      if (needle && !(it.client_name || '').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [pipelineTasks, pfRole, pfStage, pfClient, pfShowDone]);

  const TASKS_TOUR_STEPS = [
    {
      title: 'Pipeline Tasks',
      body: 'This is your day-of work list. The top panel shows every workflow-generated task that fires for a loan currently in New Lead / Applied / HOT PA / REFI Watch \u2014 auto-generated, no manual entry.\n\nThe bottom section is your own tracker for non-workflow work: recruiting, marketing, tech stack, etc.',
    },
    {
      target: '[data-tour="pipeline-filters"]',
      title: 'Filter Pipeline Tasks',
      body: 'Narrow the top panel by:\n\n\u2022 Role \u2014 LO, LOA, Admin, Automated, or any custom role\n\u2022 Stage \u2014 filter to just New Lead files, or just HOT PAs, etc.\n\u2022 Client \u2014 free-text search across borrower names\n\u2022 Show completed \u2014 toggle on to see checked-off items\n\nLayer as many filters as you need. Reset clears everything.',
    },
    {
      target: '[data-tour="pipeline-panel"]',
      title: 'Pipeline Task rows',
      body: 'Each row shows the task, the client, the source workflow, and the role tag. Check the box to mark done \u2014 completion is scoped to that specific loan, so two loans with the same borrower name don\'t double-complete.\n\nRecurring tasks re-emit tomorrow if you don\'t check them today.',
    },
    {
      target: '[data-tour="tracker-tabs"]',
      title: 'Tasks vs Projects sub-tabs',
      body: '"Tasks" shows the Kanban board grouped by status (To Do, In Progress, Blocked, Done).\n\n"Projects" shows every project you\'ve created (Q2 Marketing, Recruiting, etc.) so you can rename them, change their colors, and see task counts per project.',
    },
    {
      target: '.tk-add-row',
      title: 'Quick add + drawer',
      body: 'Type a task title, pick the project, hit Enter or Add. It lands in the To Do column.\n\nClick any card to open the drawer and set assignee, due date, priority, notes. Due dates in the past show a red \u26A0 overdue chip.',
    },
    {
      title: 'Siri (Kyle + Missy only)',
      body: 'The \u{1F399}\uFE0F Siri setup link near the top walks you through wiring up an iPhone Shortcut that lets you say "Hey Siri, new task" and dictate \u2014 Claude parses it into a structured task and it lands right here.\n\nOnly enabled for Kyle + Missy; costs pennies per dictation.',
    },
  ];

  return (
    <>
      <PipelineTasksPanel
        items={filteredPipelineTasks}
        totalCount={pipelineTasks.length}
        onToggle={toggleWorkflowTask}
        onBulkComplete={bulkCompleteWorkflowTasks}
        filters={{
          role: pfRole, setRole: setPfRole,
          stage: pfStage, setStage: setPfStage,
          client: pfClient, setClient: setPfClient,
          showDone: pfShowDone, setShowDone: setPfShowDone,
        }}
      />

      <div className="section-card" style={{ marginBottom: 20 }}>
        <div className="section-header">
          <div>
            <div className="section-title">
              {tasks.filter(t => t.status !== 'done').length} Open Tasks
            </div>
            <div className="section-sub">
              {projects.length} projects
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
            >Tasks</button>
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
          ) : null}

          <div className="tk-layout" style={{ display: activeTab === 'tasks' ? undefined : 'none' }}>
        <div className="tk-sidebar">
          <h3>Projects</h3>
          <div className={`tk-project ${activeProjectId==='all'?'active':''}`} onClick={() => setActiveProjectId('all')}>
            <div className="tk-project-dot" style={{background:'#333'}} />
            <span>All Tasks</span>
            <span className="tk-project-count">{allCount}</span>
          </div>
          {projects.map(p => {
            const openCount = tasks.filter(t => t.projectId === p.id && t.status !== 'done').length;
            return (
              <div key={p.id} className={`tk-project ${activeProjectId===p.id?'active':''}`} onClick={() => setActiveProjectId(p.id)}>
                <div className="tk-project-dot" style={{background:p.color}} />
                <span>{p.name}</span>
                <span className="tk-project-count">{openCount}</span>
              </div>
            );
          })}
          <button className="form-btn" onClick={addProject} style={{width:'100%',marginTop:10,background:'#fafafa',color:'#666',border:'1px dashed var(--border)'}}>+ New Project</button>
        </div>
        <div className="tk-main">
          <div className="tk-add-row">
            <input
              id="newTaskInput"
              placeholder="Quick add a task... (press Enter)"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTrackerTaskQuick(); }}
            />
            <select id="newTaskProject" value={quickProject} onChange={(e) => setQuickProject(e.target.value)}>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={addTrackerTaskQuick}>Add Task</button>
          </div>
          {trackerSelected.size > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '8px 14px', background: '#fff3cd', border: '1px solid #f5c518', borderRadius: 8,
              fontSize: 12, marginBottom: 8,
            }}>
              <span style={{ color: '#666', fontWeight: 600 }}>{trackerSelected.size} selected</span>
              <button
                onClick={trackerBulkComplete}
                style={{
                  padding: '5px 14px', background: '#0A0A0A', color: '#fff',
                  border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.4px',
                }}
              >{'\u2713'} Complete {trackerSelected.size}</button>
              <button
                onClick={() => setTrackerSelected(new Set())}
                style={{ padding: '5px 10px', background: '#fff', color: '#666', border: '1px solid #ccc', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
              >Clear</button>
            </div>
          )}
          <div className="tk-columns">
            {TASK_STATUSES.map(st => {
              const list = visibleTasks.filter(t => t.status === st.key);
              return (
                <div key={st.key} className="tk-col" style={{borderTopColor:st.color}}>
                  <div className="tk-col-head">
                    <span style={{color:st.color}}>{st.label}</span>
                    <span className="tk-col-count">{list.length}</span>
                  </div>
                  {list.length ? list.map(t => {
                    const proj = projects.find(p => p.id === t.projectId);
                    const pri = TASK_PRIORITIES.find(p => p.key === t.priority) || TASK_PRIORITIES[1];
                    const dueObj = t.due ? parseLocalDate(t.due) : null;
                    const today = new Date(); today.setHours(0,0,0,0);
                    const overdue = dueObj && dueObj < today && t.status !== 'done';
                    const dueLabel = dueObj ? dueObj.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
                    const selected = trackerSelected.has(t.id);
                    return (
                      <div
                        key={t.id}
                        className="tk-card"
                        onClick={() => setOpenTaskId(t.id)}
                        style={selected ? { background: '#fffce7', borderColor: '#f5c518' } : undefined}
                      >
                        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          {t.status !== 'done' && (
                            <input
                              type="checkbox"
                              checked={selected}
                              onClick={(e) => e.stopPropagation()}
                              onChange={() => toggleTrackerSelected(t.id)}
                              style={{ width: 14, height: 14, marginTop: 2, cursor: 'pointer', accentColor: '#0A0A0A' }}
                              aria-label="Select for bulk complete"
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="tk-card-title">{t.title}</div>
                            <div className="tk-card-meta">
                              <span className="tk-card-pri" style={{background:pri.color+'20',color:pri.color}}>{pri.label}</span>
                              {proj ? (
                                <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
                                  <span style={{width:7,height:7,borderRadius:'50%',background:proj.color}} />
                                  {proj.name}
                                </span>
                              ) : null}
                              {dueLabel ? (
                                <span style={{color:overdue?'#c8102e':'#888',fontWeight:overdue?700:500}}>
                                  {overdue ? '\u26A0 ' : ''}Due {dueLabel}
                                </span>
                              ) : null}
                              {t.assignee ? <span>{'\u00b7 '}{t.assignee}</span> : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }) : (
                    <div style={{padding:20,textAlign:'center',color:'#bbb',fontSize:11,fontStyle:'italic'}}>Nothing here</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
        </div>
      </div>

      {openTask ? (
        <TaskDrawer
          task={openTask}
          projects={projects}
          onClose={() => setOpenTaskId(null)}
          onSave={saveTask}
          onDelete={deleteTask}
        />
      ) : null}

      {toastMsg ? (
        <div style={{position:'fixed',bottom:20,right:20,background:'#222',color:'#fff',padding:'10px 16px',borderRadius:8,zIndex:1000,boxShadow:'0 4px 12px rgba(0,0,0,.2)'}}>
          <div style={{fontSize:11,textTransform:'uppercase',letterSpacing:'.6px',color:'#bbb'}}>{toastMsg.title}</div>
          <div style={{fontSize:13,fontWeight:600}}>{toastMsg.body}</div>
        </div>
      ) : null}
      {tourOpen && <Tour steps={TASKS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </>
  );
}

// Projects sub-tab: shows each project as a card with name, color,
// task count, and open-count. Rename inline, recolor via a color
// input, delete with confirmation. "Open" jumps into the Tasks tab
// filtered to that project so you can drill in.
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
            const today = new Date(); today.setHours(0,0,0,0);
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
                  type="text"
                  value={p.name}
                  onChange={(e) => onRename(p.id, e.target.value)}
                  style={{ flex: 1, fontSize: 15, fontWeight: 700, border: 'none', background: 'transparent', padding: '4px 0' }}
                  aria-label="Project name"
                />
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span><strong style={{ color: '#0A0A0A' }}>{total}</strong> total</span>
                <span><strong style={{ color: '#0A0A0A' }}>{open}</strong> open</span>
                {overdueCount > 0 && (
                  <span style={{ color: '#c62828', fontWeight: 700 }}>⚠ {overdueCount} overdue</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => onOpenProject(p.id)}
                  style={{ flex: 1, padding: '7px 10px', fontSize: 12, fontWeight: 700, border: '1px solid #0A0A0A', background: '#0A0A0A', color: '#fff', borderRadius: 5, cursor: 'pointer' }}
                >Open</button>
                <button
                  onClick={() => onDelete(p.id)}
                  style={{ padding: '7px 10px', fontSize: 12, fontWeight: 700, border: '1px solid #c62828', background: '#fff', color: '#c62828', borderRadius: 5, cursor: 'pointer' }}
                >Delete</button>
              </div>
            </div>
          );
        })}
        <button
          onClick={onAdd}
          style={{
            background: '#fafafa', border: '1px dashed #bbb', borderRadius: 10, padding: 14,
            fontSize: 13, fontWeight: 700, color: '#666', cursor: 'pointer', minHeight: 130,
          }}
        >+ New Project</button>
      </div>
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
  const proj = projects.find(p => p.id === form.projectId);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const teamNames = useMemo(() => USERS.map(u => u.name), []);
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" id="drawer" style={{width:520,maxWidth:'95vw'}}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">{'\u00d7'}</button>
          <div className="drawer-stage">
            {proj ? proj.name : 'Task'}{task.createdVia === 'siri' ? ' \u00b7 \u{1F399}\uFE0F Siri' : ''}
          </div>
          <div className="drawer-borrower">{task.title}</div>
        </div>
        <div className="drawer-body">
          <div className="form-grid" style={{padding:0}}>
            <div className="form-field full"><label>Title</label>
              <input value={form.title} onChange={set('title')} />
            </div>
            <div className="form-field"><label>Project</label>
              <select value={form.projectId} onChange={set('projectId')}>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Status</label>
              <select value={form.status} onChange={set('status')}>
                {TASK_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Priority</label>
              <select value={form.priority} onChange={set('priority')}>
                {TASK_PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Assignee</label>
              <select value={form.assignee} onChange={set('assignee')}>
                {teamNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="form-field"><label>Due Date</label>
              <input type="date" value={form.due} onChange={set('due')} />
            </div>
            <div className="form-field"><label>Created</label>
              <input value={`${task.created || ''} \u00b7 ${task.createdVia === 'siri' ? 'via Siri' : 'manual'}`} disabled />
            </div>
            <div className="form-field full"><label>Notes</label>
              <textarea rows={5} value={form.notes} onChange={set('notes')} />
            </div>
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={() => onDelete(task.id)} style={{color:'#c8102e'}}>Delete</button>
          <button className="drawer-btn primary" onClick={() => onSave(task.id, form)}>Save</button>
        </div>
      </aside>
    </>
  );
}

// Pipeline Tasks panel — workflow-generated tasks whose underlying
// loan sits in a pre-contract stage (New Lead / Applied / HOT PA /
// REFI Watch). Renders above the manual projects/tasks tracker so
// the LO / LOA sees "what the system wants me to do today" first,
// then their own todos.
//
// Filter bar lets the user narrow by role, stage, client, and
// whether to include already-completed items.
function PipelineTasksPanel({ items, totalCount, onToggle, onBulkComplete, filters }) {
  // Selection state for bulk completion. Only tracks IDs currently in
  // the filtered list — resetting filters clears selections that would
  // no longer be visible.
  const [selected, setSelected] = useState(new Set());
  const visibleIds = new Set(items.filter((it) => !it.completed).map((it) => it.id));
  // Prune any stale selections when the visible list changes.
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  const allChecked = visibleIds.size > 0 && [...visibleIds].every((id) => selected.has(id));
  const someChecked = selected.size > 0;
  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected(() => allChecked ? new Set() : new Set(visibleIds));
  };
  const doBulk = async () => {
    const targets = items.filter((it) => selected.has(it.id));
    await onBulkComplete(targets);
    setSelected(new Set());
  };
  const roleColors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
  const roles = getRoleKeysForWorkflowDropdown();
  const stages = [
    { key: 'new', label: 'New Lead' },
    { key: 'applied', label: 'Applied' },
    { key: 'hotpa', label: 'HOT PA' },
    { key: 'refiwatch', label: 'REFI Watch' },
  ];
  const anyFilter = filters.role !== 'All' || filters.stage !== 'All' || filters.client.trim() || filters.showDone;
  const reset = () => {
    filters.setRole('All'); filters.setStage('All');
    filters.setClient(''); filters.setShowDone(false);
  };
  return (
    <div className="section-card" data-tour="pipeline-panel" style={{ marginBottom: 20 }}>
      <div className="section-header">
        <div>
          <div className="section-title">Pipeline Tasks · from your workflows</div>
          <div className="section-sub">
            Auto-generated for every loan in New Lead / Applied / HOT PA / REFI Watch.
          </div>
        </div>
      </div>

      <div
        data-tour="pipeline-filters"
        style={{
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
          padding: '10px 14px', background: '#f7f9fc', borderBottom: '1px solid #e5e5e5', fontSize: 12,
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10 }}>Role</span>
          <select value={filters.role} onChange={(e) => filters.setRole(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="All">All</option>
            {roles.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10 }}>Stage</span>
          <select value={filters.stage} onChange={(e) => filters.setStage(e.target.value)} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}>
            <option value="All">All</option>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180 }}>
          <span style={{ color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 10 }}>Client</span>
          <input
            type="text"
            value={filters.client}
            placeholder="Search borrower name…"
            onChange={(e) => filters.setClient(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#666' }}>
          <input type="checkbox" checked={filters.showDone} onChange={(e) => filters.setShowDone(e.target.checked)} />
          Show completed
        </label>
        {anyFilter && (
          <button
            onClick={reset}
            style={{ padding: '4px 10px', background: '#5a0e1a', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
          >Reset</button>
        )}
        <div style={{ marginLeft: 'auto', color: '#888', fontSize: 11 }}>
          {items.length} of {totalCount}
        </div>
      </div>

      {visibleIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '8px 14px', background: someChecked ? '#fff3cd' : '#f7f9fc',
          borderBottom: '1px solid #e5e5e5', fontSize: 12,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
              onChange={toggleAll}
              style={{ width: 16, height: 16, accentColor: 'var(--brand-red)' }}
            />
            <span style={{ color: '#666', fontWeight: 600 }}>
              {someChecked ? `${selected.size} selected` : 'Select all'}
            </span>
          </label>
          {someChecked && (
            <button
              onClick={doBulk}
              style={{
                padding: '5px 14px', background: '#0A0A0A', color: '#fff',
                border: 'none', borderRadius: 4, fontWeight: 700, fontSize: 11,
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '.4px',
              }}
            >✓ Complete {selected.size}</button>
          )}
        </div>
      )}

      <div className="section-body" style={{ padding: 0 }}>
        {totalCount === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 12 }}>
            No pipeline tasks today. Add a workflow with a status trigger (New Lead, Applied, HOT PA, or REFI Watch) on Workflows &amp; SOPs.
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#888', fontSize: 12 }}>
            No pipeline tasks match the current filters. <button onClick={reset} style={{ background: 'none', border: 'none', color: 'var(--brand-red)', cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Reset filters</button>
          </div>
        ) : (
          items.map((it, i) => {
            const role = it.task.role || 'lo';
            const loan = LOANS.find((l) => l.id === it.loan_id);
            const stageLabel = loan ? (STAGE_TO_STATUS[loan.stage] || loan.stage || '') : '';
            // Pipeline tasks fire daily until completed; if the loan has
            // been in this status for a while, the task has effectively
            // been "overdue" since the first day the workflow was
            // supposed to have finished it. Surface how many days the
            // loan has been in this status as a simple age indicator.
            const dueLabel = it.due_date
              ? it.due_date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '';
            const today = new Date(); today.setHours(0, 0, 0, 0);
            const overdue = it.due_date && it.due_date < today && !it.completed;
            const isSelected = selected.has(it.id);
            return (
              <div key={it.id} style={{
                display: 'grid', gridTemplateColumns: '60px 1fr 100px 90px', gap: 10,
                padding: '10px 18px', borderTop: i === 0 ? 'none' : '1px solid #f1f1f1',
                alignItems: 'center',
                background: it.completed ? '#fafafa' : isSelected ? '#fffce7' : (overdue ? '#fff5f5' : '#fff'),
              }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {!it.completed && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(it.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#0A0A0A' }}
                      title="Select for bulk complete"
                      aria-label="Select"
                    />
                  )}
                  <input
                    type="checkbox"
                    checked={it.completed}
                    onChange={() => onToggle(it)}
                    style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-red)' }}
                    title="Mark complete"
                    aria-label="Complete"
                  />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: it.completed ? '#aaa' : '#222', textDecoration: it.completed ? 'line-through' : 'none' }}>
                    {it.task.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>
                    <strong style={{ color: 'var(--brand-red)' }}>{it.client_name}</strong>
                    {stageLabel ? ` · ${stageLabel}` : ''}
                    {' · '}{it.workflow.name}
                    {it.task.notes ? ` · ${it.task.notes}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {dueLabel && (
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: overdue ? '#fff' : '#666',
                      background: overdue ? '#c62828' : '#eee',
                      padding: '3px 8px', borderRadius: 4,
                      textTransform: 'uppercase', letterSpacing: '.4px',
                    }}>
                      {overdue ? '⚠ ' : ''}{dueLabel}
                    </span>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: roleColors[role] || '#555', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                    {getRoleLabel(role)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

