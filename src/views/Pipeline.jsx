import { useState } from 'react';
import { LOANS } from '../data/loans.js';
import { STAGES, stageByKey } from '../data/stages.js';

export default function Pipeline() {
  const [loans] = useState(LOANS);
  return (
    <div>
      <div className="page-title">Pipeline</div>
      <p style={{ color: '#666', marginTop: 6, marginBottom: 18 }}>
        Seed data only — full kanban view will be ported next.
      </p>
      <div className="card">
        <table className="loans-table">
          <thead>
            <tr>
              <th>Borrower</th><th>Stage</th><th>Type</th><th>Purpose</th>
              <th>Amount</th><th>LO</th><th>Property</th>
            </tr>
          </thead>
          <tbody>
            {loans.map(l => (
              <tr key={l.id}>
                <td>{l.borrower}</td>
                <td>{stageByKey(l.stage)?.label || l.stage}</td>
                <td>{l.type}</td>
                <td>{l.purpose}</td>
                <td>{l.amount ? '$' + l.amount.toLocaleString() : '—'}</td>
                <td>{l.lo}</td>
                <td>{l.property}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
