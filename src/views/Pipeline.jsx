import { useMemo, useState, useCallback } from 'react';
import { LOANS } from '../data/loans.js';
import { STAGES, REFI_WATCH_STAGE, STAGE_TO_STATUS } from '../data/stages.js';
import LoanDrawer from '../components/LoanDrawer.jsx';
import NewLoanDrawer from '../components/NewLoanDrawer.jsx';

const fmt$ = (n) => '$' + Math.round(n).toLocaleString();
const fmt$M = (n) => n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'k';

function LoanCard({ loan, onOpen, onDragStart, onDragEnd }) {
  return (
    <div
      className="loan-card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', loan.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(loan.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(loan.id)}
      style={{ cursor: 'grab' }}
    >
      <div className="loan-borrower">{loan.borrower}</div>
      {loan.amount ? <div className="loan-amount">{fmt$(loan.amount)}</div> : null}
      <div className="loan-meta">
        <span className="loan-pill">{loan.type}</span>
        <span className="loan-pill">{loan.purpose}</span>
        <span className="loan-pill">{loan.lo}</span>
      </div>
    </div>
  );
}

function StageColumn({ stage, loans, draggingId, onOpen, onDrop, onDragStart, onDragEnd }) {
  const [hover, setHover] = useState(false);
  const total = loans.reduce((a, l) => a + (l.amount || 0), 0);

  return (
    <div
      className="kanban-col"
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (!hover) setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        const id = e.dataTransfer.getData('text/plain');
        if (id) onDrop(id, stage.key);
      }}
      style={hover && draggingId ? { outline: '2px dashed #C8102E', outlineOffset: -4, background: '#fff5f5' } : undefined}
    >
      <div className="kanban-col-head">
        <div className="kanban-col-title">{stage.label}</div>
        <div className="kanban-col-count">
          {loans.length}{total ? ' · ' + fmt$M(total) : ''}
        </div>
      </div>
      {loans.map((l) => (
        <LoanCard
          key={l.id}
          loan={l}
          onOpen={onOpen}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        />
      ))}
    </div>
  );
}

export default function Pipeline() {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [openId, setOpenId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [newLoanOpen, setNewLoanOpen] = useState(false);

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
  }, [columns, openId, draggingId]);

  const activePipelineCount = LOANS.filter(
    (l) => l.stage !== 'funded' && l.stage !== 'cold'
  ).length;

  const openLoan = openId ? LOANS.find((l) => l.id === openId) : null;

  const handleDrop = useCallback((loanId, newStageKey) => {
    const loan = LOANS.find((l) => l.id === loanId);
    if (!loan || loan.stage === newStageKey) return;
    loan.stage = newStageKey;
    // Keep `status` in sync so Loan Management reflects the change.
    const mappedStatus = STAGE_TO_STATUS[newStageKey];
    if (mappedStatus) loan.status = mappedStatus;
    bump();
  }, [bump]);

  return (
    <div>
      <div className="pipeline-header">
        <div>
          <div className="pipeline-header-title">
            {activePipelineCount} Active Pipeline Files
          </div>
          <div className="pipeline-header-sub">
            Drag cards between columns to change stage · click a card for full detail
          </div>
        </div>
      </div>

      <div className="legend" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 18 }}>
          <div><span className="sw" style={{ background: '#f5c518' }}></span>Needs Note</div>
          <div><span className="sw" style={{ background: '#C8102E' }}></span>Action Required</div>
        </div>
        <button
          type="button"
          onClick={() => setNewLoanOpen(true)}
          className="form-btn primary"
          style={{ padding: '8px 16px', fontSize: 12 }}
        >
          + New Loan Intake
        </button>
      </div>

      <div className="kanban">
        {columns.map((s) => (
          <StageColumn
            key={s.key}
            stage={s}
            loans={byStage[s.key] || []}
            draggingId={draggingId}
            onOpen={setOpenId}
            onDrop={handleDrop}
            onDragStart={setDraggingId}
            onDragEnd={() => setDraggingId(null)}
          />
        ))}
      </div>

      {openLoan && (
        <LoanDrawer
          loan={openLoan}
          onSaved={bump}
          onClose={() => setOpenId(null)}
        />
      )}

      {newLoanOpen && <NewLoanDrawer onClose={() => setNewLoanOpen(false)} />}
    </div>
  );
}
