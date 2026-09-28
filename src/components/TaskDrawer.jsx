import { useState, useMemo, useCallback } from 'react';
import { TASK_ROLES } from '../data/workflows.js';

const labelStyle = { display: 'block', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 };
const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
const textareaStyle = { ...inputStyle, minHeight: 90, resize: 'vertical', lineHeight: 1.5 };

/**
 * Task detail drawer. Mutates the passed task object in place
 * (same pattern as LoanDrawer). Calls onSaved() so parent can re-render.
 * Set editable=false for read-only display.
 */
export default function TaskDrawer({ task, kind, parentTitle, editable = true, onSaved, onClose }) {
  const [, force] = useState(0);

  const set = useCallback((key, value) => {
    task[key] = value;
    force((n) => n + 1);
    onSaved?.();
  }, [task, onSaved]);

  // EditField is built ONCE per task rather than on every render. Defining a
  // component inside a render creates a new component TYPE each time, which
  // React cannot reconcile — it unmounts and remounts the subtree. These
  // inputs are uncontrolled (defaultValue), so a remount re-applies the
  // original value and drops focus mid-typing. Kim hit the same bug in the
  // loan drawer: "requires multiple clicks in a field in order to type in it
  // because it resets."
  //
  // useMemo keyed on [task, set] is the right granularity: the identity stays
  // stable while you edit one task, and deliberately changes when a different
  // task is opened — which is exactly when the fields SHOULD reset.
  //
  // `task` is mutated in place rather than replaced, so its reference is
  // stable across edits; `set` is useCallback'd for the same reason.
  const EditField = useMemo(() => function EditField({ label, field, textarea, full }) {
    return (
      <div style={{ marginBottom: 14, gridColumn: full ? '1/-1' : undefined }}>
        <label style={labelStyle}>{label}</label>
        {textarea ? (
          <textarea
            defaultValue={task?.[field] || ''}
            onBlur={(e) => set(field, e.target.value)}
            style={textareaStyle}
          />
        ) : (
          <input
            defaultValue={task?.[field] || ''}
            onBlur={(e) => set(field, e.target.value)}
            style={inputStyle}
          />
        )}
      </div>
    );
  }, [task, set]);

  // Every hook has now run, so the guard is safe here. It used to sit above
  // them, which is why they had to move.
  if (!task) return null;

  const role = task.role || task.who || 'lo';
  const title = task.text || task.title || 'Task';
  const stage = kind === 'workflow' ? (parentTitle || 'Workflow') : (parentTitle || 'Client For Life');


  const RoField = ({ label, value }) => {
    if (!value) return null;
    return (
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>{label}</label>
        <div style={{ fontSize: 13, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{value}</div>
      </div>
    );
  };


  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
          <div className="drawer-stage">{stage}</div>
          <div className="drawer-borrower">{title}</div>
        </div>
        <div className="drawer-body">
          {editable ? (
            <>
              <EditField label="What · Task" field={kind === 'cfl' ? 'title' : 'text'} full />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Who · Role</label>
                  <select
                    value={role}
                    onChange={(e) => set('role', e.target.value)}
                    style={inputStyle}
                  >
                    {Object.entries(TASK_ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <EditField label="Who · Assignee" field="assignee" />
                <EditField label="When · Timing" field="when" />
                <EditField label="When · Due Date" field="dueDate" />
                <div style={{ gridColumn: '1/-1' }}><EditField label="Where · System" field="system" full /></div>
              </div>
              <EditField label="Why · Rationale" field="why" textarea full />
              <EditField label="How · Detailed Steps" field="how" textarea full />
              {kind === 'cfl' && <EditField label="Template" field="template" full />}
            </>
          ) : (
            <>
              <RoField label="What · Task" value={title} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <RoField label="Who · Role" value={TASK_ROLES[role] || role} />
                <RoField label="Who · Assignee" value={task.assignee} />
                <RoField label="When · Timing" value={task.when} />
                <RoField label="When · Due Date" value={task.dueDate} />
                <RoField label="Where · System" value={task.system} />
              </div>
              <RoField label="Why · Rationale" value={task.why} />
              <RoField label="How · Detailed Steps" value={task.how} />
              {kind === 'cfl' && <RoField label="Template" value={task.template && task.template !== '—' ? task.template : ''} />}
            </>
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}
