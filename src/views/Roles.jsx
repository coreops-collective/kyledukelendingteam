import { useEffect, useMemo, useState } from 'react';
import {
  loadJobRoles, getJobRoles, createJobRole, updateJobRole, deleteJobRole,
} from '../lib/jobRoles.js';
import { loadWorkflows, getWorkflows, getTasksFor } from '../lib/workflows.js';
import { showError } from '../lib/toaster.js';
import Tour from '../components/Tour.jsx';

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
      body: 'Three more tabs contain the writable JD sections:\n\n• Job Description — the professional prose summary\n• 30-60-90 — combined month 1/2/3 onboarding plan\n• Accountability — measurable outcomes reviewed quarterly\n\nEach section has an ✨ AI Suggest button that drafts content in the Kyle Duke team voice, then you edit and blur to save.',
    },
    {
      title: 'Tab 5: Training (visual workflow trees)',
      body: 'The last tab is the killer feature for onboarding. Every workflow this role touches renders as a top-to-bottom tree:\n\n• Icons show task type (📅 date · 🔄 status · ❓ decision · 📧 email)\n• Trigger context shown inline ("3 days before Closing")\n• Decision points branch into their answers with the follow-up tasks under each\n• Your role\'s tasks are highlighted yellow; hand-offs to other roles are muted\n\nHand this to a new hire and they can read their entire role top-to-bottom.',
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
      const res = await fetch('/.netlify/functions/rewrite-job-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      // Replace the section text with the AI draft and save.
      saveField(section, data.text || '');
      updateJobRole(role.id, { [section]: data.text || '' });
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

// Visual training outline for a role. Renders every workflow this role
// is involved in as a tree — tasks in order, decision points expanded
// into branches with each answer's sub-tasks. Designed for a new hire
// to open, read top-to-bottom, and understand what their day looks
// like across every workflow they touch.
function TrainingPanel({ role }) {
  // Consider a workflow "relevant" to this role if it has at least one
  // task assigned to them. New hires still see the full task list of
  // each workflow (not just their own tasks) so they understand the
  // hand-offs — but muted styling makes their own tasks pop.
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

  return (
    <div>
      <div style={{
        marginBottom: 18, padding: 14,
        background: 'linear-gradient(135deg,#0A0A0A,#3a0e17)', color: '#fff',
        borderRadius: 10,
      }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 14, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#fbc02d', marginBottom: 4 }}>
          Training Outline for {role.label}
        </div>
        <div style={{ fontSize: 12, color: '#ccc', lineHeight: 1.5 }}>
          These are the workflows you'll be responsible for. Each one is laid out top-to-bottom: what triggers it, what tasks run in order, and how decision points branch the work. Your tasks are highlighted; other teammates' tasks appear muted so you understand the full hand-off.
        </div>
      </div>
      {trainingWorkflows.map((tw) => (
        <TrainingWorkflow key={tw.workflow.id} workflow={tw.workflow} tasks={tw.tasks} roleKey={role.key} />
      ))}
    </div>
  );
}

function TrainingWorkflow({ workflow, tasks, roleKey }) {
  // Split tasks into top-level (not gated on a decision) and per-decision
  // branches so the tree renders cleanly. A decision point's own row
  // becomes the branch parent; its dependent tasks nest underneath.
  const topLevel = tasks.filter((t) => !t.depends_on_task_id);
  const byParent = new Map();
  for (const t of tasks) {
    if (t.depends_on_task_id) {
      if (!byParent.has(t.depends_on_task_id)) byParent.set(t.depends_on_task_id, []);
      byParent.get(t.depends_on_task_id).push(t);
    }
  }
  return (
    <div style={{
      marginBottom: 20, background: '#fff',
      border: '1px solid #e5e5e5', borderRadius: 10, overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 16px', background: '#fafafa', borderBottom: '1px solid #eee',
        display: 'flex', alignItems: 'baseline', gap: 10,
      }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 15, fontWeight: 700 }}>
          {workflow.name}
        </div>
        {workflow.category && (
          <span style={{ fontSize: 10, fontWeight: 700, color: '#666', background: '#eee', padding: '2px 8px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            {workflow.category}
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#888' }}>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
      </div>
      <div style={{ padding: 14 }}>
        {topLevel.map((t, i) => (
          <TrainingNode
            key={t.id}
            task={t}
            byParent={byParent}
            roleKey={roleKey}
            depth={0}
            isFirst={i === 0}
          />
        ))}
      </div>
    </div>
  );
}

const ROLE_COLORS = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };

function TrainingNode({ task, byParent, roleKey, depth, isFirst, branchAnswer }) {
  const isDecision = Array.isArray(task.decision_options) && task.decision_options.length > 0;
  const isEmail = !!task.email_recipient && !!task.email_subject;
  const isMine = (task.role || '') === roleKey;
  const children = byParent.get(task.id) || [];
  const roleColor = ROLE_COLORS[task.role || 'lo'] || '#555';

  // Group children by their decision outcome so each answer becomes its
  // own visual branch. Non-decision children (dependencies without
  // outcome) group under a "Next" bucket.
  const branchGroups = new Map();
  if (isDecision) {
    for (const opt of (task.decision_options || [])) branchGroups.set(opt, []);
  }
  const nextBucket = [];
  for (const c of children) {
    if (isDecision && c.depends_on_outcome && branchGroups.has(c.depends_on_outcome)) {
      branchGroups.get(c.depends_on_outcome).push(c);
    } else {
      nextBucket.push(c);
    }
  }

  const iconFor = () => {
    if (isDecision) return '❓';
    if (isEmail) return '📧';
    if (task.trigger_kind === 'status') return '🔄';
    if (task.trigger_calendar_date) return '📆';
    return '📅';
  };

  const triggerText = () => {
    if (isDecision) return null;
    if (task.trigger_kind === 'status') {
      const repeat = task.repeat_interval && task.repeat_interval !== 'none' ? ` · repeats ${task.repeat_interval}` : '';
      return `While loan is in "${task.trigger_label || '—'}"${repeat}`;
    }
    if (task.trigger_calendar_date) {
      return `Every ${task.trigger_calendar_date}${task.trigger_recurring ? ' (yearly)' : ''}`;
    }
    const n = Number(task.trigger_days || 0);
    const unit = task.trigger_unit || 'days';
    const abs = Math.abs(n);
    const when = n === 0 ? 'On' : n < 0 ? `${abs} ${unit} before` : `${abs} ${unit} after`;
    const recur = task.trigger_recurring ? ' (recurring every year)' : '';
    return `${when} ${task.trigger_label || 'Closing'}${recur}`;
  };

  return (
    <div style={{
      marginLeft: depth * 22,
      marginTop: isFirst ? 0 : 10,
      position: 'relative',
    }}>
      {depth > 0 && (
        <div style={{
          position: 'absolute', left: -14, top: 12, width: 12, height: 2,
          background: '#ccc',
        }} />
      )}
      {branchAnswer && (
        <div style={{
          display: 'inline-block',
          padding: '3px 10px', marginBottom: 6,
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px',
          background: '#0A0A0A', color: '#fff', borderRadius: 999,
        }}>
          If &quot;{branchAnswer}&quot;
        </div>
      )}
      <div style={{
        padding: 12,
        background: isMine ? '#fff8e6' : '#fafafa',
        border: `1px solid ${isMine ? '#f5c518' : '#e5e5e5'}`,
        borderLeft: `4px solid ${isMine ? '#f5c518' : '#ddd'}`,
        borderRadius: 8,
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 18, lineHeight: '20px', flexShrink: 0 }}>{iconFor()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: isMine ? '#0A0A0A' : '#555' }}>{task.title}</span>
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#fff', background: roleColor,
                padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px',
              }}>{task.role || 'lo'}</span>
              {isDecision && (
                <span style={{
                  fontSize: 9, fontWeight: 700, color: '#fff', background: '#0A0A0A',
                  padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.4px',
                }}>Decision</span>
              )}
              {!isMine && (
                <span style={{ fontSize: 10, color: '#999', fontStyle: 'italic' }}>(hand-off)</span>
              )}
            </div>
            {triggerText() && (
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                <strong style={{ color: '#333' }}>When:</strong> {triggerText()}
              </div>
            )}
            {isEmail && (
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                <strong style={{ color: '#333' }}>Email:</strong> {task.email_recipient === 'other' && task.email_other_recipient
                  ? `Send to ${task.email_other_recipient}`
                  : `Send to ${(task.email_recipient || '').replace('_', ' ')}`}
                {task.email_subject ? ` — "${task.email_subject}"` : ''}
              </div>
            )}
            {isDecision && (task.decision_options || []).length > 0 && (
              <div style={{ fontSize: 11, color: '#666', marginBottom: 4 }}>
                <strong style={{ color: '#333' }}>Answers:</strong> {(task.decision_options || []).join(' · ')}
              </div>
            )}
            {task.notes && (
              <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic', marginTop: 4, padding: '6px 8px', background: 'rgba(0,0,0,.03)', borderRadius: 4 }}>
                {task.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {isDecision && (task.decision_options || []).length > 0 ? (
        <div style={{
          marginLeft: 22, marginTop: 8,
          borderLeft: '2px dashed #ccc', paddingLeft: 16,
        }}>
          {(task.decision_options || []).map((opt) => {
            const branchTasks = branchGroups.get(opt) || [];
            return (
              <div key={opt} style={{ marginBottom: 12 }}>
                {branchTasks.length === 0 ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                    fontSize: 11, color: '#888', fontStyle: 'italic',
                  }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '3px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '.5px', background: '#f4f4f6', color: '#666', borderRadius: 999,
                    }}>If &quot;{opt}&quot;</span>
                    No follow-up tasks yet
                  </div>
                ) : (
                  branchTasks.map((child, ci) => (
                    <TrainingNode
                      key={child.id}
                      task={child}
                      byParent={byParent}
                      roleKey={roleKey}
                      depth={depth + 1}
                      isFirst={ci === 0}
                      branchAnswer={opt}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      ) : (
        nextBucket.length > 0 && (
          <div style={{ marginLeft: 22, marginTop: 8, borderLeft: '2px dashed #ccc', paddingLeft: 16 }}>
            {nextBucket.map((child, ci) => (
              <TrainingNode
                key={child.id}
                task={child}
                byParent={byParent}
                roleKey={roleKey}
                depth={depth + 1}
                isFirst={ci === 0}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}

function SectionEditor({ section, value, onChange, onCommit, onSuggest, suggesting }) {
  const meta = SECTION_META[section];
  // Only mark the first section as the AI Suggest tour target so the
  // tour lands on it deterministically instead of any of 5 identical
  // buttons.
  const isFirst = section === 'job_description';
  return (
    <div data-tour={isFirst ? 'ai-suggest' : undefined} style={{ marginBottom: 14, padding: 14, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
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
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        placeholder={`Draft ${meta.title.toLowerCase()} manually, or click AI Suggest…`}
        rows={Math.max(4, Math.min(20, value.split('\n').length + 2))}
        style={{
          width: '100%', padding: 10, fontFamily: 'inherit', fontSize: 13,
          border: '1px solid #ddd', borderRadius: 6, resize: 'vertical', lineHeight: 1.5,
        }}
        aria-label={meta.title}
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
  const mdToHtml = (md) => {
    // Small, defensive markdown → HTML for our short section outputs.
    // Only handles paragraphs, bullets, bold, italic — no arbitrary
    // HTML pass-through, so a spelling of "<script>" in a manual edit
    // won't execute in the print window.
    const safe = esc(md || '');
    const lines = safe.split(/\r?\n/);
    const out = [];
    let inList = false;
    for (const rawLine of lines) {
      const line = rawLine.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
      if (/^\s*[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul>'); inList = true; }
        out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`);
      } else if (line.trim() === '') {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push(`<p>${line}</p>`);
      }
    }
    if (inList) out.push('</ul>');
    return out.join('\n');
  };

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

  const section = (title, body) => body?.trim()
    ? `<section><h2>${esc(title)}</h2>${mdToHtml(body)}</section>`
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
