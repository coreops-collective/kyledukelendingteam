import { useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { LOANS } from '../data/loans.js';
import { STAGES, REFI_WATCH_STAGE } from '../data/stages.js';
import LoanDrawer from '../components/LoanDrawer.jsx';

const fmt$ = (n) => '$' + Math.round(n).toLocaleString();
const fmt$M = (n) => n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'k';

function StageColumn({ stage, loans, onOpen }) {
  const total = loans.reduce((a, l) => a + (l.amount || 0), 0);
  return (
    <div className="kanban-col">
      <div className="kanban-col-head">
        <div className="kanban-col-title">{stage.label}</div>
        <div className="kanban-col-count">
          {loans.length}{total ? ' · ' + fmt$M(total) : ''}
        </div>
      </div>
      {loans.map((l) => (
        <div
          key={l.id}
          className="loan-card"
          onClick={() => onOpen(l.id)}
          style={{ cursor: 'pointer' }}
        >
          <div className="loan-borrower">{l.borrower}</div>
          {l.amount ? <div className="loan-amount">{fmt$(l.amount)}</div> : null}
          <div className="loan-meta">
            <span className="loan-pill">{l.type}</span>
            <span className="loan-pill">{l.purpose}</span>
            <span className="loan-pill">{l.lo}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Pipeline() {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [openId, setOpenId] = useState(null);

  const columns = useMemo(() => {
    const list = [];
    STAGES.forEach((s) => {
      list.push(s);
      if (s.key === 'hotpa') list.push(REFI_WATCH_STAGE);
    });
    return list;
  }, []);

  const byStage = useMemo(() => {
    const m = {};
    columns.forEach((s) => { m[s.key] = []; });
    LOANS.forEach((l) => {
      if (m[l.stage]) m[l.stage].push(l);
    });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, openId]);

  const activePipelineCount = LOANS.filter(
    (l) => l.stage !== 'funded' && l.stage !== 'cold'
  ).length;

  const openLoan = LOANS.find((l) => l.id === openId) || null;

  return (
    <div>
      <div className="pipeline-header">
        <div>
          <div className="pipeline-header-title">
            {activePipelineCount} Active Pipeline Files
          </div>
          <div className="pipeline-header-sub">
            Click any card for full detail · edit status to move stages
          </div>
        </div>
      </div>

      <div className="legend" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 18 }}>
          <div><span className="sw" style={{ background: '#f5c518' }}></span>Needs Note</div>
          <div><span className="sw" style={{ background: '#C8102E' }}></span>Action Required</div>
        </div>
        <Link
          to="/newloan"
          className="form-btn primary"
          style={{ textDecoration: 'none', padding: '8px 16px', fontSize: 12 }}
        >
          + New Loan Intake
        </Link>
      </div>

      <div className="kanban">
        {columns.map((s) => (
          <StageColumn key={s.key} stage={s} loans={byStage[s.key] || []} onOpen={setOpenId} />
        ))}
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
