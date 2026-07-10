import { useRef } from 'react';
import NewLoan from '../views/NewLoan.jsx';

/**
 * Wraps the existing NewLoan form in the standard right-side drawer shell.
 * Opened from "+ New Loan Intake" buttons in Pipeline / LoanManagement.
 *
 * Dirty check: since NewLoan owns its form state internally, we listen
 * for any input/change event in the drawer body and set a dirty flag.
 * Closing (overlay, ×, Cancel) while dirty prompts before discarding
 * the ~20-field intake form.
 */
export default function NewLoanDrawer({ onClose }) {
  const dirtyRef = useRef(false);
  const markDirty = () => { dirtyRef.current = true; };
  const safeClose = () => {
    if (dirtyRef.current && !window.confirm('Discard the in-progress loan intake?')) return;
    onClose();
  };
  return (
    <>
      <div className="drawer-overlay open" onClick={safeClose} />
      <aside className="drawer open" style={{ width: 720, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={safeClose}>×</button>
          <div className="drawer-stage">New Loan</div>
          <div className="drawer-borrower">Intake Form</div>
        </div>
        <div className="drawer-body" style={{ padding: 18 }} onInput={markDirty} onChange={markDirty}>
          <NewLoan />
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={safeClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
