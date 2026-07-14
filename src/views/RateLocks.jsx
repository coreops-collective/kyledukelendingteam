import { useMemo, useState, useCallback, useEffect } from 'react';
import { LOANS } from '../data/loans.js';
import { fmt$ } from '../lib/snapshotHelpers.js';
import LoanDrawer from '../components/LoanDrawer.jsx';
import { subscribeLoans } from '../lib/loansStore.js';
import { parseLocalDate } from '../lib/clientDates.js';
import Tour from '../components/Tour.jsx';

export default function RateLocks() {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [openId, setOpenId] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);

  useEffect(() => subscribeLoans(bump), [bump]);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const RATE_LOCKS_TOUR_STEPS = [
    {
      title: 'Rate Locks',
      body: 'Every loan currently in escrow with a locked rate. The list is auto-sourced from Loan Management — any loan with a Lock Expires date that\'s not Funded shows up here.\n\nSorted by days left so the most urgent locks are always at the top.',
    },
    {
      target: '[data-tour="lock-kpis"]',
      title: 'The 4 count KPIs',
      body: '• Expired (past due) — locks that have already lapsed. Urgent.\n• Expiring ≤ 7 days — the fire drill window.\n• 8–14 days — watch list.\n• Total Active Locks — everything you\'re actively tracking.\n\nExpired turns bright red when > 0.',
    },
    {
      target: '[data-tour="lock-exposure"]',
      title: 'Dollars-at-risk exposure',
      body: 'The second row translates lock count into dollar terms:\n\n• Locked Volume — total $ under committed rate right now.\n• Weighted Avg Days Left — each lock weighted by its loan amount, so a $600K lock 3 days out counts more than a $200K lock 30 days out. Red when < 7d.\n• Next Big Lock — earliest expiration among the biggest half of locks by $. Your "when\'s the next fire drill" indicator.',
    },
    {
      target: '.loans-table',
      title: 'The lock table',
      body: 'Each row shows the borrower, property, loan amount, rate, type, lock date, days left, and the LO. Click any row to open the full Loan Drawer and adjust the lock date, request an extension, or update status.\n\nDays Left color-codes automatically: red ≤ 7 or overdue · orange 8-14 · green 15+.',
    },
    {
      title: 'How locks appear here',
      body: 'When you set a Lock Expires date on any loan (Loan Management drawer, spreadsheet cell, or the Pipeline drawer), it appears on this page instantly. No manual entry needed.\n\nWhen a loan funds or moves to Adversed / Archived, it drops off this page automatically.',
    },
  ];

  const withDays = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return LOANS
      .filter((l) => !l.archived && l.status !== 'Adversed' && l.lockExp && l.lockExp !== 'Funded' && l.stage !== 'funded' && parseLocalDate(l.lockExp))
      .map((l) => ({ ...l, daysLeft: Math.ceil((parseLocalDate(l.lockExp) - today) / 86400000) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  const totalLocked = withDays.length;
  const expiring7 = withDays.filter((l) => l.daysLeft <= 7 && l.daysLeft >= 0).length;
  const overdue = withDays.filter((l) => l.daysLeft < 0).length;
  const next14 = withDays.filter((l) => l.daysLeft > 7 && l.daysLeft <= 14).length;

  // Exposure metrics. "Locked volume" is total dollars sitting under a
  // committed rate right now — the number that matters if the market
  // moves and locks need to be extended. "Weighted avg days left"
  // weights each lock by its loan amount so a $600K lock 3 days out
  // counts more than a $200K lock 30 days out. "Nearest big lock" is
  // the earliest expiration among the biggest half of locks by amount
  // — a rough "when's the next fire drill" indicator.
  const lockedVolume = withDays.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const weightedDaysLeft = lockedVolume > 0
    ? withDays.reduce((s, l) => s + (Number(l.amount) || 0) * l.daysLeft, 0) / lockedVolume
    : 0;
  const bigCutoff = withDays.length
    ? [...withDays].sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))[Math.floor(withDays.length / 2)]?.amount || 0
    : 0;
  const nearestBigLock = withDays
    .filter((l) => (Number(l.amount) || 0) >= (Number(bigCutoff) || 0))
    .reduce((min, l) => (min === null || l.daysLeft < min ? l.daysLeft : min), null);

  const daysColor = (d) => d < 0 ? '#c62828' : d <= 7 ? '#c62828' : d <= 14 ? '#e65100' : '#2e7d32';
  const exposureColor = weightedDaysLeft < 7 ? '#c62828' : weightedDaysLeft < 14 ? '#e65100' : '#2e7d32';
  const openLoan = openId ? LOANS.find((l) => l.id === openId) : null;

  return (
    <div>
      <div className="kpi-grid" data-tour="lock-kpis">
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

      {/* Rate lock exposure — dollars-at-risk view. */}
      <div className="kpi-grid" data-tour="lock-exposure" style={{ marginTop: 4 }}>
        <div className="kpi" style={{ borderTopColor: '#0A0A0A' }}>
          <div className="kpi-label">Locked Volume</div>
          <div className="kpi-value">{lockedVolume > 0 ? fmt$(lockedVolume) : '—'}</div>
          <div className="kpi-sub">Total $ under committed rate</div>
        </div>
        <div className="kpi" style={{ borderTopColor: exposureColor }}>
          <div className="kpi-label">Weighted Avg Days Left</div>
          <div className="kpi-value" style={{ color: exposureColor }}>
            {lockedVolume > 0 ? Math.round(weightedDaysLeft) + 'd' : '—'}
          </div>
          <div className="kpi-sub">$ × days ÷ total $</div>
        </div>
        <div className="kpi" style={{ borderTopColor: nearestBigLock !== null && nearestBigLock <= 7 ? '#c62828' : nearestBigLock !== null && nearestBigLock <= 14 ? '#e65100' : '#2e7d32' }}>
          <div className="kpi-label">Next Big Lock</div>
          <div className="kpi-value">
            {nearestBigLock !== null
              ? (nearestBigLock < 0 ? (-nearestBigLock + 'd late') : nearestBigLock + 'd')
              : '—'}
          </div>
          <div className="kpi-sub">Earliest among top-half by $</div>
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
      {tourOpen && <Tour steps={RATE_LOCKS_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}
