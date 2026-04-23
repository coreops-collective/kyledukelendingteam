import { useState, useCallback, useMemo } from 'react';
import { LOANS } from '../data/loans.js';
import { LOS_STAGES, STAGE_TO_STATUS } from '../data/stages.js';
import FilterDropdown from '../components/FilterDropdown.jsx';

const LOA_OPTIONS = ['', 'Kim', 'Abel'];

const fmt$ = (n) => (n ? '$ ' + Math.round(n).toLocaleString() : '—');

export default function LoaAssignment() {
  const [, force] = useState(0);
  const bump = useCallback(() => force((n) => n + 1), []);
  const [filter, setFilter] = useState('All');

  const rows = useMemo(
    () => LOANS
      .filter((l) => LOS_STAGES.includes(l.stage))
      .sort((a, b) => {
        const ad = a.closeDate ? new Date(a.closeDate) : new Date(0);
        const bd = b.closeDate ? new Date(b.closeDate) : new Date(0);
        return ad - bd;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const filtered = filter === 'All'
    ? rows
    : filter === 'Unassigned'
      ? rows.filter((l) => !l.loa)
      : rows.filter((l) => l.loa === filter);

  const counts = {
    all: rows.length,
    unassigned: rows.filter((l) => !l.loa).length,
    kim: rows.filter((l) => l.loa === 'Kim').length,
    abel: rows.filter((l) => l.loa === 'Abel').length,
  };

  const setLoa = (id, loa) => {
    const loan = LOANS.find((l) => l.id === id);
    if (!loan) return;
    loan.loa = loa;
    bump();
  };

  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 18, padding: '14px 18px', background: '#fff',
        border: '1px solid #e5e5e5', borderRadius: 10, gap: 14, flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            LOA Assignment
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            {counts.unassigned} unassigned · {counts.kim} to Kim · {counts.abel} to Abel
          </div>
        </div>
        <FilterDropdown
          label="Show"
          value={filter}
          options={['All', 'Unassigned', 'Kim', 'Abel']}
          onChange={setFilter}
        />
      </div>

      <div className="al-table-wrap">
        <table className="al-table">
          <thead>
            <tr>
              <th>Borrower</th>
              <th>Close Date</th>
              <th>Status</th>
              <th>LO</th>
              <th className="num">Loan Amount</th>
              <th>Type</th>
              <th>Property</th>
              <th style={{ minWidth: 140 }}>LOA</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="client">{l.borrower}</td>
                <td>{l.closeDate || '—'}</td>
                <td>{l.status || STAGE_TO_STATUS[l.stage] || l.stage}</td>
                <td>{l.lo || '—'}</td>
                <td className="num">{fmt$(l.amount)}</td>
                <td>{l.type || '—'}</td>
                <td className="prop">{l.property || '—'}</td>
                <td>
                  <select
                    value={l.loa || ''}
                    onChange={(e) => setLoa(l.id, e.target.value)}
                    style={{
                      width: '100%', padding: '6px 8px', fontSize: 12,
                      border: l.loa ? '1px solid #c8e6c9' : '1px solid #f5b8c1',
                      background: l.loa ? '#f1f8f1' : '#fff5f5',
                      borderRadius: 6, boxSizing: 'border-box', cursor: 'pointer',
                    }}
                  >
                    <option value="">— Unassigned —</option>
                    {LOA_OPTIONS.filter(Boolean).map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 30, color: '#999' }}>No loans match that filter</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
