import { useMemo, useState } from 'react';
import { CLIENT_FOR_LIFE, TASK_ROLES } from '../data/cfl.js';
import TaskDrawer from '../components/TaskDrawer.jsx';

// Mirrors Workflows.jsx — same tab bar, checklist/swim toggle, task-card style.
export default function CFL() {
  const cats = useMemo(
    () => [...new Set(CLIENT_FOR_LIFE.map((c) => c.cat))],
    []
  );
  const [active, setActive] = useState(0);
  const [layout, setLayout] = useState('checklist');
  const [openTask, setOpenTask] = useState(null);

  const activeCat = cats[active] || cats[0];
  const tasksInCat = CLIENT_FOR_LIFE.filter((c) => c.cat === activeCat);
  const total = tasksInCat.length;

  const renderChecklist = () => (
    <div className="wf-checklist-polished">
      {tasksInCat.length === 0
        ? <div style={{ padding: 30, textAlign: 'center', color: '#999' }}>No touches in this category yet</div>
        : tasksInCat.map((t, idx) => {
            const role = t.role || t.who || 'lo';
            const metaChips = [];
            if (t.assignee) metaChips.push(<span key="a" className="chip">{t.assignee}</span>);
            if (t.system) metaChips.push(<span key="s" className="chip">{t.system}</span>);
            if (t.when) metaChips.push(<span key="w" className="chip">{t.when}</span>);
            return (
              <div key={t.id} className={`wf-task-polished role-${role}`} onClick={() => setOpenTask(t)}>
                <div className="wf-num">{idx + 1}</div>
                <div className="wf-task-body">
                  <div className="wf-task-head">
                    <span className={`wf-task-label ${role}`}>{TASK_ROLES[role] || role}</span>
                  </div>
                  <div className="wf-task-text">{t.title || t.text || '(no title)'}</div>
                  {metaChips.length > 0 && <div className="wf-task-meta">{metaChips}</div>}
                </div>
                <div className="wf-task-arrow">{'\u203A'}</div>
              </div>
            );
          })}
    </div>
  );

  const renderSwim = () => {
    const roles = ['lo', 'loa', 'automated', 'admin'];
    const colors = { lo: '#555', loa: '#f5c518', automated: '#C8102E', admin: '#2e7d32' };
    const bgs = { lo: '#f8f8fa', loa: '#fffdf0', automated: '#fffafb', admin: '#f5fbf5' };
    const roleStepMap = {};
    roles.forEach((r) => { roleStepMap[r] = []; });
    tasksInCat.forEach((t, idx) => {
      const r = roles.includes(t.role || t.who) ? (t.role || t.who) : 'lo';
      roleStepMap[r].push({ ...t, order: idx + 1 });
    });
    return (
      <div className="wf-swim-wrap">
        <div className="wf-swim-grid">
          {roles.map((r) => (
            <div key={r} className="wf-lane" style={{ background: bgs[r], borderTop: `4px solid ${colors[r]}` }}>
              <div className="wf-lane-head">
                <div className="wf-lane-title">{TASK_ROLES[r]}</div>
                <div className="wf-lane-count">{roleStepMap[r].length}</div>
              </div>
              <div className="wf-lane-body">
                {roleStepMap[r].length
                  ? roleStepMap[r].map((t) => (
                      <div key={t.id} className="wf-lane-card" onClick={() => setOpenTask(t)}>
                        <div className="wf-lane-card-head">
                          <span style={{ fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700, color: colors[r], background: '#fff', padding: '2px 7px', borderRadius: 10, border: `1px solid ${colors[r]}` }}>#{t.order}</span>
                        </div>
                        <div className="wf-lane-card-text">{t.title || t.text || '(no title)'}</div>
                        {(t.assignee || t.system || t.when) && (
                          <div className="wf-lane-meta">
                            {t.assignee && <span>{t.assignee}</span>}
                            {t.system && <span>{t.system}</span>}
                            {t.when && <span>{t.when}</span>}
                          </div>
                        )}
                      </div>
                    ))
                  : <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: 11, fontStyle: 'italic' }}>No touches</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="wf-tabs">
        {cats.map((cat, i) => {
          const catTasks = CLIENT_FOR_LIFE.filter((c) => c.cat === cat);
          return (
            <button
              key={cat}
              className={`wf-tab ${i === active ? 'active' : ''}`}
              onClick={() => { setActive(i); setOpenTask(null); }}
            >
              {cat}
              <span style={{ opacity: 0.5, marginLeft: 6, fontSize: 10 }}>{catTasks.length}</span>
            </button>
          );
        })}
      </div>

      <div className="wf-header-row">
        <div>
          <h2>{activeCat}</h2>
          <div className="desc">Post-close nurture touches for {activeCat.toLowerCase()}</div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--brand-red)', lineHeight: 1 }}>{total}</div>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 4 }}>Touches</div>
          </div>
          <div style={{ display: 'flex', gap: 6, background: '#f4f4f6', borderRadius: 8, padding: 4 }}>
            <button
              onClick={() => setLayout('checklist')}
              style={{ padding: '6px 14px', border: 'none', background: layout === 'checklist' ? '#fff' : 'transparent', boxShadow: layout === 'checklist' ? '0 1px 3px rgba(0,0,0,.1)' : 'none', borderRadius: 6, fontFamily: "'Oswald',sans-serif", fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700, color: layout === 'checklist' ? 'var(--brand-red)' : '#888', cursor: 'pointer' }}
            >Step List</button>
            <button
              onClick={() => setLayout('swim')}
              style={{ padding: '6px 14px', border: 'none', background: layout === 'swim' ? '#fff' : 'transparent', boxShadow: layout === 'swim' ? '0 1px 3px rgba(0,0,0,.1)' : 'none', borderRadius: 6, fontFamily: "'Oswald',sans-serif", fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700, color: layout === 'swim' ? 'var(--brand-red)' : '#888', cursor: 'pointer' }}
            >Swim Lanes</button>
          </div>
        </div>
      </div>

      {layout === 'checklist' ? renderChecklist() : renderSwim()}

      {openTask && (
        <TaskDrawer
          task={openTask}
          kind="cfl"
          parentTitle={activeCat}
          onClose={() => setOpenTask(null)}
        />
      )}
    </div>
  );
}
