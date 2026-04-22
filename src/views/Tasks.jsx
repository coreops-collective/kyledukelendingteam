import { useState, useMemo } from 'react';
import {
  PROJECTS as PROJECTS_SEED,
  TASKS_SEED,
  TASK_STATUSES,
  TASK_PRIORITIES,
  newTrackerTaskId,
} from '../data/tasks.js';
import { USERS } from '../data/users.js';

// Port of renderTasks() from legacy/index.html. Supabase read/write is stubbed
// with console.log + toast; the drawer + Siri panel copy is verbatim from legacy.
export default function Tasks() {
  const [tasks, setTasks] = useState(TASKS_SEED);
  const [projects, setProjects] = useState(PROJECTS_SEED);
  const [activeProjectId, setActiveProjectId] = useState('all');
  const [showSmsPanel, setShowSmsPanel] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickProject, setQuickProject] = useState(() => activeProjectId === 'all' ? 'proj5' : activeProjectId);
  const [openTaskId, setOpenTaskId] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  // Legacy's getCurrentUser(). Without auth wired up, default to Kyle so Siri
  // setup link matches legacy behavior for the primary user.
  const me = USERS[0];
  const canUseSiri = me && (me.name === 'Kyle Duke' || me.name === 'Missy');

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
    setTasks(prev => prev.filter(t => t.id !== id));
    toast('Task deleted', 'Removed');
    console.log('[stub] sbDeleteTask', id);
    setOpenTaskId(null);
  };

  const openTask = tasks.find(t => t.id === openTaskId) || null;

  return (
    <>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,fontWeight:700,textTransform:'uppercase',letterSpacing:'.8px'}}>
            {tasks.filter(t => t.status !== 'done').length} Open Tasks
          </div>
          <div style={{fontSize:11,color:'#888',marginTop:2}}>
            {projects.length} projects
            {canUseSiri ? (
              <>
                {' \u00b7 '}
                <a href="#" onClick={(e) => { e.preventDefault(); setShowSmsPanel(v => !v); }} style={{color:'#1976d2',textDecoration:'none'}}>{'\u{1F399}\uFE0F Siri setup'}</a>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {showSmsPanel && canUseSiri ? <SiriPanel onClose={() => setShowSmsPanel(false)} /> : null}

      <div className="tk-layout">
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
                    const dueObj = t.due ? new Date(t.due) : null;
                    const today = new Date(); today.setHours(0,0,0,0);
                    const overdue = dueObj && dueObj < today && t.status !== 'done';
                    const dueLabel = dueObj && !isNaN(dueObj) ? dueObj.toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
                    return (
                      <div key={t.id} className="tk-card" onClick={() => setOpenTaskId(t.id)}>
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
                          {t.createdVia === 'siri' ? <span className="tk-card-via-sms" title="Dictated to Siri">{'\u{1F399}\uFE0F Siri'}</span> : null}
                          {t.assignee ? <span>{'\u00b7 '}{t.assignee}</span> : null}
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
    </>
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
          <button className="drawer-close" onClick={onClose}>{'\u00d7'}</button>
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

function SiriPanel({ onClose }) {
  return (
    <div className="tk-sms-panel">
      <h3>{'\u{1F399}\uFE0F "Hey Siri, New Task" \u2192 Claude API'}</h3>
      <div style={{fontSize:12,color:'#aaa',marginBottom:14,lineHeight:1.5}}>
        Siri grabs what you say, sends it to the Kyle Duke Team's Claude endpoint, Claude parses it into a structured task, and it lands on this board. Only enabled for Kyle + Missy.
      </div>
      <div className="tk-sms-step">
        <div className="tk-sms-num">1</div>
        <div className="tk-sms-step-text">
          <strong>On your iPhone, open the Shortcuts app</strong> and tap + to create a new shortcut. Name it <code>New Task</code> (this is what you'll say to Siri).
        </div>
      </div>
      <div className="tk-sms-step">
        <div className="tk-sms-num">2</div>
        <div className="tk-sms-step-text">
          <strong>Add these 3 actions</strong> (tap Add Action for each):
          <ul style={{margin:'8px 0 0 0',paddingLeft:18,color:'#ccc',lineHeight:1.7}}>
            <li><strong>Dictate Text</strong> {'\u2014'} language English. <em>This is what Siri will listen to.</em></li>
            <li>
              <strong>Get Contents of URL</strong> {'\u2014'} Method: POST, Request Body: JSON, Headers: <code>Content-Type: application/json</code> and <code>X-KDT-Auth: &lt;your secret&gt;</code>, URL:
              <div className="tk-sms-code">https://thekyleduketeam.netlify.app/.netlify/functions/task-intake</div>
              JSON body:
              <div className="tk-sms-code">{`{
  "text": [Dictated Text],
  "user": "Kyle"
}`}</div>
            </li>
            <li><strong>Speak Text</strong> {'\u2014'} "Got it." (optional, so Siri confirms.)</li>
          </ul>
        </div>
      </div>
      <div className="tk-sms-step">
        <div className="tk-sms-num">3</div>
        <div className="tk-sms-step-text">
          <strong>Deploy the Netlify function</strong> (<code>task-intake.js</code>). It takes the dictated text, asks Claude to extract a structured task, and writes it to Supabase:
          <div className="tk-sms-code">{`// netlify/functions/task-intake.js
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const claude = new Anthropic();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async (req) => {
  // Only Kyle + Missy can post tasks
  if(req.headers.get('x-kdt-auth') !== process.env.KDT_SHORTCUT_SECRET){
    return new Response('unauthorized', {status:401});
  }
  const { text, user } = await req.json();
  if(user !== 'Kyle' && user !== 'Missy'){
    return new Response('forbidden', {status:403});
  }

  // Ask Claude to parse the dictated text into a task
  const msg = await claude.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: \`Extract a task from this dictation. Return ONLY JSON:
{"title":"...","priority":"high|medium|low","due":"YYYY-MM-DD or null",
 "project":"Q2 Marketing Push|Recruit New LOs|Tech Stack Upgrades|Personal Development|Inbox",
 "notes":"..."}
Dictation: "\${text}"\`
    }]
  });
  const task = JSON.parse(msg.content[0].text);

  await supabase.from('tasks').insert({
    ...task, assignee: user, created_via: 'siri',
    created_at: new Date().toISOString()
  });

  return new Response(JSON.stringify({ok:true, task}));
};`}</div>
        </div>
      </div>
      <div className="tk-sms-step">
        <div className="tk-sms-num">4</div>
        <div className="tk-sms-step-text">
          <strong>Set environment variables</strong> in Netlify:
          <ul style={{margin:'6px 0 0 0',paddingLeft:18,color:'#ccc',lineHeight:1.7}}>
            <li><code>ANTHROPIC_API_KEY</code> {'\u2014'} from console.anthropic.com</li>
            <li><code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_KEY</code></li>
            <li><code>KDT_SHORTCUT_SECRET</code> {'\u2014'} any random string. Put the same value in the <code>X-KDT-Auth</code> header in the Shortcut.</li>
          </ul>
        </div>
      </div>
      <div className="tk-sms-step">
        <div className="tk-sms-num">5</div>
        <div className="tk-sms-step-text">
          <strong>Use it.</strong> Say <em>"Hey Siri, new task."</em> Siri prompts you. Say <em>"Call Dave at Veterans United tomorrow at 9am, high priority, marketing project."</em> Claude turns it into a task that appears right here. ~$0.0003 per dictation {'\u2014'} essentially free.
        </div>
      </div>
      <div style={{marginTop:14,textAlign:'right'}}>
        <button className="form-btn secondary" onClick={onClose} style={{background:'#2a2a2a',color:'#fff',border:'1px solid #444'}}>Close</button>
      </div>
    </div>
  );
}
