import { useMemo, useState, useCallback, useEffect } from 'react';
import { LOANS } from '../data/loans.js';
import { STAGES, REFI_WATCH_STAGE, STAGE_TO_STATUS, stageByKey } from '../data/stages.js';
import LoanDrawer from '../components/LoanDrawer.jsx';
import NewLoanDrawer from '../components/NewLoanDrawer.jsx';
import { markLoansDirty } from '../lib/loansStore.js';

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
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);
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
    const oldStageKey = loan.stage;
    loan.stage = newStageKey;
    // Keep `status` in sync so Loan Management reflects the change.
    const mappedStatus = STAGE_TO_STATUS[newStageKey];
    if (mappedStatus) loan.status = mappedStatus;
    markLoansDirty();
    bump();

    // Fire loan.stage_changed event so notification rules (filtered by
    // stage, e.g. "New Contract") can email recipients. Context includes
    // both stage_changed-style fields AND loan.created-style fields so
    // whichever placeholders the user put in the template, they populate.
    const [lastName, firstName] = (loan.borrower || '').split(',').map((s) => (s || '').trim());
    const oldLabel = STAGE_TO_STATUS[oldStageKey] || stageByKey(oldStageKey)?.label || oldStageKey;
    const newLabel = STAGE_TO_STATUS[newStageKey] || stageByKey(newStageKey)?.label || newStageKey;
    fetch('/.netlify/functions/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'loan.stage_changed',
        context: {
          loan_id: loan.id,
          borrower: loan.borrower,
          borrower_first: firstName || '',
          borrower_last: lastName || '',
          old_stage: oldLabel,
          new_stage: newLabel,
          stage: newLabel,
          // Keys (for notification_rules.stage_filter matching — the
          // filter stores stage keys like 'fresh' / 'applied').
          new_stage_key: newStageKey,
          old_stage_key: oldStageKey,
          stage_key: newStageKey,
          lo: loan.lo || '',
          loan_officer: loan.lo || '',
          loa: loan.loa || '',
          phone: loan.phone || '',
          email: loan.email || '',
          loan_type: loan.type || '',
          purpose: loan.purpose || '',
          amount: loan.amount || '',
          property: loan.property || '',
          closeDate: loan.closeDate || '',
          dashboard_url: 'https://thekyleduketeam.netlify.app/',
        },
      }),
    })
      .then((res) => res.json().catch(() => ({})))
      .then((json) => {
        if (json?.sent > 0) {
          setToast({ title: 'Notification sent', msg: `Emailed ${json.sent} recipient${json.sent === 1 ? '' : 's'} about ${loan.borrower}` });
        } else if (json?.reason) {
          // Only surface if it's surprising (e.g. a stage that had no matching rule).
          // 'No matching rules' / 'No rules match this stage' are normal, keep quiet.
        }
      })
      .catch(() => { /* silent */ });
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

      {toast && (
        <div
          onClick={() => setToast(null)}
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 200,
            background: '#1a6b4a', color: '#fff', padding: '14px 20px',
            borderRadius: 10, boxShadow: '0 6px 24px rgba(0,0,0,.25)',
            cursor: 'pointer', maxWidth: 360, fontSize: 13, lineHeight: 1.4,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', fontSize: 11, letterSpacing: '.5px' }}>{toast.title}</div>
          <div>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
