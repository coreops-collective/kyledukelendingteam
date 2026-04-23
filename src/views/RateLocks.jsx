import { useMemo, useState, useCallback } from 'react';
import { LOANS } from '../data/loans.js';
import { fmt$ } from '../lib/snapshotHelpers.js';
import LoanDrawer from '../components/LoanDrawer.jsx';

export default function RateLocks() {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [openId, setOpenId] = useState(null);

  const withDays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return LOANS
      .filter((l) => l.lockExp && l.lockExp !== 'Funded' && l.stage !== 'funded' && !isNaN(new Date(l.lockExp)))
      .map((l) => ({ ...l, daysLeft: Math.ceil((new Date(l.lockExp) - today) / 86400000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const totalLocked = withDays.length;
  const expiring7 = withDays.filter((l) => l.daysLeft <= 7 && l.daysLeft >= 0).length;
  const overdue = withDays.filter((l) => l.daysLeft < 0).length;
  const next14 = withDays.filter((l) => l.daysLeft > 7 && l.daysLeft <= 14).length;

  const daysColor = (d) => d < 0 ? '#c62828' : d <= 7 ? '#c62828' : d <= 14 ? '#e65100' : '#2e7d32';
  const openLoan = openId ? LOANS.find((l) => l.id === openId) : null;

  return (
    <div>
      <div className="kpi-grid">
        <div className="kpi" style={{ borderTopColor: overdue > 0 ? '#c62828' : 'var(--brand-red)' }}>
          <div className="kpi-label">Expired (past due)</div>
          <div className="kpi-value">{overdue}</div>
          <div className="kpi-sub">Urgent action</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Expiring ≤ 7 days</div>
          <div className="kpi-value">{expiring7}</div>
          <div className="kpi-sub">Needs extension or funding</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">8–14 Days</div>
          <div className="kpi-value">{next14}</div>
          <div className="kpi-sub">Watch list</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Active Locks</div>
          <div className="kpi-value">{totalLocked}</div>
          <div className="kpi-sub">From Loan Management</div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Active Rate Locks</div>
          <div className="section-sub">Auto-sourced from Loan Management · click any row for full loan detail</div>
        </div>
        <div className="section-body" style={{ padding: 0 }}>
          <table className="loans-table">
            <thead>
              <tr>
                <th>Borrower / Property</th>
                <th>Amount</th>
                <th>Rate</th>
                <th>Type</th>
                <th>Lock Expires</th>
                <th>Days Left</th>
                <th>LO</th>
              </tr>
            </thead>
            <tbody>
              {withDays.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 30, color: '#999' }}>
                    No active locks. Lock expiration dates set on the Loan Management tab will appear here automatically.
                  </td>
                </tr>
              ) : (
                withDays.map((l) => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => setOpenId(l.id)}>
                    <td>
                      <strong>{l.borrower}</strong>
                      <br />
                      <span className="muted">{l.property || '—'}</span>
                    </td>
                    <td>{l.amount ? fmt$(l.amount) : '—'}</td>
                    <td>{l.rate ? l.rate + '%' : '—'}</td>
                    <td>{l.type || '—'}</td>
                    <td>{l.lockExp}</td>
                    <td style={{ color: daysColor(l.daysLeft), fontWeight: 700 }}>
                      {l.daysLeft < 0 ? (-l.daysLeft + 'd late') : l.daysLeft + 'd'}
                    </td>
                    <td>{l.lo || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openLoan && (
        <LoanDrawer
          loan={openLoan}
          onSaved={bump}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}
