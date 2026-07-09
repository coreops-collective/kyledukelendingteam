import { useEffect, useMemo, useState } from 'react';
import {
  getWorkflows, getTasksFor, loadWorkflows,
  ROLES, ROLE_LABELS, WORKFLOW_CATEGORIES,
} from '../lib/workflows.js';
import { loadKeyDateTypes } from '../lib/keyDateTypes.js';
import { WorkflowEditorDrawer, ManageKeyDateTypesDrawer, triggerSummary } from './CFL.jsx';

// SOPs / Workflows tab. Reads from the SAME workflow_templates +
// workflow_tasks tables that power Client for Life — so the SOPs the
// team documents here and the client-outreach tasks CFL generates are
// literally the same rows. Click "Edit workflows" and the shared
// WorkflowEditorDrawer opens exactly as it does inside CFL.
//
// Two visualizations preserved from the legacy view:
//   - Step List: numbered cards down the page, one per task.
//   - Swim Lanes: tasks grouped by role (LO / LOA / Admin / Automated).
export default function Workflows() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeId, setActiveId] = useState(null);
  const [layout, setLayout] = useState('checklist');
  const [editorOpen, setEditorOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  // Category filter chip. Defaults to Loan since that's the biggest
  // bucket. Kimberly toggles between Client for Life / Loan / Lead
  // Nurture / Other to keep the tab strip focused on one purpose.
  const [category, setCategory] = useState('Loan');

  useEffect(() => {
    loadWorkflows().then(bump);
    loadKeyDateTypes().then(bump);
    const events = [
      'kdt-workflows-changed', 'kdt-workflows-loaded',
      'kdt-key-date-types-changed', 'kdt-key-date-types-loaded',
    ];
    const on = () => bump();
    events.forEach((e) => window.addEventListener(e, on));
    return () => events.forEach((e) => window.removeEventListener(e, on));
  }, []);

  const allWorkflows = getWorkflows();
  const workflows = allWorkflows.filter((w) => (w.category || 'Loan') === category);
  const wf = workflows.find((w) => w.id === activeId) || workflows[0] || null;
  const tasks = wf ? getTasksFor(wf.id) : [];
  const totalTasks = tasks.length;

  // Per-category counts drive the little numeric badges on the chip bar
  // so Kimberly can see at a glance which buckets have content.
  const categoryCounts = useMemo(() => {
    const counts = {};
    WORKFLOW_CATEGORIES.forEach((c) => { counts[c] = 0; });
    allWorkflows.forEach((w) => {
      const c = w.category || 'Loan';
      counts[c] = (counts[c] || 0) + 1;
    });
    return counts;
  }, [allWorkflows]);

  const categoryBar = (
    <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
      {WORKFLOW_CATEGORIES.map((c) => {
        const active = c === category;
        return (
          <button
            key={c}
            onClick={() => { setCategory(c); setActiveId(null); }}
            style={{
              padding: '8px 14px', borderRadius: 999,
              border: `1px solid ${active ? '#0A0A0A' : '#d0d0d0'}`,
              background: active ? '#0A0A0A' : '#fff',
              color: active ? '#fff' : '#333',
              fontWeight: 700, fontSize: 12, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {c}
            <span style={{
              padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: active ? 'rgba(255,255,255,.2)' : '#eee',
              color: active ? '#fff' : '#666',
            }}>{categoryCounts[c] || 0}</span>
          </button>
        );
      })}
    </div>
  );

  if (!workflows.length) {
    return (
      <div>
        <div className="wf-header-row" style={{ marginBottom: 20 }}>
          <div>
            <h2>Workflows &amp; SOPs</h2>
            <div className="desc">Client for Life · Loan · Lead Nurture — separated by category.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="form-btn" onClick={() => setDatesOpen(true)}>Manage Key Date Types</button>
            <button className="form-btn primary" onClick={() => setEditorOpen(true)}>+ New Workflow</button>
          </div>
        </div>
        {categoryBar}
        <div style={{ padding: 40, textAlign: 'center', border: '2px dashed #e0e0e0', borderRadius: 8, color: '#888' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 6 }}>No <em>{category}</em> workflows yet</div>
          <div style={{ fontSize: 12 }}>
            Click <strong>+ New Workflow</strong> and pick "{category}" when prompted for the category.
          </div>
        </div>
        {editorOpen && <WorkflowEditorDrawer onClose={() => { setEditorOpen(false); bump(); }} />}
        {datesOpen && <ManageKeyDateTypesDrawer onClose={() => { setDatesOpen(false); bump(); }} />}
      </div>
    );
  }

  return (
    <>
      {categoryBar}
      <div className="wf-tabs">
        {workflows.map((w) => (
          <button
            key={w.id}
            className={`wf-tab ${w.id === (wf && wf.id) ? 'active' : ''}`}
            onClick={() => setActiveId(w.id)}
          >
            {w.name}
            <span style={{ opacity: .5, marginLeft: 6, fontSize: 10 }}>{(getTasksFor(w.id) || []).length}</span>
          </button>
        ))}
      </div>
      <div className="wf-header-row">
        <div>
          <h2>{wf.name}</h2>
          <div className="desc">{wf.description || 'Shared with Client for Life · edits here propagate everywhere'}</div>
        </div>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--brand-red)', lineHeight: 1 }}>{totalTasks}</div>
            <div style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginTop: 4 }}>Tasks</div>
          </div>
          <div style={{ display: 'flex', gap: 6, background: '#f4f4f6', borderRadius: 8, padding: 4 }}>
            <button
              onClick={() => setLayout('checklist')}
              style={layoutBtnStyle(layout === 'checklist')}
            >Step List</button>
            <button
              onClick={() => setLayout('swim')}
              style={layoutBtnStyle(layout === 'swim')}
            >Swim Lanes</button>
          </div>
          <button className="form-btn" onClick={() => setDatesOpen(true)}>Manage Key Date Types</button>
          <button className="form-btn primary" onClick={() => setEditorOpen(true)}>Edit Workflows</button>
        </div>
      </div>
      {layout === 'checklist' ? <StepList tasks={tasks} /> : <SwimLanes tasks={tasks} />}
      {editorOpen && <WorkflowEditorDrawer onClose={() => { setEditorOpen(false); bump(); }} />}
      {datesOpen && <ManageKeyDateTypesDrawer onClose={() => { setDatesOpen(false); bump(); }} />}
    </>
  );
}

const layoutBtnStyle = (active) => ({
  padding: '6px 14px', border: 'none',
  background: active ? '#fff' : 'transparent',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
  borderRadius: 6,
  fontFamily: "'Oswald',sans-serif", fontSize: 10,
  textTransform: 'uppercase', letterSpacing: '.6px', fontWeight: 700,
  color: active ? 'var(--brand-red)' : '#888',
  cursor: 'pointer',
});

const ROLE_COLORS = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
const ROLE_BGS = { lo: '#f8f8fa', loa: '#fffdf0', admin: '#f5fbf5', automated: '#fffafb' };

function StepList({ tasks }) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: 30, textAlign: 'center', border: '2px dashed #e0e0e0', borderRadius: 8, color: '#888' }}>
        <div style={{ fontSize: 12 }}>No tasks in this workflow yet. Click "Edit Workflows" to add.</div>
      </div>
    );
  }
  return (
    <div className="wf-checklist-polished">
      {tasks.map((t, idx) => {
        const role = t.role || 'lo';
        return (
          <div key={t.id} className={`wf-task-polished role-${role}`}>
            <div className="wf-num">{idx + 1}</div>
            <div className="wf-task-body">
              <div className="wf-task-head" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  className={`wf-task-label ${role}`}
                  style={{ padding: '2px 8px', borderRadius: 4, background: ROLE_COLORS[role], color: '#fff', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}
                >
                  {ROLE_LABELS[role] || role}
                </span>
                <span style={{ fontSize: 11, color: '#888' }}>{triggerSummary(t)}</span>
                {t.email_subject && (
                  <span style={{ fontSize: 10, background: '#0d47a1', color: '#fff', padding: '2px 8px', borderRadius: 4, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>
                    📧 Email
                  </span>
                )}
              </div>
              <div className="wf-task-text">{t.title || '(no title)'}</div>
              {t.notes && (
                <div className="wf-task-meta" style={{ marginTop: 4, fontSize: 11, color: '#666', fontStyle: 'italic' }}>{t.notes}</div>
              )}
              {t.email_subject && (
                <div className="wf-task-meta" style={{ marginTop: 4, fontSize: 11, color: '#0d47a1' }}>
                  <strong>Subject:</strong> {t.email_subject}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SwimLanes({ tasks }) {
  const byRole = useMemo(() => {
    const map = { lo: [], loa: [], admin: [], automated: [] };
    tasks.forEach((t, i) => {
      const r = ROLES.includes(t.role) ? t.role : 'lo';
      map[r].push({ ...t, order: i + 1 });
    });
    return map;
  }, [tasks]);
  return (
    <div className="wf-swim-wrap">
      <div className="wf-swim-grid">
        {ROLES.map((r) => (
          <div key={r} className="wf-lane" style={{ background: ROLE_BGS[r], borderTop: `4px solid ${ROLE_COLORS[r]}` }}>
            <div className="wf-lane-head">
              <div className="wf-lane-title">{ROLE_LABELS[r]}</div>
              <div className="wf-lane-count">{byRole[r].length}</div>
            </div>
            <div className="wf-lane-body">
              {byRole[r].length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: '#bbb', fontSize: 11, fontStyle: 'italic' }}>No tasks</div>
              ) : (
                byRole[r].map((t) => (
                  <div key={t.id} className="wf-lane-card">
                    <div className="wf-lane-card-head">
                      <span style={{
                        fontFamily: "'Oswald',sans-serif", fontSize: 10, fontWeight: 700,
                        color: ROLE_COLORS[r], background: '#fff', padding: '2px 7px',
                        borderRadius: 10, border: `1px solid ${ROLE_COLORS[r]}`,
                      }}>#{t.order}</span>
                      {t.email_subject && (
                        <span style={{ fontSize: 9, background: '#0d47a1', color: '#fff', padding: '2px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 700 }}>📧</span>
                      )}
                    </div>
                    <div className="wf-lane-card-text">{t.title || '(no title)'}</div>
                    <div className="wf-lane-meta" style={{ fontSize: 10, color: '#888', marginTop: 6 }}>
                      {triggerSummary(t)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
