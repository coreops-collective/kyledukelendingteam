import { useMemo, useState } from 'react';
import { CLIENT_FOR_LIFE, TASK_ROLES } from '../data/cfl.js';

export default function CFL() {
  const cats = useMemo(
    () => [...new Set(CLIENT_FOR_LIFE.map((c) => c.cat))],
    []
  );
  const [active, setActive] = useState(0);
  const [openId, setOpenId] = useState(null);

  const activeCat = cats[active] || cats[0];
  const tasksInCat = CLIENT_FOR_LIFE.filter((c) => c.cat === activeCat);
  const total = tasksInCat.length;

  return (
    <div>
      <div className="page-title" style={{ marginBottom: 18 }}>
        Clients for Life
      </div>

      <div className="wf-tabs">
        {cats.map((cat, i) => {
          const catTasks = CLIENT_FOR_LIFE.filter((c) => c.cat === cat);
          return (
            <button
              key={cat}
              className={`wf-tab ${i === active ? 'active' : ''}`}
              onClick={() => {
                setActive(i);
                setOpenId(null);
              }}
            >
              {cat}
              <span
                style={{ opacity: 0.5, marginLeft: 6, fontSize: 10 }}
              >
                {catTasks.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="wf-header-row">
        <div>
          <h2>{activeCat}</h2>
          <div className="desc">
            Post-close nurture touches for {activeCat.toLowerCase()}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontFamily: "'Oswald', sans-serif",
              fontSize: 22,
              fontWeight: 700,
              color: 'var(--brand-red)',
              lineHeight: 1,
            }}
          >
            {total}
          </div>
          <div
            style={{
              fontSize: 10,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              marginTop: 4,
            }}
          >
            Touches
          </div>
        </div>
      </div>

      <div className="wf-checklist-polished">
        {tasksInCat.length === 0 ? (
          <div
            style={{ padding: 30, textAlign: 'center', color: '#999' }}
          >
            No touches in this category yet
          </div>
        ) : (
          tasksInCat.map((t, idx) => (
            <CflTaskRow
              key={t.id}
              task={t}
              index={idx}
              open={openId === t.id}
              onToggle={() =>
                setOpenId(openId === t.id ? null : t.id)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function CflTaskRow({ task, index, open, onToggle }) {
  const role = task.role || task.who || 'lo';
  const metaChips = [];
  if (task.assignee) metaChips.push({ k: 'assignee', v: `\u25CB ${task.assignee}` });
  if (task.system) metaChips.push({ k: 'system', v: `\u25A0 ${task.system}` });
  if (task.when) metaChips.push({ k: 'when', v: `\u23F0 ${task.when}` });

  return (
    <>
      <div
        className={`wf-task-polished role-${role}`}
        onClick={onToggle}
      >
        <div className="wf-num">{index + 1}</div>
        <div className="wf-task-body">
          <div className="wf-task-head">
            <span className={`wf-task-label ${role}`}>
              {TASK_ROLES[role] || role}
            </span>
            {task.icon ? (
              <span style={{ fontSize: 16 }}>{task.icon}</span>
            ) : null}
          </div>
          <div className="wf-task-text">
            {task.title || task.text || '(no title)'}
          </div>
          {metaChips.length > 0 && (
            <div className="wf-task-meta">
              {metaChips.map((c) => (
                <span key={c.k} className="chip">
                  {c.v}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="wf-task-arrow">{open ? '\u02C5' : '\u203A'}</div>
      </div>
      {open && (
        <div className="cfl-detail-inline">
          {task.when && (
            <div className="cfl-detail-row">
              <div className="cfl-detail-label">When</div>
              <div className="cfl-detail-val">{task.when}</div>
            </div>
          )}
          {task.how && (
            <div className="cfl-detail-row">
              <div className="cfl-detail-label">How</div>
              <div className="cfl-detail-val">
                <div className="cfl-detail-how">{task.how}</div>
              </div>
            </div>
          )}
          {task.template && task.template !== '\u2014' && (
            <div className="cfl-detail-row">
              <div className="cfl-detail-label">Template</div>
              <div className="cfl-detail-val">{task.template}</div>
            </div>
          )}
          {task.system && (
            <div className="cfl-detail-row">
              <div className="cfl-detail-label">System</div>
              <div className="cfl-detail-val">{task.system}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
