// Tasks & Projects — verbatim port from legacy/index.html (PROJECTS, TASKS,
// TASK_STATUSES, TASK_PRIORITIES). Legacy also syncs TASKS with Supabase in real
// time; that sync is stubbed in the React port (see Tasks.jsx).

export const PROJECTS = [
  {id:'proj1', name:'Q2 Marketing Push', color:'#c8102e', desc:'Launch new realtor partner campaign + lead magnets'},
  {id:'proj2', name:'Recruit New LOs', color:'#1976d2', desc:'Interview, onboard, and license new team members'},
  {id:'proj3', name:'Tech Stack Upgrades', color:'#2e7d32', desc:'New CRM, dashboard, and automation rollouts'},
  {id:'proj4', name:'Personal Development', color:'#7b1fa2', desc:'Books, coaching, courses, and skill building'},
  {id:'proj5', name:'Inbox', color:'#555', desc:'Incoming tasks (auto-categorize later) \u2014 default bucket for SMS intake'},
];

export const TASKS_SEED = [
  {id:'tk1', projectId:'proj1', title:'Draft realtor partner email sequence', status:'inprogress', priority:'high', assignee:'Kyle Duke', due:'2026-04-20', createdVia:'manual', created:'2026-04-10', notes:'5-email welcome series with value-adds'},
  {id:'tk2', projectId:'proj1', title:'Design VIP agent gift box', status:'todo', priority:'medium', assignee:'Kyle Duke', due:'2026-04-25', createdVia:'manual', created:'2026-04-11', notes:''},
  {id:'tk3', projectId:'proj1', title:'Record walk-through video for new partners', status:'todo', priority:'medium', assignee:'Kyle Duke', due:'2026-04-28', createdVia:'siri', created:'2026-04-12', notes:'Dictated via Siri shortcut'},
  {id:'tk4', projectId:'proj2', title:'Post junior LO role on LinkedIn', status:'done', priority:'high', assignee:'Kyle Duke', due:'2026-04-05', createdVia:'manual', created:'2026-04-01', notes:''},
  {id:'tk5', projectId:'proj2', title:'Interview round 1 \u2014 3 candidates', status:'inprogress', priority:'high', assignee:'Kyle Duke', due:'2026-04-18', createdVia:'manual', created:'2026-04-08', notes:''},
  {id:'tk6', projectId:'proj3', title:'Migrate Loan Mgmt to new dashboard', status:'inprogress', priority:'high', assignee:'Kyle Duke', due:'2026-04-30', createdVia:'manual', created:'2026-04-01', notes:'Working with Sunshine/Claude'},
  {id:'tk7', projectId:'proj3', title:'Wire SMS \u2192 Claude API webhook', status:'todo', priority:'medium', assignee:'Kyle Duke', due:'2026-05-05', createdVia:'manual', created:'2026-04-14', notes:'Twilio + Netlify function'},
  {id:'tk8', projectId:'proj4', title:'Finish "Traction" by Gino Wickman', status:'inprogress', priority:'low', assignee:'Kyle Duke', due:'2026-04-30', createdVia:'manual', created:'2026-04-01', notes:''},
  {id:'tk9', projectId:'proj5', title:'Call Dave from Veterans United', status:'todo', priority:'medium', assignee:'Kyle Duke', due:'2026-04-16', createdVia:'siri', created:'2026-04-13', notes:'Dictated: "call dave VU tuesday"'},
  {id:'tk10', projectId:'proj1', title:'Send Q2 review to top 10 agents', status:'todo', priority:'high', assignee:'Missy', due:'2026-04-22', createdVia:'manual', created:'2026-04-09', notes:''},
];

export const TASK_STATUSES = [
  {key:'todo', label:'To Do', color:'#888', bg:'#f4f4f6'},
  {key:'inprogress', label:'In Progress', color:'#1976d2', bg:'#e3f2fd'},
  {key:'blocked', label:'Blocked', color:'#c8102e', bg:'#fff1f3'},
  {key:'done', label:'Done', color:'#2e7d32', bg:'#e8f5e9'},
];

export const TASK_PRIORITIES = [
  {key:'high', label:'High', color:'#c8102e'},
  {key:'medium', label:'Medium', color:'#f5c518'},
  {key:'low', label:'Low', color:'#888'},
];

export const newTrackerTaskId = () => 'tk' + Date.now() + Math.floor(Math.random()*1000);

// Bidirectional mapping between the DB row schema and the in-page TASKS schema.
export function supabaseRowToTask(row){
  return {
    id: row.id,
    projectId: row.project_id || 'proj5',
    title: row.title,
    status: row.status || 'todo',
    priority: row.priority || 'medium',
    assignee: row.assignee || '',
    due: row.due || '',
    notes: row.notes || '',
    createdVia: row.created_via || 'manual',
    created: row.created_at ? row.created_at.slice(0,10) : '',
  };
}
export function taskToSupabaseRow(t){
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
