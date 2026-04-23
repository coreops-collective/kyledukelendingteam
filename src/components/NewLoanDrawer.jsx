import NewLoan from '../views/NewLoan.jsx';

/**
 * Wraps the existing NewLoan form in the standard right-side drawer shell.
 * Opened from "+ New Loan Intake" buttons in Pipeline / LoanManagement.
 */
export default function NewLoanDrawer({ onClose }) {
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 720, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">New Loan</div>
          <div className="drawer-borrower">Intake Form</div>
        </div>
        <div className="drawer-body" style={{ padding: 18 }}>
          <NewLoan />
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
