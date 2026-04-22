import { useMemo, useState } from 'react';
import { USERS, ROLE_LABELS } from '../data/users.js';
import { GOALS, defaultGoalSkeleton } from '../data/goals.js';

const fmt$M = (n) => {
  if (n == null) return '—';
  return n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + (n / 1e3).toFixed(0) + 'K';
};

// Seed defaults for team members without explicit GOALS (mirror legacy seedDefaultGoals)
function buildTeamGoals(team) {
  const merged = { ...GOALS };
  team.forEach((t) => {
    if (!merged[t.name]) merged[t.name] = defaultGoalSkeleton();
  });
  return merged;
}

export default function Performance() {
  const team = useMemo(
    () =>
      USERS.map((u) => ({
        id: u.id,
        name: u.name,
        initials: u.initials,
        role: ROLE_LABELS[u.role] || 'Team Member',
      })),
    []
  );
  const allGoals = useMemo(() => buildTeamGoals(team), [team]);

  const [activeMember, setActiveMember] = useState(team[0]?.name || 'Kyle Duke');
  const [editingName, setEditingName] = useState(null);
  const [goalsState, setGoalsState] = useState(allGoals);

  const goal = goalsState[activeMember];
  const tabs = team.map((t, i) => (
    <button
      key={t.id}
      className={`perf-tab ${t.name === activeMember ? 'active' : ''}`}
      onClick={() => setActiveMember(t.name)}
    >
      {t.name}
    </button>
  ));

  if (!goal) {
    return (
      <div>
        <div className="perf-tabs">{tabs}</div>
        <div className="goal-card">
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
            No goals set for {activeMember}. Click Edit to add goals.
          </div>
        </div>
      </div>
    );
  }

  const bigPct = goal.bigGoal.target
    ? Math.min(100, Math.round((goal.bigGoal.actual / goal.bigGoal.target) * 100))
    : 0;
  const formatVal = (v, unit) => (unit === '$' ? fmt$M(v) : v);

  const teamMember = team.find((t) => t.name === activeMember) || { initials: '??', role: '' };

  return (
    <div>
      <div className="perf-tabs">{tabs}</div>
      <div className="goal-card">
        <div className="goal-member-head">
          <div className="goal-avatar">{teamMember.initials}</div>
          <div style={{ flex: 1 }}>
            <div className="goal-member-name">{activeMember}</div>
            <div className="goal-member-role">{teamMember.role || ''}</div>
          </div>
          <div className="goal-period-badge">{goal.period}</div>
          <button className="goal-edit-btn" onClick={() => setEditingName(activeMember)}>
            Edit Goals
          </button>
        </div>

        <div className="goal-big">
          <div className="goal-big-label">1 · Big Goal</div>
          <div className="goal-big-text">{goal.bigGoal.text}</div>
          <div className="goal-progress-bar">
            <div className="goal-progress-fill" style={{ width: bigPct + '%' }} />
          </div>
          <div className="goal-progress-text">
            <span>
              <strong>{formatVal(goal.bigGoal.actual, goal.bigGoal.unit)}</strong> of{' '}
              {formatVal(goal.bigGoal.target, goal.bigGoal.unit)}
            </span>
            <span>
              <strong>{bigPct}%</strong> to goal
            </span>
          </div>
        </div>

        <div
          style={{
            fontFamily: "'Oswald',sans-serif",
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '.8px',
            color: '#888',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          3 · Priorities
        </div>
        <div className="goal-priorities">
          {goal.priorities.map((p, i) => {
            const pct = p.target ? Math.min(100, Math.round((p.actual / p.target) * 100)) : 0;
            return (
              <div className="goal-priority" key={i}>
                <div className="goal-priority-num">Priority {i + 1}</div>
                <div className="goal-priority-text">{p.text}</div>
                <div className="goal-priority-bar">
                  <div className="goal-priority-fill" style={{ width: pct + '%' }} />
                </div>
                <div className="goal-priority-stats">
                  {p.actual} / {p.target} · {pct}%
                </div>
              </div>
            );
          })}
        </div>

        <div className="goal-activities-head">5 · Weekly Activities (track what drives the goal)</div>
        {goal.activities.map((a, i) => {
          const pct = a.target ? Math.min(100, Math.round((a.actual / a.target) * 100)) : 0;
          const barColor = pct >= 80 ? '#2e7d32' : pct >= 50 ? '#f5c518' : '#c8102e';
          return (
            <div className="goal-activity" key={i}>
              <div>
                <div className="goal-activity-name">{a.name}</div>
                {a.cadence ? <div className="goal-activity-cadence">{a.cadence}</div> : null}
              </div>
              <div>
                <div className="goal-activity-bar">
                  <div className="goal-activity-fill" style={{ width: pct + '%', background: barColor }} />
                </div>
              </div>
              <div className="goal-activity-stats">
                <span className="accent">{a.actual}</span> / {a.target}
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          padding: '12px 16px',
          background: '#fff8e1',
          border: '1px solid #f5e3a1',
          color: '#7a6300',
          borderRadius: 8,
          fontSize: 11,
          lineHeight: 1.5,
        }}
      >
        <strong
          style={{
            fontFamily: "'Oswald',sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '.6px',
          }}
        >
          About 1-3-5 Goal Setting:
        </strong>{' '}
        Pick <strong>1 big goal</strong> (the outcome). Define <strong>3 priorities</strong> (the
        strategies that move you toward it). Track <strong>5 daily/weekly activities</strong> (the
        inputs you fully control). Inputs drive outputs — the activities produce the priorities,
        which produce the goal.
      </div>

      {editingName && (
        <EditGoalsDrawer
          name={editingName}
          goal={goalsState[editingName]}
          onClose={() => setEditingName(null)}
          onSave={(updated) => {
            setGoalsState((prev) => ({ ...prev, [editingName]: updated }));
            setEditingName(null);
          }}
        />
      )}
    </div>
  );
}

function EditGoalsDrawer({ name, goal, onClose, onSave }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(goal)));

  const setBig = (k, v) =>
    setDraft((d) => ({ ...d, bigGoal: { ...d.bigGoal, [k]: v } }));
  const setPrio = (i, k, v) =>
    setDraft((d) => {
      const priorities = d.priorities.map((p, idx) => (idx === i ? { ...p, [k]: v } : p));
      return { ...d, priorities };
    });
  const setAct = (i, k, v) =>
    setDraft((d) => {
      const activities = d.activities.map((a, idx) => (idx === i ? { ...a, [k]: v } : a));
      return { ...d, activities };
    });

  const save = () => {
    const parsed = {
      ...draft,
      bigGoal: {
        ...draft.bigGoal,
        target: parseFloat(draft.bigGoal.target) || 0,
        actual: parseFloat(draft.bigGoal.actual) || 0,
      },
      priorities: draft.priorities.map((p) => ({
        ...p,
        target: parseFloat(p.target) || 0,
        actual: parseFloat(p.actual) || 0,
      })),
      activities: draft.activities.map((a) => ({
        ...a,
        target: parseFloat(a.target) || 0,
        actual: parseFloat(a.actual) || 0,
      })),
    };
    onSave(parsed);
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Edit Goals · {goal.period}</div>
          <div className="drawer-borrower">{name}</div>
        </div>
        <div className="drawer-body">
          <div className="form-grid" style={{ padding: 0 }}>
            <div
              style={{
                gridColumn: '1/-1',
                fontFamily: "'Oswald',sans-serif",
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                color: '#888',
                fontWeight: 700,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 6,
                marginTop: 10,
              }}
            >
              1 · Big Goal
            </div>
            <div className="form-field full">
              <label>Goal statement</label>
              <input value={draft.bigGoal.text} onChange={(e) => setBig('text', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Target (number)</label>
              <input type="number" value={draft.bigGoal.target} onChange={(e) => setBig('target', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Actual so far</label>
              <input type="number" value={draft.bigGoal.actual} onChange={(e) => setBig('actual', e.target.value)} />
            </div>
            <div className="form-field">
              <label>Unit</label>
              <select value={draft.bigGoal.unit} onChange={(e) => setBig('unit', e.target.value)}>
                <option value="$">$ (Dollars)</option>
                <option value="count"># (Count)</option>
              </select>
            </div>

            <div
              style={{
                gridColumn: '1/-1',
                fontFamily: "'Oswald',sans-serif",
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                color: '#888',
                fontWeight: 700,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 6,
                marginTop: 10,
              }}
            >
              3 · Priorities
            </div>
            {draft.priorities.map((p, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className="form-field full">
                  <label>Priority {i + 1}</label>
                  <input value={p.text} onChange={(e) => setPrio(i, 'text', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Actual</label>
                  <input type="number" value={p.actual} onChange={(e) => setPrio(i, 'actual', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Target</label>
                  <input type="number" value={p.target} onChange={(e) => setPrio(i, 'target', e.target.value)} />
                </div>
              </div>
            ))}

            <div
              style={{
                gridColumn: '1/-1',
                fontFamily: "'Oswald',sans-serif",
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                color: '#888',
                fontWeight: 700,
                borderBottom: '1px solid var(--border)',
                paddingBottom: 6,
                marginTop: 10,
              }}
            >
              5 · Activities
            </div>
            {draft.activities.map((a, i) => (
              <div key={i} style={{ display: 'contents' }}>
                <div className="form-field">
                  <label>Activity {i + 1} name</label>
                  <input value={a.name} onChange={(e) => setAct(i, 'name', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Cadence</label>
                  <input value={a.cadence || ''} onChange={(e) => setAct(i, 'cadence', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Actual</label>
                  <input type="number" value={a.actual} onChange={(e) => setAct(i, 'actual', e.target.value)} />
                </div>
                <div className="form-field">
                  <label>Target</label>
                  <input type="number" value={a.target} onChange={(e) => setAct(i, 'target', e.target.value)} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Cancel</button>
          <button className="drawer-btn primary" onClick={save}>Save Goals</button>
        </div>
      </aside>
    </>
  );
}
