import { useEffect, useMemo, useState } from 'react';
import {
  loadJobRoles, getJobRoles, createJobRole, updateJobRole, deleteJobRole,
} from '../lib/jobRoles.js';
import { loadWorkflows, getWorkflows, getTasksFor } from '../lib/workflows.js';
import { showError } from '../lib/toaster.js';

// One-line hint for each section so the empty state doesn't feel blank.
const SECTION_META = {
  job_description: { title: 'Job Description', hint: 'A short professional summary of what this role owns and why it matters.' },
  training_30:     { title: '30-Day Plan',    hint: 'What the new hire is expected to shadow, learn, and complete in their first month.' },
  training_60:     { title: '60-Day Plan',    hint: 'What they own with more autonomy in month two.' },
  training_90:     { title: '90-Day Plan',    hint: 'Full ownership. What "off ramp" looks like by day 90.' },
  accountability:  { title: 'Accountability', hint: 'The measurable outcomes a manager reviews with this role each quarter.' },
};
const SECTION_ORDER = ['job_description', 'training_30', 'training_60', 'training_90', 'accountability'];

// Aggregate every workflow_task assigned to this role's key. This is
// where the "auto-populated responsibilities" feature actually happens
// — no duplicate storage, always live.
function responsibilitiesFor(roleKey) {
  const out = [];
  const seen = new Set();
  for (const wf of getWorkflows()) {
    const tasks = getTasksFor(wf.id);
    for (const t of tasks) {
      if ((t.role || '') !== roleKey) continue;
      const dedupKey = (t.title || '').trim().toLowerCase();
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      out.push({ title: t.title, workflow: wf.name, category: wf.category });
    }
  }
  return out.sort((a, b) => a.title.localeCompare(b.title));
}

export default function Roles() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeKey, setActiveKey] = useState(null);
  const [showAddRole, setShowAddRole] = useState(false);

  useEffect(() => {
    Promise.all([loadJobRoles(), loadWorkflows()]).finally(bump);
    const events = [
      'kdt-job-roles-changed', 'kdt-job-roles-loaded',
      'kdt-workflows-changed', 'kdt-workflows-loaded',
    ];
    const on = () => bump();
    events.forEach((e) => window.addEventListener(e, on));
    return () => events.forEach((e) => window.removeEventListener(e, on));
  }, []);

  const roles = getJobRoles();
  const active = roles.find((r) => r.key === activeKey) || roles[0] || null;

  // Auto-pick the first role once data lands.
  useEffect(() => { if (!activeKey && roles.length) setActiveKey(roles[0].key); }, [roles.length, activeKey]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20, alignItems: 'flex-start' }}>
      <RoleList roles={roles} activeKey={active?.key} onPick={setActiveKey} onAdd={() => setShowAddRole(true)} />
      {active
        ? <RoleEditor role={active} onChange={bump} />
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
    </div>
  );
}

function RoleList({ roles, activeKey, onPick, onAdd }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: 10 }}>
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

function RoleEditor({ role, onChange }) {
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
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id]);

  const responsibilities = useMemo(() => responsibilitiesFor(role.key), [role.key]);

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
          responsibilities: responsibilities.map((r) => r.title),
          existing_content: draft[section] || '',
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
    printRole({ role, draft, responsibilities });
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
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
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

      <ResponsibilitiesPanel role={role} responsibilities={responsibilities} />

      {SECTION_ORDER.map((section) => (
        <SectionEditor
          key={section}
          section={section}
          value={draft[section]}
          onChange={(v) => saveField(section, v)}
          onCommit={() => commitField(section)}
          onSuggest={() => suggest(section)}
          suggesting={!!suggesting[section]}
        />
      ))}

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
  return (
    <div style={{ marginBottom: 18, padding: 16, background: '#fafafa', border: '1px solid #eee', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
          Responsibilities · from workflow tasks
        </div>
        <span style={{ fontSize: 11, color: '#888' }}>{responsibilities.length} total · live</span>
      </div>
      {responsibilities.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>
          No workflow tasks are assigned to <strong>{role.label}</strong> yet. Assign a task to this role
          on the Workflows page and it will appear here automatically.
        </div>
      ) : (
        <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13, color: '#222' }}>
          {responsibilities.map((r, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              {r.title}
              <span style={{ marginLeft: 8, color: '#999', fontSize: 11 }}>· {r.workflow}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SectionEditor({ section, value, onChange, onCommit, onSuggest, suggesting }) {
  const meta = SECTION_META[section];
  return (
    <div style={{ marginBottom: 14, padding: 14, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10 }}>
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
function printRole({ role, draft, responsibilities }) {
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

  const respBlock = responsibilities.length
    ? `<ul>${responsibilities.map((r) => `<li>${esc(r.title)} <span class="wf">${esc(r.workflow)}</span></li>`).join('')}</ul>`
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
  ul { margin: 4px 0 12px; padding-left: 22px; font-size: 12.5px; }
  li { margin-bottom: 3px; }
  .wf { color: #888; font-size: 10.5px; margin-left: 6px; }
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
