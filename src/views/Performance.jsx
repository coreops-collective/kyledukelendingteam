import { useEffect, useMemo, useState } from 'react';
import { USERS, ROLE_LABELS } from '../data/users.js';
import { GOALS, defaultGoalSkeleton } from '../data/goals.js';
import { computeScorecard, WINDOWS } from '../lib/scorecards.js';
import { computeCycleTimes } from '../lib/cycleTime.js';
import Tour from '../components/Tour.jsx';

const fmt$M = (n) => {
  if (n == null) return '—';
  return n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + (n / 1e3).toFixed(0) + 'K';
};
const fmt$ = (n) => (n ? '$' + Math.round(n).toLocaleString() : '—');

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
  const [tourOpen, setTourOpen] = useState(false);
  // Sub-tab: 'goals' (existing 1-3-5 goal card) or 'scorecard' (real
  // production metrics computed from LOANS). Local state, resets per
  // teammate naturally.
  const [subTab, setSubTab] = useState('goals');
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const PERF_TOUR_STEPS = [
    {
      title: 'Performance & Goals',
      body: 'Everyone\'s scoreboard. Two views per teammate: Goals (the 1-3-5 planning card) and Scorecard (real production metrics pulled from the pipeline).\n\nOpen, honest, visible to the whole team so accountability doesn\'t need reminders.',
    },
    {
      target: '.perf-tabs',
      title: 'Pick a teammate',
      body: 'Tabs across the top switch between team members. Every user who\'s been added on the Team Members page shows up here automatically.\n\nUsers without goals set yet show an "Edit" prompt to configure them.',
    },
    {
      target: '[data-tour="perf-subtabs"]',
      title: 'Goals vs Scorecard',
      body: 'Goals is the aspirational side — Big Goal + priorities + weekly activities. Scorecard is the actual side — funded loans, volume, pull-through, pipeline value, breakdown by loan type.\n\nBoth are for the same teammate. Flip between them.',
    },
    {
      target: '.goal-big',
      title: 'The Big Goal',
      body: 'Each person has one Big Goal for the year: target volume, target units, target income. Progress bar shows where they are today vs where they need to be to hit it.\n\nEdit lets you adjust the target mid-year if life happens.',
    },
    {
      target: '.goal-priorities',
      title: 'Priorities',
      body: 'Three priorities under the Big Goal — the specific outcomes they need to hit to make the big goal happen. Each priority has an actual vs target with a progress bar.\n\nExample for an LO: "Close 3 new realtor partnerships this quarter," "Book 2 lunches per week with active agents," etc.',
    },
    {
      target: '.goal-activity',
      title: 'Weekly activities',
      body: 'The activities section tracks the weekly inputs that drive the priorities: calls made, agents met, applications taken.\n\nColor-coded: green ≥ 80% of target, yellow 50-79%, red < 50%. Fastest way to see if the numbers are on pace.',
    },
    {
      target: '.goal-edit-btn',
      title: 'Edit goals',
      body: 'The Edit button in the top-right of the card opens a drawer to update the Big Goal, priorities, and activity targets. Blur-to-save so quick tweaks are one click.\n\nAll data persists per-user so the team can compare notes at quarterly reviews.',
    },
    {
      title: 'Scorecard — real production',
      body: 'Switch to the Scorecard sub-tab for actual pipeline metrics: loans funded, volume, avg loan size, pull-through %, pipeline count and value, and a breakdown by loan type.\n\nTime windows: last 30 days, last 90, YTD, T12M, all-time. Pull-through is funded ÷ active-in-window — a rough conversion signal, not a perfect measurement.',
    },
    {
      title: 'Cycle time by stage',
      body: 'At the bottom of the Scorecard is Cycle Time by Stage — the average days a loan sits in each stage before moving on, per LO. Green ≤ 7 days, orange 8-14, red > 14.\n\nUseful for coaching: if Contract → Locked averages 21 days for one LO but 6 for another, that\'s a process bottleneck. Data starts building from Sprint 1 shipping — historical stage moves aren\'t retroactive.',
    },
  ];

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

  // goal may be undefined for teammates with nothing configured yet.
  // The Scorecard sub-tab needs to render regardless — it only depends
  // on LOANS. Downstream computations that read goal.* are guarded by
  // !showScorecard + goal existence checks in the JSX below.
  const bigPct = goal?.bigGoal?.target
    ? Math.min(100, Math.round((goal.bigGoal.actual / goal.bigGoal.target) * 100))
    : 0;
  const formatVal = (v, unit) => (unit === '$' ? fmt$M(v) : v);

  const teamMember = team.find((t) => t.name === activeMember) || { initials: '??', role: '' };

  const showScorecard = subTab === 'scorecard';

  return (
    <div>
      <div className="perf-tabs">{tabs}</div>

      {/* Sub-tab strip — Goals (existing 1-3-5 card) vs Scorecard (real
          production metrics). Same active teammate. */}
      <div style={{
        display: 'flex', gap: 2, borderBottom: '1px solid #e5e5e5',
        margin: '0 0 18px', flexWrap: 'wrap',
      }} role="tablist" data-tour="perf-subtabs">
        {[
          { key: 'goals', label: 'Goals' },
          { key: 'scorecard', label: 'Scorecard' },
        ].map((t) => {
          const on = t.key === subTab;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setSubTab(t.key)}
              style={{
                padding: '10px 18px', fontSize: 12, fontWeight: 700,
                background: 'transparent', border: 'none',
                borderBottom: `3px solid ${on ? '#c62828' : 'transparent'}`,
                marginBottom: -1, cursor: 'pointer',
                color: on ? '#0A0A0A' : '#666',
                textTransform: 'uppercase', letterSpacing: '.6px',
                fontFamily: "'Oswald',sans-serif",
              }}
            >{t.label}</button>
          );
        })}
      </div>

      {showScorecard && <ScorecardPanel loName={firstNameOf(activeMember)} />}

      {!showScorecard && !goal && (
        <div className="goal-card">
          <div style={{ textAlign: 'center', color: '#888', padding: 40 }}>
            No goals set for {activeMember}. Click Edit to add goals.
          </div>
        </div>
      )}

      {!showScorecard && goal && (
      <>
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
      </>
      )}

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
      {tourOpen && <Tour steps={PERF_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}

// Loans store their loan-officer field as a first-name string ("Kyle",
// "Missy") to match the legacy pipeline convention. Team members show
// as full names ("Kyle Duke"). This maps between them.
function firstNameOf(fullName) {
  return (fullName || '').split(/\s+/)[0] || fullName;
}

// LO scorecard — real production numbers from LOANS. Sits under the
// Scorecard sub-tab, next to the existing 1-3-5 Goals card. Time window
// defaults to Last 12 months; user picks another window from the strip.
function ScorecardPanel({ loName }) {
  const [windowKey, setWindowKey] = useState('t12m');
  const scorecard = useMemo(() => computeScorecard(loName, windowKey), [loName, windowKey]);

  const StatCard = ({ label, value, sub }) => (
    <div style={{
      background: '#fff', border: '1px solid #e5e5e5', borderRadius: 8,
      padding: '14px 16px',
    }}>
      <div style={{
        fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
        color: '#888', letterSpacing: '.7px', textTransform: 'uppercase',
        marginBottom: 6,
      }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>{sub}</div>}
    </div>
  );

  return (
    <div data-tour="scorecard">
      {/* Time-window strip. Compact pill row on top of the metric cards. */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 14, flexWrap: 'wrap',
      }}>
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setWindowKey(w.key)}
            style={{
              padding: '6px 12px', fontSize: 11, fontWeight: 700,
              fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.6px',
              background: windowKey === w.key ? '#0A0A0A' : '#fff',
              color: windowKey === w.key ? '#fff' : '#555',
              border: `1px solid ${windowKey === w.key ? '#0A0A0A' : '#d0d0d0'}`,
              borderRadius: 999, cursor: 'pointer',
            }}
          >{w.label}</button>
        ))}
      </div>

      {/* Primary metric row */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 14,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <StatCard label="Loans Funded" value={scorecard.fundedCount} sub={loName || 'LO'} />
        <StatCard label="Volume Funded" value={fmt$M(scorecard.fundedVolume)} />
        <StatCard label="Avg Loan Size" value={fmt$(scorecard.avgLoanSize)} />
        <StatCard label="Pull-through" value={`${scorecard.pullThroughPct}%`}
          sub="funded / active in window" />
      </div>

      {/* Secondary metric row (pipeline snapshot — always current, not
          window-scoped, because pipeline is a right-now measurement). */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      }}>
        <StatCard label="Loans in Pipeline" value={scorecard.pipelineCount}
          sub="current, all stages" />
        <StatCard label="Pipeline Value" value={fmt$M(scorecard.pipelineValue)} />
      </div>

      {/* Breakdown by loan type (funded within window). */}
      {scorecard.volumeByType.length > 0 && (
        <div className="section-card" style={{ marginBottom: 14 }}>
          <div className="section-header">
            <div className="section-title">Funded by Loan Type</div>
            <div className="section-sub">{WINDOWS.find(w => w.key === windowKey)?.label}</div>
          </div>
          <div style={{ padding: 12 }}>
            {scorecard.volumeByType.map((row) => {
              const pct = scorecard.fundedVolume
                ? Math.round((row.volume / scorecard.fundedVolume) * 100)
                : 0;
              return (
                <div key={row.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700 }}>{row.label}</span>
                    <span style={{ color: '#666' }}>{fmt$M(row.volume)} · {pct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#C8102E', borderRadius: 999 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent funded loans list */}
      {scorecard.recentFunded.length > 0 && (
        <div className="section-card">
          <div className="section-header">
            <div className="section-title">Recent Funded</div>
            <div className="section-sub">last 10 in window</div>
          </div>
          <div style={{ padding: 12 }}>
            {scorecard.recentFunded.map((l) => (
              <div key={l.id} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                gap: 12, alignItems: 'center',
                padding: '8px 4px', borderBottom: '1px solid #f0f0f0', fontSize: 12,
              }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{l.borrower}</div>
                  <div style={{ color: '#888', fontSize: 10 }}>{l.property || '—'}</div>
                </div>
                <div style={{ color: '#666', fontSize: 11 }}>{l.type || '—'}</div>
                <div style={{ fontWeight: 700 }}>{fmt$(l.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {scorecard.fundedCount === 0 && (
        <div style={{
          padding: 40, textAlign: 'center', color: '#888', fontSize: 13,
          background: '#fafafa', border: '1px dashed #ddd', borderRadius: 10,
        }}>
          No funded loans for {loName || 'this LO'} in {WINDOWS.find(w => w.key === windowKey)?.label.toLowerCase()}.
        </div>
      )}

      <CycleTimePanel loName={loName} />
    </div>
  );
}

// Cycle time by stage — average days a loan sits in each stage before
// transitioning to the next one, for this LO. Reads from audit_log
// (Sprint 1 started recording status changes). Historical data before
// Sprint 1 shipped isn't included; that's fine for a moving average.
function CycleTimePanel({ loName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    computeCycleTimes(loName).then((d) => {
      if (!cancelled) { setData(d); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [loName]);

  if (loading) {
    return (
      <div className="section-card" style={{ marginTop: 14 }}>
        <div className="section-header">
          <div className="section-title">Cycle Time by Stage</div>
        </div>
        <div style={{ padding: 20, color: '#888', fontSize: 12, textAlign: 'center' }}>
          Loading…
        </div>
      </div>
    );
  }

  const hasData = data && data.rows && data.rows.length > 0;
  const startedAt = data?.startedRecordingAt
    ? new Date(data.startedRecordingAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className="section-card" style={{ marginTop: 14 }}>
      <div className="section-header">
        <div className="section-title">Cycle Time by Stage</div>
        <div className="section-sub">
          {hasData
            ? `${data.totalLoansCovered} loan${data.totalLoansCovered === 1 ? '' : 's'} tracked${startedAt ? ` · since ${startedAt}` : ''}`
            : 'Building history — needs more status changes'}
        </div>
      </div>
      <div style={{ padding: hasData ? 12 : 20 }}>
        {!hasData ? (
          <div style={{ textAlign: 'center', color: '#888', fontSize: 12 }}>
            No completed stage segments yet. Data starts building when {loName || 'this LO'}'s loans move through at least two stages.
          </div>
        ) : (
          data.rows.map((r) => {
            const days = r.avgDays;
            const barPct = Math.min(100, Math.round((days / 30) * 100));
            const color = days > 14 ? '#c62828' : days > 7 ? '#e65100' : '#2e7d32';
            return (
              <div key={r.stage} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{r.stage}</span>
                  <span style={{ color: '#666' }}>
                    <strong style={{ color }}>{days.toFixed(1)}d avg</strong>
                    {' · '}{r.sampleCount} sample{r.sampleCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 999 }} />
                </div>
              </div>
            );
          })
        )}
      </div>
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
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
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
