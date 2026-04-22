import { TASK_ROLES } from '../data/workflows.js';

export default function TaskDrawer({ task, kind, parentTitle, onClose }) {
  if (!task) return null;
  const role = task.role || task.who || 'lo';
  const title = task.text || task.title || 'Task';
  const stage = kind === 'workflow' ? (parentTitle || 'Workflow') : 'Client For Life';

  const Row = ({ label, value }) => {
    if (!value) return null;
    return (
      <div className="form-field" style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
          {label}
        </label>
        <div style={{ fontSize: 13, color: '#222', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{value}</div>
      </div>
    );
  };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 640, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">{stage}</div>
          <div className="drawer-borrower">{title}</div>
        </div>
        <div className="drawer-body">
          <Row label="What · Task" value={title} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
            <Row label="Who · Role" value={TASK_ROLES[role] || role} />
            <Row label="Who · Assignee" value={task.assignee} />
            <Row label="When · Timing" value={task.when} />
            <Row label="When · Due Date" value={task.dueDate} />
            <Row label="Where · System" value={task.system} />
          </div>
          <Row label="Why · Rationale" value={task.why} />
          <Row label="How · Detailed Steps" value={task.how} />
          {kind !== 'workflow' && <Row label="Template" value={task.template && task.template !== '—' ? task.template : ''} />}
          {!task.why && !task.how && !task.when && !task.assignee && !task.system && (
            <div style={{ padding: 16, color: '#999', fontSize: 13, fontStyle: 'italic', textAlign: 'center' }}>
              No additional details for this task yet.
            </div>
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
