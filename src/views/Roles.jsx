import { useEffect, useMemo, useState } from 'react';
import {
  loadJobRoles, getJobRoles, createJobRole, updateJobRole, deleteJobRole,
} from '../lib/jobRoles.js';
import { loadWorkflows, getWorkflows, getTasksFor } from '../lib/workflows.js';
import { getCurrentUser } from '../lib/auth.js';
import { showError } from '../lib/toaster.js';
import Tour from '../components/Tour.jsx';
import RichTextEditor from '../components/RichTextEditor.jsx';
import { toEditorHtml } from '../lib/markdown.js';

// One-line hint for each section so the empty state doesn't feel blank.
const SECTION_META = {
  job_description: { title: 'Job Description', hint: 'A short professional summary of what this role owns and why it matters.' },
  training_30:     { title: '30-Day Plan',    hint: 'What the new hire is expected to shadow, learn, and complete in their first month.' },
  training_60:     { title: '60-Day Plan',    hint: 'What they own with more autonomy in month two.' },
  training_90:     { title: '90-Day Plan',    hint: 'Full ownership. What "off ramp" looks like by day 90.' },
  accountability:  { title: 'Accountability', hint: 'The measurable outcomes a manager reviews with this role each quarter.' },
};
const SECTION_ORDER = ['job_description', 'training_30', 'training_60', 'training_90', 'accountability'];

// Aggregate every workflow_task assigned to this role's key, grouped by
// workflow. This is where the "auto-populated responsibilities" feature
// actually happens — no duplicate storage, always live.
//
// Grouping (rather than one flat alphabetized list) makes each workflow
// read like a section of the JD — "In the New Purchase workflow you own
// X, Y, Z" — which mirrors how the team actually thinks about the work.
// Dedup is per-workflow (same title twice in one workflow collapses)
// but NOT across workflows, since the same responsibility may
// legitimately show up in multiple workflows.
//
// Returns:
//   groups: [{ workflow_id, workflow_name, category, tasks: [{title}] }]
//   count:  total task count across groups (used by the panel header)
//   flat:   flat list of unique titles (used by the AI Suggest payload)
function responsibilitiesFor(roleKey) {
  const groups = [];
  const flat = [];
  const seenFlat = new Set();
  let count = 0;
  for (const wf of getWorkflows()) {
    const tasks = getTasksFor(wf.id);
    const group = { workflow_id: wf.id, workflow_name: wf.name, category: wf.category, tasks: [] };
    const seenInGroup = new Set();
    for (const t of tasks) {
      if ((t.role || '') !== roleKey) continue;
      const title = (t.title || '').trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seenInGroup.has(key)) continue;
      seenInGroup.add(key);
      group.tasks.push({ title });
      count += 1;
      if (!seenFlat.has(key)) { seenFlat.add(key); flat.push(title); }
    }
    if (group.tasks.length) groups.push(group);
  }
  return { groups, count, flat };
}

export default function Roles() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeKey, setActiveKey] = useState(null);
  const [showAddRole, setShowAddRole] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => {
    Promise.all([loadJobRoles(), loadWorkflows()]).finally(bump);
    const events = [
      'kdt-job-roles-changed', 'kdt-job-roles-loaded',
      'kdt-workflows-changed', 'kdt-workflows-loaded',
    ];
    const on = () => bump();
    events.forEach((e) => window.addEventListener(e, on));
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => {
      events.forEach((e) => window.removeEventListener(e, on));
      window.removeEventListener('kdt-start-tour', startTour);
    };
  }, []);

  const ROLES_TOUR_STEPS = [
    {
      title: 'Roles & Responsibilities',
      body: 'This is the single source of truth for what every role on the team owns — LO, LOA, Admin, Automated, plus any custom role you add.\n\nThink of it as a living employee handbook: the job description writes itself from real workflow tasks, and every role gets a proper 30/60/90 plus accountability metrics.',
    },
    {
      target: '[data-tour="role-list"]',
      title: 'Left rail: role picker',
      body: 'Click any role to open its page. The four built-in roles come pre-seeded and can\'t be deleted (workflow tasks reference them). Custom roles you add can be deleted.\n\n"+ Add role" at the bottom creates a new role — it appears immediately in the workflow task Owner picker so you can assign tasks to it.',
    },
    {
      target: '[data-tour="reports-to"]',
      title: 'Reports To',
      body: 'Under the role name, pick who this role reports to. Choose another role or leave it as "Nobody / Top of chain" for the Branch Manager.\n\nThe AI Suggest uses this — if the LO reports to the Branch Manager, the JD says so. It also lands on the PDF header.',
    },
    {
      target: '[data-tour="responsibilities"]',
      title: 'Tab 1: Responsibilities',
      body: 'The first tab lists every workflow task assigned to this role, grouped by workflow. No duplicate entry — assign a task to LO on the Workflows page and it shows up here on the next render.\n\nWithin each workflow the task is deduped, but the same responsibility can appear under multiple workflows if it truly recurs.',
    },
    {
      title: 'Tabs: Job Description · 30-60-90 · Accountability',
      body: 'Three more tabs contain the writable JD sections:\n\n• Job Description — the professional prose summary\n• 30-60-90 — combined month 1/2/3 onboarding plan\n• Accountability — measurable outcomes reviewed quarterly\n\nEach section has an ✨ AI Suggest button that drafts content in the Kyle Duke team voice.\n\nEditor is full rich text — bold, italic, underline, bulleted lists, numbered lists, hyperlinks. Format text however you like, then blur to save. Everything you write here also flows into the Export PDF layout so the printed version keeps your formatting.',
    },
    {
      title: 'Tab 5: Training (printable handbook)',
      body: 'The last tab is the onboarding killer. Sub-tabs across the top let you pick one workflow at a time.\n\nInside a workflow, tasks read like a handbook page: serif titles, monospace role chip ("LO" / "LOA" / "Admin"), short task-type label ("Email · Status"), and the trigger in plain English ("3 days before Closing"). No emojis, no icons — just the information.\n\nDecision points render as a dark card with the question in white serif. Below the decision, branch tabs let you pick one answer at a time and see only that branch\'s follow-up tasks. On screen you get a clean read; when you Print, every branch renders in sequence with an "If \'X\'" header before each block, so the printed page carries the whole tree.\n\nOwn-role tasks get a red left rule + soft cream background. Hand-offs to other roles are the same shape, muted.',
    },
    {
      target: '[data-tour="export-pdf"]',
      title: 'Export PDF',
      body: 'Export PDF opens a print-ready window with the brand crest, the role name, "Reports to" line, all sections, and the responsibilities grouped by workflow.\n\nBrowser print dialog → Save as PDF. Send it to a new hire, a candidate, or an accountability partner.',
    },
  ];

  const roles = getJobRoles();
  const active = roles.find((r) => r.key === activeKey) || roles[0] || null;

  // Auto-pick the first role once data lands.
  useEffect(() => { if (!activeKey && roles.length) setActiveKey(roles[0].key); }, [roles.length, activeKey]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'flex-start' }}>
      <RoleList roles={roles} activeKey={active?.key} onPick={setActiveKey} onAdd={() => setShowAddRole(true)} />
      {active
        ? <RoleEditor role={active} allRoles={roles} onChange={bump} />
        : <div style={{ padding: 24, color: '#888' }}>No roles yet — click Add role to create your first.</div>}
      {showAddRole && (
        <AddRoleDrawer
          onClose={() => setShowAddRole(false)}
          onCreated={(created) => {
            setShowAddRole(false);
            if (created) setActiveKey(created.key);
          }}
        />
      )}
      {tourOpen && <Tour steps={ROLES_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}

function RoleList({ roles, activeKey, onPick, onAdd }) {
  return (
    <div data-tour="role-list" style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 10 }}>
      <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#666', padding: '6px 8px 10px' }}>
        Roles
      </div>
      {roles.map((r) => {
        const isActive = r.key === activeKey;
        return (
          <div
            key={r.key}
            onClick={() => onPick(r.key)}
            style={{
              padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
              background: isActive ? '#0A0A0A' : 'transparent',
              color: isActive ? '#fff' : '#222',
              marginBottom: 4,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 13 }}>{r.label}</div>
            {r.summary && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{r.summary}</div>}
          </div>
        );
      })}
      <button
        onClick={onAdd}
        style={{
          width: '100%', marginTop: 8, padding: '8px 10px', border: '1px dashed #c62828',
          background: '#fff', color: '#c62828', fontWeight: 700, fontSize: 12,
          borderRadius: 6, cursor: 'pointer',
        }}
      >+ Add role</button>
    </div>
  );
}

function RoleEditor({ role, allRoles, onChange }) {
  // Local editing state so the user can type without every keystroke
  // pinging Supabase. Debounced save writes back on quiet.
  const [draft, setDraft] = useState({
    label: role.label,
    summary: role.summary || '',
    job_description: role.job_description || '',
    training_30: role.training_30 || '',
    training_60: role.training_60 || '',
    training_90: role.training_90 || '',
    accountability: role.accountability || '',
    reports_to_role_id: role.reports_to_role_id || '',
  });
  const [suggesting, setSuggesting] = useState({});
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  // Reset draft when the picked role changes.
  useEffect(() => {
    setDraft({
      label: role.label,
      summary: role.summary || '',
      job_description: role.job_description || '',
      training_30: role.training_30 || '',
      training_60: role.training_60 || '',
      training_90: role.training_90 || '',
      accountability: role.accountability || '',
      reports_to_role_id: role.reports_to_role_id || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  // Reports-to display + AI-context resolution. Excludes the current
  // role from the picker so no one can accidentally set a role to
  // report to itself.
  const reportsToOptions = (allRoles || []).filter((r) => r.id !== role.id);
  const reportsToRole = reportsToOptions.find((r) => r.id === draft.reports_to_role_id);
  const reportsToLabel = reportsToRole ? reportsToRole.label : '';

  const responsibilities = useMemo(() => responsibilitiesFor(role.key), [role.key]);
  // Available for both display (grouped) and AI Suggest (flat list of titles).

  const saveField = (field, value) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  // Blur-to-save so typing is snappy but the change lands within a
  // couple hundred ms of moving on.
  const commitField = (field) => {
    if (draft[field] === (role[field] || '')) return;
    updateJobRole(role.id, { [field]: draft[field] });
    onChange?.();
  };

  const suggest = async (section) => {
    setSuggesting((s) => ({ ...s, [section]: true }));
    try {
      const caller = getCurrentUser()?.email || '';
      const res = await fetch('/.netlify/functions/rewrite-job-description', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(caller ? { 'x-kdt-user-email': caller } : {}),
        },
        body: JSON.stringify({
          callerEmail: caller,
          role_label: role.label,
          section,
          responsibilities: responsibilities.flat,
          existing_content: draft[section] || '',
          reports_to: reportsToLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        showError(`AI Suggest failed: ${data.error || res.status}`);
        return;
      }
      // Convert the AI's markdown output to HTML so the rich text editor
      // renders it with real bold/italic/list formatting the user can
      // edit visually. Storage is always HTML going forward; legacy
      // plain-text saves still display fine because toEditorHtml passes
      // through anything that already looks like HTML.
      const html = toEditorHtml(data.text || '');
      saveField(section, html);
      updateJobRole(role.id, { [section]: html });
      onChange?.();
    } catch (e) {
      showError(`AI Suggest failed: ${e.message}`);
    } finally {
      setSuggesting((s) => ({ ...s, [section]: false }));
    }
  };

  const exportPdf = () => {
    // Render the role into a hidden print container, trigger the browser
    // print dialog, and let the user "Save as PDF". Native, no dep.
    printRole({ role, draft, responsibilities, reportsToLabel });
  };

  // Saves the Reports To selection immediately — a dropdown change is a
  // committed action, not something the user backspaces mid-edit.
  const saveReportsTo = (nextValue) => {
    saveField('reports_to_role_id', nextValue);
    // updateJobRole treats null/undefined as "clear" — the AI prompt then
    // gets "(not specified)" as the reports_to line.
    updateJobRole(role.id, { reports_to_role_id: nextValue || null });
    onChange?.();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <input
            type="text"
            value={draft.label}
            onChange={(e) => saveField('label', e.target.value)}
            onBlur={() => commitField('label')}
            style={{ width: '100%', fontFamily: "'Oswald',sans-serif", fontSize: 26, fontWeight: 700, border: 'none', background: 'transparent', padding: '4px 0' }}
            aria-label="Role name"
          />
          <input
            type="text"
            value={draft.summary}
            onChange={(e) => saveField('summary', e.target.value)}
            onBlur={() => commitField('summary')}
            placeholder="Short summary (shown under the role name)"
            style={{ width: '100%', fontSize: 13, border: 'none', background: 'transparent', color: '#666', padding: '4px 0' }}
            aria-label="Role summary"
          />
          <div data-tour="reports-to" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px' }}>
              Reports to
            </label>
            <select
              value={draft.reports_to_role_id}
              onChange={(e) => saveReportsTo(e.target.value)}
              style={{ padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc' }}
              aria-label="Reports to"
            >
              <option value="">— Nobody / Top of chain</option>
              {reportsToOptions.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-tour="export-pdf"
            onClick={exportPdf}
            style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: '1px solid #0A0A0A', background: '#0A0A0A', color: '#fff', borderRadius: 6, cursor: 'pointer' }}
          >Export PDF</button>
          {!role.built_in && (
            <button
              onClick={() => setShowConfirmDelete(true)}
              style={{ padding: '8px 14px', fontSize: 12, fontWeight: 700, border: '1px solid #c62828', background: '#fff', color: '#c62828', borderRadius: 6, cursor: 'pointer' }}
            >Delete role</button>
          )}
        </div>
      </div>

      <RoleTabs
        role={role}
        draft={draft}
        responsibilities={responsibilities}
        onChangeField={saveField}
        onCommitField={commitField}
        onSuggest={suggest}
        suggesting={suggesting}
      />

      {showConfirmDelete && (
        <ConfirmDeleteModal
          roleLabel={role.label}
          onCancel={() => setShowConfirmDelete(false)}
          onConfirm={async () => {
            await deleteJobRole(role.id);
            setShowConfirmDelete(false);
            onChange?.();
          }}
        />
      )}
    </div>
  );
}

function ResponsibilitiesPanel({ role, responsibilities }) {
  const { groups, count } = responsibilities;
  return (
    <div data-tour="responsibilities" style={{ marginBottom: 18, padding: 16, background: '#fafafa', border: '1px solid #eee', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Responsibilities · from workflow tasks
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>{count} across {groups.length} workflow{groups.length === 1 ? '' : 's'} · live</span>
      </div>
      {groups.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>
          No workflow tasks are assigned to <strong>{role.label}</strong> yet. Assign a task to this role
          on the Workflows page and it will appear here automatically.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.workflow_id} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#0A0A0A' }}>{g.workflow_name}</div>
              {g.category && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#666', background: '#eee', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px' }}>
                  {g.category}
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#999' }}>{g.tasks.length} task{g.tasks.length === 1 ? '' : 's'}</span>
            </div>
            <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#222' }}>
              {g.tasks.map((t, i) => (
                <li key={i} style={{ marginBottom: 3 }}>{t.title}</li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

// Tabs layout for the role editor. Splits Responsibilities · Job
// Description · 30-60-90 · Accountability · Training into clean views
// so a role page doesn't scroll forever. State (active tab) is local
// because it resets naturally when the user picks a different role.
const ROLE_TABS = [
  { key: 'responsibilities', label: 'Responsibilities' },
  { key: 'job_description',  label: 'Job Description' },
  { key: 'training_306090',  label: '30-60-90' },
  { key: 'accountability',   label: 'Accountability' },
  { key: 'training',         label: 'Training' },
];

function RoleTabs({ role, draft, responsibilities, onChangeField, onCommitField, onSuggest, suggesting }) {
  const [active, setActive] = useState('responsibilities');
  return (
    <div>
      <div style={{
        display: 'flex', gap: 2, borderBottom: '2px solid #e5e5e5',
        marginBottom: 16, flexWrap: 'wrap',
      }} role="tablist">
        {ROLE_TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              style={{
                padding: '10px 18px', fontSize: 12, fontWeight: 700,
                background: 'transparent', border: 'none',
                borderBottom: `3px solid ${on ? '#c62828' : 'transparent'}`,
                marginBottom: -2, cursor: 'pointer',
                color: on ? '#0A0A0A' : '#666',
                textTransform: 'uppercase', letterSpacing: '.6px',
                fontFamily: "'Oswald',sans-serif",
              }}
            >{t.label}</button>
          );
        })}
      </div>
      {active === 'responsibilities' && (
        <ResponsibilitiesPanel role={role} responsibilities={responsibilities} />
      )}
      {active === 'job_description' && (
        <SectionEditor
          section="job_description"
          value={draft.job_description}
          onChange={(v) => onChangeField('job_description', v)}
          onCommit={() => onCommitField('job_description')}
          onSuggest={() => onSuggest('job_description')}
          suggesting={!!suggesting.job_description}
        />
      )}
      {active === 'training_306090' && (
        <div>
          {['training_30', 'training_60', 'training_90'].map((s) => (
            <SectionEditor
              key={s}
              section={s}
              value={draft[s]}
              onChange={(v) => onChangeField(s, v)}
              onCommit={() => onCommitField(s)}
              onSuggest={() => onSuggest(s)}
              suggesting={!!suggesting[s]}
            />
          ))}
        </div>
      )}
      {active === 'accountability' && (
        <SectionEditor
          section="accountability"
          value={draft.accountability}
          onChange={(v) => onChangeField('accountability', v)}
          onCommit={() => onCommitField('accountability')}
          onSuggest={() => onSuggest('accountability')}
          suggesting={!!suggesting.accountability}
        />
      )}
      {active === 'training' && (
        <TrainingPanel role={role} />
      )}
    </div>
  );
}

// Visual training outline for a role. Sub-tabs across the top pick one
// workflow at a time so each flowchart gets the full page width — no
// competing for space or scrolling past unrelated content.
//
// Below the sub-tab strip, the picked workflow renders as a true
// vertical flowchart: task cards centered on the page, arrows between
// them, and decision points that fan out into labeled columns for each
// answer. Print-friendly by design (see .training-flowchart print
// styles inline below).
function TrainingPanel({ role }) {
  const trainingWorkflows = useMemo(() => {
    const out = [];
    for (const wf of getWorkflows()) {
      const tasks = getTasksFor(wf.id);
      if (!tasks.some((t) => (t.role || '') === role.key)) continue;
      out.push({ workflow: wf, tasks });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.key]);

  const [activeWfId, setActiveWfId] = useState(null);
  // Auto-pick the first workflow whenever the list changes.
  useEffect(() => {
    if (trainingWorkflows.length === 0) return;
    if (!activeWfId || !trainingWorkflows.some((tw) => tw.workflow.id === activeWfId)) {
      setActiveWfId(trainingWorkflows[0].workflow.id);
    }
  }, [trainingWorkflows, activeWfId]);

  if (trainingWorkflows.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#888', background: '#fafafa', border: '1px dashed #ddd', borderRadius: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: '#333' }}>
          No workflows assigned to {role.label} yet
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>
          When a workflow task is assigned to this role on the Workflows page, the training outline for that workflow will appear here.
        </div>
      </div>
    );
  }

  const active = trainingWorkflows.find((tw) => tw.workflow.id === activeWfId) || trainingWorkflows[0];

  return (
    <div>
      <div style={{
        marginBottom: 14, padding: '14px 18px',
        background: 'linear-gradient(135deg,var(--brand-black) 0%,#1f1f1f 100%)',
        color: '#fff',
        borderRadius: 10,
        borderLeft: '4px solid var(--brand-red)',
      }} className="training-header">
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#fff', marginBottom: 4 }}>
          Training Outline · {role.label}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>
          Pick a workflow to see it as a top-to-bottom flowchart. Print any workflow directly from your browser — the layout is designed for it. Your tasks are highlighted; hand-offs to other roles are muted so you can see the full picture.
        </div>
      </div>

      {/* Sub-tab strip: one pill per workflow, active gets the red underline. */}
      <div style={{
        display: 'flex', gap: 2, borderBottom: '1px solid #e5e5e5',
        marginBottom: 20, flexWrap: 'wrap',
      }} role="tablist" className="training-subtabs">
        {trainingWorkflows.map((tw) => {
          const on = tw.workflow.id === active.workflow.id;
          const myCount = tw.tasks.filter((t) => (t.role || '') === role.key).length;
          return (
            <button
              key={tw.workflow.id}
              role="tab"
              aria-selected={on}
              onClick={() => setActiveWfId(tw.workflow.id)}
              style={{
                padding: '8px 14px', fontSize: 11, fontWeight: 700,
                background: on ? '#fff' : 'transparent',
                border: 'none',
                borderBottom: `3px solid ${on ? '#c62828' : 'transparent'}`,
                marginBottom: -1, cursor: 'pointer',
                color: on ? '#0A0A0A' : '#666',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              <span>{tw.workflow.name}</span>
              <span style={{
                fontSize: 9, background: on ? '#c62828' : '#e5e5e5',
                color: on ? '#fff' : '#666',
                padding: '2px 6px', borderRadius: 999, fontWeight: 700,
              }}>{myCount}</span>
            </button>
          );
        })}
      </div>

      <TrainingFlowchart workflow={active.workflow} tasks={active.tasks} roleKey={role.key} />
    </div>
  );
}

// Vertical top-to-bottom flowchart of a single workflow. Every task
// becomes a card centered on the page with an arrow-connector below
// linking to the next card. Decision points spread their answers out
// into labeled columns, each column running its own vertical chain.
// One workflow rendered as a printable training document. Task cards
// stack vertically; when a decision point is hit, the tasks after it
// route through tabbed branches (Option B — the user picked this over
// the fan-out layout because it reads cleanly at any width and doesn't
// overflow on 4+ answer decisions).
//
// Deliberate styling choices to move away from the "AI generated" feel:
// - Task titles set in a system serif (Georgia) — feels like a document,
//   not an app.
// - Task-type labels are short SF-Mono uppercase strings ("EMAIL · STATUS")
//   in place of emojis.
// - Role indicator is a monospace chip ("LO", "LOA") — no colored badge.
// - Own-role tasks get a red left rule + soft cream background, not
//   a yellow-tinted card.
// - 1px borders, no drop shadows. The composition carries the hierarchy.
// - Warm-neutral surface (#FAF7F0) that makes the training pages feel
//   like handbook pages, not chrome — scoped to this component so the
//   rest of the app stays cold.
function TrainingFlowchart({ workflow, tasks, roleKey }) {
  const topLevel = tasks.filter((t) => !t.depends_on_task_id);
  const byParent = new Map();
  for (const t of tasks) {
    if (t.depends_on_task_id) {
      if (!byParent.has(t.depends_on_task_id)) byParent.set(t.depends_on_task_id, []);
      byParent.get(t.depends_on_task_id).push(t);
    }
  }

  const printWorkflow = () => window.print();

  return (
    <div className="training-flowchart">
      <div className="tf-header">
        <div className="tf-title">{workflow.name}</div>
        {workflow.category && <div className="tf-meta">{workflow.category} · {tasks.length} tasks</div>}
        <button className="tf-print" onClick={printWorkflow}>Print</button>
      </div>

      <div className="tf-body">
        {topLevel.length === 0 ? (
          <div className="tf-empty">No top-level tasks in this workflow.</div>
        ) : (
          <TrainingChain tasks={topLevel} byParent={byParent} roleKey={roleKey} />
        )}
      </div>

      <style>{`
        .training-flowchart {
          background: #fff;
          border: 1px solid #e5e5e5;
          border-radius: 10px;
          overflow: hidden;
          --tf-ink: #0A0A0A;
          --tf-text-2: #555;
          --tf-text-3: #888;
          --tf-border: #e5e5e5;
          --tf-divider: #f0f0f0;
          --tf-card: #fff;
          --tf-hi-bg: rgba(200,16,46,.05);
          --tf-hi-border: #C8102E;
          --tf-meta-bg: #fafafa;
          --tf-accent: #C8102E;
        }
        .training-flowchart .tf-header {
          display: flex; align-items: baseline; gap: 12px;
          padding: 14px 20px 12px;
          border-bottom: 1px solid var(--tf-divider);
          background: var(--tf-card);
        }
        .training-flowchart .tf-title {
          font-family: 'Oswald', sans-serif;
          font-size: 15px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .6px;
          color: var(--tf-ink);
          flex-shrink: 0;
        }
        .training-flowchart .tf-meta {
          font: 700 11px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .6px;
          color: var(--tf-text-3);
        }
        .training-flowchart .tf-print {
          margin-left: auto;
          font: 700 11px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .6px;
          color: var(--tf-accent);
          background: transparent;
          border: 1px solid var(--tf-accent);
          padding: 6px 12px;
          border-radius: 6px;
          cursor: pointer;
        }
        .training-flowchart .tf-print:hover { background: var(--tf-accent); color: #fff; }
        .training-flowchart .tf-body {
          padding: 28px 24px;
          display: flex; flex-direction: column; align-items: stretch;
        }
        .training-flowchart .tf-empty {
          padding: 32px; color: var(--tf-text-3); font-size: 12px; text-align: center;
        }

        /* Vertical chain container — centered column with a max width so
           long chains stay readable at wide screen sizes. */
        .training-flowchart .tf-chain {
          display: flex; flex-direction: column; gap: 0;
          max-width: 640px;
          margin: 0 auto;
          width: 100%;
        }

        /* Task card — rounded rectangle, clearly RECTANGULAR so the eye
           reads it as "step" vs the pentagon-shaped decision point. */
        .training-flowchart .tf-task {
          background: var(--tf-card);
          border: 1px solid var(--tf-border);
          border-left: 3px solid var(--tf-border);
          border-radius: 8px;
          padding: 14px 16px 12px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 14px;
          align-items: baseline;
        }
        .training-flowchart .tf-task[data-mine="true"] {
          border-left: 3px solid var(--tf-hi-border);
          background: var(--tf-hi-bg);
        }
        .training-flowchart .tf-task .tf-role {
          font: 700 10px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .8px;
          color: var(--tf-text-3);
          padding: 5px 8px;
          border: 1px solid var(--tf-border);
          border-radius: 4px;
          background: var(--tf-card);
          min-width: 40px; text-align: center;
        }
        .training-flowchart .tf-task[data-mine="true"] .tf-role {
          border-color: var(--tf-hi-border);
          color: var(--tf-hi-border);
          background: #fff;
        }
        .training-flowchart .tf-task .tf-title {
          font-size: 14px; font-weight: 600;
          line-height: 1.4;
          color: var(--tf-ink);
        }
        .training-flowchart .tf-task[data-handoff="true"] .tf-title {
          color: var(--tf-text-2);
        }
        .training-flowchart .tf-task .tf-kind {
          font: 700 10px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .6px;
          color: var(--tf-text-3);
        }
        .training-flowchart .tf-task .tf-meta {
          grid-column: 2 / -1;
          color: var(--tf-text-2);
          font-size: 12px;
          line-height: 1.5;
          margin-top: 4px;
        }
        .training-flowchart .tf-task .tf-code {
          font: 12px ui-monospace, 'SF Mono', Menlo, monospace;
          color: var(--tf-ink);
          background: var(--tf-meta-bg);
          padding: 1px 6px;
          border-radius: 4px;
          border: 1px solid var(--tf-border);
        }
        .training-flowchart .tf-task .tf-notes {
          grid-column: 2 / -1;
          font-size: 12px;
          color: var(--tf-text-2);
          line-height: 1.5;
          margin-top: 8px;
          padding: 8px 12px;
          background: var(--tf-meta-bg);
          border-left: 2px solid var(--tf-border);
          border-radius: 4px;
        }

        /* Vertical connector between task cards */
        .training-flowchart .tf-link {
          height: 18px;
          border-left: 2px solid var(--tf-border);
          margin-left: 26px;
          width: 0;
        }

        /* Decision point — downward-pointing pentagon so the shape ALONE
           tells you "this is a fork; a choice happens here". Clip-path
           gives clean sharp edges in all modern browsers. Padding is
           padded aggressively so the pointed bottom doesn't clip text. */
        .training-flowchart .tf-decision {
          position: relative;
          background: linear-gradient(135deg, #0A0A0A 0%, #1f1f1f 100%);
          color: #fff;
          padding: 26px 30px 44px;
          text-align: center;
          clip-path: polygon(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%);
          margin: 4px auto 8px;
          max-width: 560px;
          width: 100%;
        }
        .training-flowchart .tf-decision::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 4px;
          background: var(--tf-accent);
        }
        .training-flowchart .tf-decision-eyebrow {
          font: 700 10px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .8px;
          color: var(--tf-accent);
          margin-bottom: 10px;
        }
        .training-flowchart .tf-decision-q {
          font-size: 16px; font-weight: 700;
          line-height: 1.35;
          color: #fff;
          margin-bottom: 4px;
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
        }
        .training-flowchart .tf-decision-notes {
          font-size: 12px;
          color: rgba(255,255,255,.75);
          line-height: 1.5;
          margin-top: 10px;
          max-width: 440px;
          margin-left: auto;
          margin-right: auto;
        }

        /* Branch tabs (Option B) — mirror the app's tab pattern: red
           underline on the active tab, Oswald caps, count pill on the
           right. Reads instantly as "same tab family as the rest of the
           app". */
        .training-flowchart .tf-tabs-wrap {
          margin: 20px 0 0;
          padding-top: 20px;
          border-top: 1px solid var(--tf-border);
          max-width: 640px;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
        }
        .training-flowchart .tf-tabs {
          display: flex; gap: 2px;
          border-bottom: 1px solid var(--tf-border);
          margin-bottom: 20px;
          overflow-x: auto;
          flex-wrap: wrap;
        }
        .training-flowchart .tf-tab {
          padding: 10px 16px;
          background: transparent;
          border: none;
          border-bottom: 3px solid transparent;
          margin-bottom: -1px;
          color: #666;
          font: 700 11px/1 'Oswald', sans-serif;
          text-transform: uppercase; letter-spacing: .6px;
          cursor: pointer;
          white-space: nowrap;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .training-flowchart .tf-tab[aria-selected="true"] {
          color: var(--tf-ink);
          border-bottom-color: var(--tf-accent);
        }
        .training-flowchart .tf-tab-count {
          display: inline-block;
          font: 700 9px/1 'Oswald', sans-serif;
          color: #666;
          background: #e5e5e5;
          padding: 3px 7px;
          border-radius: 999px;
        }
        .training-flowchart .tf-tab[aria-selected="true"] .tf-tab-count {
          color: #fff;
          background: var(--tf-accent);
        }
        .training-flowchart .tf-branch-empty {
          padding: 24px;
          text-align: center;
          color: var(--tf-text-3);
          font-size: 12px;
          border: 1px dashed var(--tf-border);
          border-radius: 8px;
        }

        @media print {
          .training-flowchart { border: none; }
          .training-flowchart .tf-print,
          .training-subtabs, .training-header { display: none; }
          /* Print every branch after the tabs, one after the other, so
             the printed page shows the whole decision tree even though
             only one tab is visible on screen. */
          .training-flowchart .tf-tabs { display: none; }
          .training-flowchart [data-print-branch] {
            display: block !important;
            break-inside: avoid;
            page-break-inside: avoid;
            margin-top: 20px;
          }
          .training-flowchart [data-print-branch]::before {
            content: "If \\201C" attr(data-branch-name) "\\201D";
            display: block;
            font-family: 'Oswald', sans-serif;
            font-weight: 700; font-size: 13px;
            text-transform: uppercase; letter-spacing: .6px;
            color: #0A0A0A;
            margin-bottom: 10px;
            padding-bottom: 6px;
            border-bottom: 2px solid #C8102E;
          }
          .training-flowchart .tf-task,
          .training-flowchart .tf-decision {
            break-inside: avoid; page-break-inside: avoid;
          }
          /* Clip-path can look odd when printed — revert to a plain dark
             card with a red accent bar so the shape still reads as
             "decision" without relying on clip-path support. */
          .training-flowchart .tf-decision {
            clip-path: none;
            border-radius: 8px;
            border-left: 4px solid #C8102E;
            padding: 20px 24px;
          }
        }
      `}</style>
    </div>
  );
}

// Linear task chain. Renders each task with a connector between; when a
// decision point is reached, chain output stops and its branches (tabs)
// render below. Branch continuations recurse into their own chains.
function TrainingChain({ tasks, byParent, roleKey }) {
  const parts = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const isDecision = Array.isArray(t.decision_options) && t.decision_options.length > 0;
    parts.push(<TrainingCard key={t.id} task={t} roleKey={roleKey} />);
    if (isDecision) {
      parts.push(
        <TrainingBranches
          key={`b-${t.id}`}
          decision={t}
          byParent={byParent}
          roleKey={roleKey}
        />
      );
      break; // downstream tasks live inside branches
    }
    // Linear connector to next task (unless the next iteration will draw
    // its own via a linear child follow).
    if (i < tasks.length - 1) parts.push(<div key={`c-${t.id}`} className="tf-link" />);
    // Linear children (rare: chain follow via depends_on_task_id without
    // decision outcome).
    const kids = byParent.get(t.id) || [];
    const linearKids = kids.filter((k) => !k.depends_on_outcome);
    if (linearKids.length && !isDecision) {
      parts.push(<div key={`c2-${t.id}`} className="tf-link" />);
      parts.push(<TrainingChain key={`kids-${t.id}`} tasks={linearKids} byParent={byParent} roleKey={roleKey} />);
    }
  }
  return <div className="tf-chain">{parts}</div>;
}

// Branch tabs (Option B). Decision follow-up tasks are grouped by
// answer and shown one branch at a time. On print, every branch renders
// (see @media print rules above) with a serif "If 'X'" header before
// each block so the physical page carries the whole tree.
function TrainingBranches({ decision, byParent, roleKey }) {
  const opts = decision.decision_options || [];
  const kids = byParent.get(decision.id) || [];
  const byOpt = new Map();
  for (const opt of opts) {
    byOpt.set(opt, kids
      .filter((k) => k.depends_on_outcome === opt)
      .sort((a, b) => (a.position || 0) - (b.position || 0))
    );
  }
  const [active, setActive] = useState(opts[0] || '');
  useEffect(() => { if (opts.length && !byOpt.has(active)) setActive(opts[0]); }, [opts, byOpt, active]);

  if (opts.length === 0) return null;

  return (
    <div className="tf-tabs-wrap">
      <div className="tf-tabs" role="tablist">
        {opts.map((opt) => {
          const count = (byOpt.get(opt) || []).length;
          return (
            <button
              key={opt}
              role="tab"
              aria-selected={opt === active}
              onClick={() => setActive(opt)}
              className="tf-tab"
            >
              {opt}
              <span className="tf-tab-count">{count}</span>
            </button>
          );
        })}
      </div>
      {opts.map((opt) => {
        const branchTasks = byOpt.get(opt) || [];
        const visible = opt === active;
        return (
          <div
            key={opt}
            data-print-branch
            data-branch-name={opt}
            style={{ display: visible ? 'block' : 'none' }}
          >
            {branchTasks.length === 0 ? (
              <div className="tf-branch-empty">No follow-up tasks yet.</div>
            ) : (
              <TrainingChain tasks={branchTasks} byParent={byParent} roleKey={roleKey} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Task-kind label — short SF-Mono uppercase strings replace the emoji
// icons the previous design used. Reads like a technical spec sheet.
function taskKindLabel(task) {
  const isDecision = Array.isArray(task.decision_options) && task.decision_options.length > 0;
  if (isDecision) return null;
  const parts = [];
  if (task.email_recipient && task.email_subject) parts.push('Email');
  if (task.trigger_kind === 'status') parts.push('Status');
  else if (task.trigger_calendar_date) parts.push('Calendar');
  else parts.push('Date');
  if (task.trigger_recurring) parts.push('Recurring');
  return parts.join(' · ');
}

function taskMeta(task) {
  const parts = [];
  if (task.trigger_kind === 'status') {
    parts.push(
      <>While loan is in <code className="tf-code">{task.trigger_label || '—'}</code></>
    );
    if (task.repeat_interval && task.repeat_interval !== 'none') {
      parts.push(<> · repeats <code className="tf-code">{task.repeat_interval}</code></>);
    }
  } else if (task.trigger_calendar_date) {
    parts.push(<>Every <code className="tf-code">{task.trigger_calendar_date}</code>{task.trigger_recurring ? ' (yearly)' : ''}</>);
  } else {
    const n = Number(task.trigger_days || 0);
    const unit = task.trigger_unit || 'days';
    const abs = Math.abs(n);
    const when = n === 0 ? 'Same day' : n < 0 ? `${abs} ${unit} before` : `${abs} ${unit} after`;
    parts.push(<><code className="tf-code">{when}</code> {task.trigger_label || 'Closing'}</>);
  }
  if (task.email_recipient && task.email_subject) {
    const to = task.email_recipient === 'other' && task.email_other_recipient
      ? task.email_other_recipient
      : (task.email_recipient || '').replace('_', ' ');
    parts.push(<> · sends to {to}</>);
  }
  return parts;
}

const ROLE_LABEL_MAP = { lo: 'LO', loa: 'LOA', admin: 'Admin', automated: 'Auto' };

function TrainingCard({ task, roleKey }) {
  const isDecision = Array.isArray(task.decision_options) && task.decision_options.length > 0;
  const isMine = (task.role || '') === roleKey;
  const isHandoff = !isMine && !isDecision;

  if (isDecision) {
    return (
      <div className="tf-decision">
        <div className="tf-decision-eyebrow">
          Decision Point · answered by {ROLE_LABEL_MAP[task.role || 'lo'] || (task.role || 'LO')}
        </div>
        <div className="tf-decision-q">{task.title}</div>
        {task.notes && <div className="tf-decision-notes">{task.notes}</div>}
      </div>
    );
  }

  const kind = taskKindLabel(task);
  return (
    <div className="tf-task" data-mine={isMine ? 'true' : undefined} data-handoff={isHandoff ? 'true' : undefined}>
      <div className="tf-role">{ROLE_LABEL_MAP[task.role || 'lo'] || (task.role || 'LO')}</div>
      <div className="tf-title">{task.title}</div>
      {kind && <div className="tf-kind">{kind}</div>}
      <div className="tf-meta">
        {taskMeta(task).map((chunk, i) => <span key={i}>{chunk}</span>)}
      </div>
      {task.notes && <div className="tf-notes">{task.notes}</div>}
    </div>
  );
}

function SectionEditor({ section, value, onChange, onCommit, onSuggest, suggesting }) {
  const meta = SECTION_META[section];
  // Only mark the first section as the AI Suggest tour target so the
  // tour lands on it deterministically instead of any of 5 identical
  // buttons.
  const isFirst = section === 'job_description';
  // Content may be HTML (from AI Suggest or manual RTE editing) or
  // legacy plain text (from earlier saves). toEditorHtml passes HTML
  // through and converts markdown / plain text on the fly.
  const editorValue = toEditorHtml(value);
  return (
    <div data-tour={isFirst ? 'ai-suggest' : undefined} style={{ marginBottom: 14, padding: 14, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
            {meta.title}
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{meta.hint}</div>
        </div>
        <button
          onClick={onSuggest}
          disabled={suggesting}
          style={{
            padding: '6px 12px', fontSize: 11, fontWeight: 700,
            border: '1px solid #c62828', background: suggesting ? '#f5f5f5' : '#fff',
            color: '#c62828', borderRadius: 6,
            cursor: suggesting ? 'wait' : 'pointer',
          }}
        >{suggesting ? 'Suggesting…' : '✨ AI Suggest'}</button>
      </div>
      <RichTextEditor
        value={editorValue}
        onChange={onChange}
        onBlur={onCommit}
        placeholder={`Draft ${meta.title.toLowerCase()} manually, or click AI Suggest…`}
        minHeight={200}
        ariaLabel={meta.title}
      />
    </div>
  );
}

function AddRoleDrawer({ onClose, onCreated }) {
  const [label, setLabel] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    const created = await createJobRole(label.trim(), summary.trim());
    setSaving(false);
    onCreated(created);
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 420, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">Add Role</div>
          <div className="drawer-borrower">Roles & Responsibilities</div>
        </div>
        <form onSubmit={submit} className="drawer-body" style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Role name</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} required autoFocus style={{ width: '100%', padding: '8px 10px' }} placeholder="e.g. Marketing Coordinator" />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Summary (optional)</label>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} style={{ width: '100%', padding: '8px 10px' }} placeholder="Short one-liner shown in the sidebar" />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={saving || !label.trim()} style={{ padding: '8px 14px', background: '#c62828', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 6, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'Adding…' : 'Add role'}</button>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      </aside>
    </>
  );
}

function ConfirmDeleteModal({ roleLabel, onCancel, onConfirm }) {
  return (
    <>
      <div className="drawer-overlay open" onClick={onCancel} />
      <aside className="drawer open" style={{ width: 420, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onCancel} aria-label="Close">×</button>
          <div className="drawer-stage">Delete Role</div>
          <div className="drawer-borrower">{roleLabel}</div>
        </div>
        <div className="drawer-body" style={{ padding: 18 }}>
          <p style={{ fontSize: 13, color: '#222' }}>
            Any workflow tasks assigned to <strong>{roleLabel}</strong> will keep their role field set to
            this role's key, but won't resolve to a Roles page entry. Reassign them first if you want
            them to appear under a different role.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onConfirm} style={{ padding: '8px 14px', background: '#c62828', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer' }}>Delete role</button>
            <button onClick={onCancel} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          </div>
        </div>
      </aside>
    </>
  );
}

// Print-based PDF export. Opens a temporary print window with a clean
// A4 layout, Kyle's brand crest in the header, and the role's content
// laid out for print. Browser's print dialog → "Save as PDF" is what
// downloads the file.
function printRole({ role, draft, responsibilities, reportsToLabel }) {
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Grouped-by-workflow rendering so the PDF reads categorically —
  // matches what the user sees on the page. Each workflow becomes a
  // subsection header with a bulleted list of the tasks that role owns
  // within that workflow.
  const { groups } = responsibilities;
  const respBlock = groups.length
    ? groups.map((g) => `
        <div class="wf-group">
          <div class="wf-name">${esc(g.workflow_name)}${g.category ? ` <span class="wf-cat">${esc(g.category)}</span>` : ''}</div>
          <ul>${g.tasks.map((t) => `<li>${esc(t.title)}</li>`).join('')}</ul>
        </div>`).join('')
    : '<p class="muted">No workflow tasks assigned yet.</p>';

  // Section body is stored as HTML from the rich text editor. Legacy
  // plain-text / markdown saves still work because toEditorHtml passes
  // HTML through and converts everything else. Rendered content is
  // trusted — it was authored by an admin editing their own team's
  // handbook, not user-generated public content.
  const section = (title, body) => body?.trim()
    ? `<section><h2>${esc(title)}</h2>${toEditorHtml(body)}</section>`
    : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${esc(role.label)} — Role Description</title>
<style>
  @page { size: letter; margin: 0.75in; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; line-height: 1.55; margin: 0; }
  header { display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #c62828; padding-bottom: 14px; margin-bottom: 22px; }
  header img { width: 56px; height: 56px; object-fit: contain; }
  h1 { font-family: 'Oswald', sans-serif; margin: 0; font-size: 24px; letter-spacing: 0.3px; }
  .sub { font-size: 12px; color: #666; margin-top: 4px; letter-spacing: 0.4px; text-transform: uppercase; }
  h2 { font-family: 'Oswald', sans-serif; font-size: 15px; text-transform: uppercase; letter-spacing: 0.6px; color: #c62828; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
  p { margin: 6px 0 10px; font-size: 12.5px; }
  ul { margin: 4px 0 10px; padding-left: 22px; font-size: 12.5px; }
  li { margin-bottom: 3px; }
  .wf-group { margin: 10px 0 12px; break-inside: avoid; }
  .wf-name { font-size: 12px; font-weight: 700; color: #0A0A0A; margin-bottom: 3px; }
  .wf-cat { display: inline-block; margin-left: 6px; font-size: 9.5px; font-weight: 700; color: #666; background: #eee; padding: 2px 6px; border-radius: 3px; text-transform: uppercase; letter-spacing: .4px; }
  .muted { color: #888; }
  .footer { position: fixed; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 10px; color: #888; }
  section { break-inside: avoid; }
</style>
</head>
<body>
  <header>
    <img src="/brand-crest.jpeg" alt="The Kyle Duke Team" onerror="this.style.display='none'" />
    <div>
      <h1>${esc(role.label)}</h1>
      <div class="sub">The Kyle Duke Home Loan Team · Role Description</div>
      ${role.summary ? `<div class="sub" style="text-transform:none;color:#444;margin-top:6px">${esc(role.summary)}</div>` : ''}
      ${reportsToLabel ? `<div class="sub" style="text-transform:none;color:#444;margin-top:4px"><strong>Reports to:</strong> ${esc(reportsToLabel)}</div>` : ''}
    </div>
  </header>

  ${section('Job Description', draft.job_description)}

  <section>
    <h2>Responsibilities</h2>
    ${respBlock}
  </section>

  ${section('30-Day Plan', draft.training_30)}
  ${section('60-Day Plan', draft.training_60)}
  ${section('90-Day Plan', draft.training_90)}
  ${section('Accountability', draft.accountability)}

  <div class="footer">Confidential · The Kyle Duke Home Loan Team · Powered by Valor Home Loans</div>
</body>
</html>`;

  // window.open with content injected inline lets the browser print the
  // page independently of the app's stylesheet. iframe would collapse
  // to the parent's page-margin rules; a fresh window keeps @page
  // active correctly.
  const w = window.open('', '_blank', 'width=850,height=1100');
  if (!w) {
    showError('Popup blocked — allow popups for this site and try again.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the image a beat to load before firing print. Without this,
  // the crest is often blank on the first print.
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* ignore */ } }, 250);
}
