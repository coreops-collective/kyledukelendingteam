import { useMemo, useState } from 'react';
import { CLIENT_FOR_LIFE, TASK_ROLES } from '../data/cfl.js';
import TaskDrawer from '../components/TaskDrawer.jsx';

export default function CFL() {
  const cats = useMemo(
    () => [...new Set(CLIENT_FOR_LIFE.map((c) => c.cat))],
    []
  );
  const [active, setActive] = useState(0);
  const [openTask, setOpenTask] = useState(null);

  const activeCat = cats[active] || cats[0];
  const tasksInCat = CLIENT_FOR_LIFE.filter((c) => c.cat === activeCat);
  const total = tasksInCat.length;

  return (
    <div>
      <div className="wf-tabs">
        {cats.map((cat, i) => {
          const catTasks = CLIENT_FOR_LIFE.filter((c) => c.cat === cat);
          return (
            <button
              key={cat}
              className={`wf-tab ${i === active ? 'active' : ''}`}
              onClick={() => {
                setActive(i);
                setOpenTask(null);
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
              onOpen={() => setOpenTask(t)}
            />
          ))
        )}
      </div>

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

function CflTaskRow({ task, index, onOpen }) {
  const role = task.role || task.who || 'lo';
  const metaChips = [];
  if (task.assignee) metaChips.push({ k: 'assignee', v: `\u25CB ${task.assignee}` });
  if (task.system) metaChips.push({ k: 'system', v: `\u25A0 ${task.system}` });
  if (task.when) metaChips.push({ k: 'when', v: `\u23F0 ${task.when}` });

  return (
    <div
      className={`wf-task-polished role-${role}`}
      onClick={onOpen}
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
      <div className="wf-task-arrow">{'\u203A'}</div>
    </div>
  );
}
