import { useState } from 'react';
import { WORKFLOWS, TASK_ROLES, newTaskId } from '../data/workflows.js';
import TaskDrawer from '../components/TaskDrawer.jsx';

// Port of renderWorkflows() from legacy/index.html. Uses the .wf-* classes
// from styles.css verbatim. Inline styles are copied verbatim from the legacy
// template literal so the visual output matches exactly.
export default function Workflows() {
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState('checklist'); // 'checklist' | 'swim'
  // Shallow copy so we can mutate step list via +Add Step without touching module
  const [workflows, setWorkflows] = useState(() => WORKFLOWS.map(w => ({...w, steps:[...w.steps]})));
  const [openTask, setOpenTask] = useState(null);

  const wf = workflows[active] || workflows[0];
  const total = wf.steps.length;

  const addWfTask = (wfIdx) => {
    const copy = workflows.map(w => ({...w, steps:[...w.steps]}));
    copy[wfIdx].steps.push({id:newTaskId(),role:'lo',label:'LO Task',text:'New step',assignee:'',system:'',completed:false,dueDate:'',how:'',why:'',when:''});
    setWorkflows(copy);
  };

  const openTaskDrawer = (_kind, id) => {
    const step = wf.steps.find(s => s.id === id);
    if (step) setOpenTask(step);
  };

  const renderChecklist = () => (
    <div className="wf-checklist-polished">
      {wf.steps.map((s, idx) => {
        const metaChips = [];
        if (s.assignee) metaChips.push(<span key="a" className="chip">{'\u25CB '}{s.assignee}</span>);
        if (s.system)   metaChips.push(<span key="s" className="chip">{'\u25A0 '}{s.system}</span>);
        if (s.when)     metaChips.push(<span key="w" className="chip">{'\u23F0 '}{s.when}</span>);
        return (
          <div key={s.id} className={`wf-task-polished role-${s.role}`} onClick={() => openTaskDrawer('workflow', s.id)}>
            <div className="wf-num">{idx + 1}</div>
            <div className="wf-task-body">
              <div className="wf-task-head">
                <span className={`wf-task-label ${s.role}`}>{s.label || TASK_ROLES[s.role] || s.role}</span>
              </div>
              <div className="wf-task-text">{s.text || '(no title)'}</div>
              {metaChips.length ? <div className="wf-task-meta">{metaChips}</div> : null}
            </div>
            <div className="wf-task-arrow">{'\u203A'}</div>
          </div>
        );
      })}
      <div className="wf-add" onClick={() => addWfTask(active)}>+ Add Step</div>
    </div>
  );

  const renderSwim = () => {
    const roles = ['lo','loa','automated','admin'];
    const colors = {lo:'#555', loa:'#f5c518', automated:'#C8102E', admin:'#2e7d32'};
    const bgs = {lo:'#f8f8fa', loa:'#fffdf0', automated:'#fffafb', admin:'#f5fbf5'};
    const roleStepMap = {};
    roles.forEach(r => { roleStepMap[r] = []; });
    wf.steps.forEach((s, idx) => {
      const r = roles.includes(s.role) ? s.role : 'lo';
      roleStepMap[r].push({ ...s, order: idx + 1 });
    });
    return (
      <div className="wf-swim-wrap">
        <div className="wf-swim-grid">
          {roles.map(r => {
            const lrSteps = roleStepMap[r];
            return (
              <div key={r} className="wf-lane" style={{background:bgs[r], borderTop:`4px solid ${colors[r]}`}}>
                <div className="wf-lane-head">
                  <div className="wf-lane-title">{TASK_ROLES[r]}</div>
                  <div className="wf-lane-count">{lrSteps.length}</div>
                </div>
                <div className="wf-lane-body">
                  {lrSteps.length ? lrSteps.map(s => (
                    <div key={s.id} className="wf-lane-card" onClick={() => openTaskDrawer('workflow', s.id)}>
                      <div className="wf-lane-card-head">
                        <span style={{fontFamily:"'Oswald',sans-serif",fontSize:10,fontWeight:700,color:colors[r],background:'#fff',padding:'2px 7px',borderRadius:10,border:`1px solid ${colors[r]}`}}>#{s.order}</span>
                      </div>
                      <div className="wf-lane-card-text">{s.text || '(no title)'}</div>
                      {(s.assignee || s.system || s.when) ? (
                        <div className="wf-lane-meta">
                          {s.assignee ? <span>{'\u25CB '}{s.assignee}</span> : null}
                          {s.system ? <span>{'\u25A0 '}{s.system}</span> : null}
                          {s.when ? <span>{'\u23F0 '}{s.when}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  )) : <div style={{padding:20,textAlign:'center',color:'#bbb',fontSize:11,fontStyle:'italic'}}>No steps</div>}
                </div>
              </div>
            );
          })}
        </div>
        <button className="form-btn primary" onClick={() => addWfTask(active)} style={{marginTop:14,width:'100%'}}>+ Add Step</button>
      </div>
    );
  };

  return (
    <>
      <div className="wf-tabs">
        {workflows.map((w, i) => (
          <button key={i} className={`wf-tab ${i===active?'active':''}`} onClick={() => setActive(i)}>
            {w.title}
            <span style={{opacity:.5,marginLeft:6,fontSize:10}}>{w.steps.length}</span>
          </button>
        ))}
      </div>
      <div className="wf-header-row">
        <div>
          <h2>{wf.title}</h2>
          <div className="desc">{wf.desc || ''}</div>
        </div>
        <div style={{display:'flex',gap:20,alignItems:'center'}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:"'Oswald',sans-serif",fontSize:22,fontWeight:700,color:'var(--brand-red)',lineHeight:1}}>{total}</div>
            <div style={{fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.5px',marginTop:4}}>Steps</div>
          </div>
          <div style={{display:'flex',gap:6,background:'#f4f4f6',borderRadius:8,padding:4,width:'fit-content',marginLeft:'auto'}}>
            <button
              className={`wf-layout-btn ${layout==='checklist'?'active':''}`}
              onClick={() => setLayout('checklist')}
              style={{padding:'6px 14px',border:'none',background:layout==='checklist'?'#fff':'transparent',boxShadow:layout==='checklist'?'0 1px 3px rgba(0,0,0,.1)':'none',borderRadius:6,fontFamily:"'Oswald',sans-serif",fontSize:10,textTransform:'uppercase',letterSpacing:'.6px',fontWeight:700,color:layout==='checklist'?'var(--brand-red)':'#888',cursor:'pointer'}}
            >Step List</button>
            <button
              className={`wf-layout-btn ${layout==='swim'?'active':''}`}
              onClick={() => setLayout('swim')}
              style={{padding:'6px 14px',border:'none',background:layout==='swim'?'#fff':'transparent',boxShadow:layout==='swim'?'0 1px 3px rgba(0,0,0,.1)':'none',borderRadius:6,fontFamily:"'Oswald',sans-serif",fontSize:10,textTransform:'uppercase',letterSpacing:'.6px',fontWeight:700,color:layout==='swim'?'var(--brand-red)':'#888',cursor:'pointer'}}
            >Swim Lanes</button>
          </div>
        </div>
      </div>
      {layout === 'checklist' ? renderChecklist() : renderSwim()}
      {openTask && (
        <TaskDrawer
          task={openTask}
          kind="workflow"
          parentTitle={wf.title}
          onClose={() => setOpenTask(null)}
        />
      )}
    </>
  );
}
