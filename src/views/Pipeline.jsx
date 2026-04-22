import { useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { STAGES, REFI_WATCH_STAGE } from '../data/stages.js';

const fmt$ = (n) => '$' + Math.round(n).toLocaleString();
const fmt$M = (n) => n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'k';

function StageColumn({ stage, loans }) {
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
        <div key={l.id} className="loan-card">
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
  const [loans] = useState(LOANS);

  // Include REFI_WATCH_STAGE column (legacy STAGES array had it inline; our
  // stages.js exports it separately). Insert after 'hotpa' for parity.
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
    loans.forEach((l) => {
      if (m[l.stage]) m[l.stage].push(l);
    });
    return m;
  }, [loans, columns]);

  const activePipelineCount = loans.filter(
    (l) => l.stage !== 'funded' && l.stage !== 'cold'
  ).length;

  return (
    <div>
      <div className="pipeline-header">
        <div>
          <div className="pipeline-header-title">
            {activePipelineCount} Active Pipeline Files
          </div>
          <div className="pipeline-header-sub">
            Drag cards between columns · click any card for full detail
          </div>
        </div>
        <button className="form-btn primary" type="button">+ New Loan</button>
      </div>

      <div className="legend">
        <div><span className="sw" style={{ background: '#f5c518' }}></span>Needs Note</div>
        <div><span className="sw" style={{ background: '#C8102E' }}></span>Action Required</div>
      </div>

      <div className="kanban">
        {columns.map((s) => (
          <StageColumn key={s.key} stage={s} loans={byStage[s.key] || []} />
        ))}
      </div>
    </div>
  );
}
