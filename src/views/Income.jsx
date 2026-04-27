import { useMemo, useState, useEffect, useCallback } from 'react';
import { LOANS } from '../data/loans.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { isBranchManager } from '../lib/auth.js';
import { getAllFunded } from '../lib/fundedLoans.js';
import { subscribeLoans } from '../lib/loansStore.js';

// ---- helpers (ported from legacy) ----
const fmt$ = (n) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt$M = (n) =>
  n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + (n / 1e3).toFixed(0) + 'K';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const loBpsFor = (lo) => (lo === 'Missy' ? 1.2 : 1.3);
// Branch gross bumps from 10 bps → 30 bps for loans closing Apr 2026 and later.
// Branch gross schedule:
//   before 2025-06-01       → 0 bps (no branch revenue)
//   2025-06-01 … 2026-03-31 → 10 bps
//   2026-04-01 onward       → 30 bps
const BRANCH_GROSS_START = new Date('2025-06-01');
const BRANCH_GROSS_BUMP = new Date('2026-04-01');
const KYLE_OVERRIDE_BPS = 0.1;
function branchGrossBpsFor(closeDate) {
  if (!closeDate) return 0;
  const d = new Date(closeDate);
  if (isNaN(d)) return 0;
  if (d < BRANCH_GROSS_START) return 0;
  if (d >= BRANCH_GROSS_BUMP) return 0.3;
  return 0.1;
}
const computeBranchGross = (amt, closeDate) =>
  Math.round(((amt || 0) * branchGrossBpsFor(closeDate)) / 100 * 100) / 100;

const RATE_BUCKETS = [
  { label: 'All', min: null, max: null },
  { label: '< 5.00%', min: 0, max: 4.999 },
  { label: '5.00–5.49%', min: 5.0, max: 5.499 },
  { label: '5.50–5.99%', min: 5.5, max: 5.999 },
  { label: '6.00–6.49%', min: 6.0, max: 6.499 },
  { label: '6.50–6.99%', min: 6.5, max: 6.999 },
  { label: '7.00%+', min: 7.0, max: 99 },
];

function inRateBucket(rate, bucketLabel) {
  if (bucketLabel === 'All') return true;
  if (rate == null) return false;
  const b = RATE_BUCKETS.find((x) => x.label === bucketLabel);
  if (!b) return true;
  return rate >= b.min && rate <= b.max;
}

// Build INCOME rows from the canonical funded ledger (historical
// PAST_CLIENTS plus anything in LOANS that's been marked Funded). All
// Loans and Income & Comp share this source so unit counts agree.
function buildIncome() {
  return getAllFunded().map((pc) => {
    const lo = pc.lo || 'Kyle';
    return {
      client: pc.name,
      date: pc.closeDate,
      status: 'Funded',
      lo,
      amount: pc.amount || 0,
      bps: loBpsFor(lo),
      loGross: null,
      branchGross: computeBranchGross(pc.amount, pc.closeDate),
      loaFee: 0,
      concessions: 0,
      loNet: null,
      branchNet: 0,
      month: pc.month || '',
      year: pc.year || null,
      rate: pc.rate || null,
    };
  });
}

// All-time totals are derived from the live funded ledger so they don't
// drift as new loans fund. See computeAllTimeTotals usage below.
function computeAllTimeTotals(rows) {
  return rows.reduce(
    (acc, r) => ({
      totalUnits: acc.totalUnits + 1,
      totalVolume: acc.totalVolume + (r.amount || 0),
      totalLONet: acc.totalLONet + getIncomeNet(r),
      totalBranchNet: acc.totalBranchNet + (r.branchNet || 0),
    }),
    { totalUnits: 0, totalVolume: 0, totalLONet: 0, totalBranchNet: 0 }
  );
}

const getIncomeGross = (r) =>
  r.loGross != null
    ? r.loGross
    : Math.round(((r.amount || 0) * (r.bps || 0)) / 100 * 100) / 100;
const getIncomeNet = (r) =>
  r.loNet != null ? r.loNet : getIncomeGross(r) - (r.loaFee || 0) - (r.concessions || 0);
const isGrossManual = (r) => r.loGross != null;
const isNetManual = (r) => r.loNet != null;
const incomeRate = (r) => r.rate;
const getBranchMgrOverride = (r) => {
  if (r.lo !== 'Missy') return 0;
  return Math.round(((r.amount || 0) * KYLE_OVERRIDE_BPS) / 100 * 100) / 100;
};

function IncomeBlocked() {
  return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Restricted — Branch Manager only.</div>;
}

export default function Income() {
  // Defense in depth: if a non-branch-manager somehow reaches this
  // component (router guard bypassed), refuse to render the data.
  if (!isBranchManager()) return <IncomeBlocked />;
  return <IncomeInner />;
}

function IncomeInner() {
  // rows are derived from the canonical funded ledger and rebuilt whenever
  // a loan funds in the live pipeline (including realtime updates from
  // teammates). User-cell edits below are ephemeral (no persistence), so
  // a rebuild dropping them isn't a regression — it just keeps the
  // numbers honest with the rest of the app.
  const [rows, setRows] = useState(buildIncome);
  const rebuildRows = useCallback(() => setRows(buildIncome()), []);
  useEffect(() => subscribeLoans(rebuildRows), [rebuildRows]);
  const allTimeTotals = useMemo(() => computeAllTimeTotals(rows), [rows]);

  const [filters, setFilters] = useState({
    year: 'All',
    month: 'All',
    status: 'All',
    lo: 'All',
    rate: 'All',
  });

  const kyleIncome = useMemo(
    () => rows.filter((r) => r.status !== 'Adversed' && r.lo === 'Kyle'),
    [rows]
  );
  const missyIncome = useMemo(
    () => rows.filter((r) => r.status !== 'Adversed' && r.lo === 'Missy'),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows
      .filter((r) => r.status !== 'Adversed')
      .filter((r) => {
        if (filters.year !== 'All' && r.year !== parseInt(filters.year)) return false;
        if (filters.month !== 'All' && r.month !== filters.month) return false;
        if (filters.status !== 'All' && r.status !== filters.status) return false;
        if (filters.lo !== 'All' && r.lo !== filters.lo) return false;
        if (!inRateBucket(incomeRate(r), filters.rate)) return false;
        return true;
      });
  }, [rows, filters]);

  const sumLoanAmt = filtered.reduce((a, r) => a + (r.amount || 0), 0);
  const sumLONet = filtered.reduce((a, r) => a + getIncomeNet(r), 0);
  const sumBranchGross = filtered.reduce((a, r) => a + (r.branchGross || 0), 0);
  const sumBranchMgrOverride = filtered.reduce(
    (a, r) => a + getBranchMgrOverride(r),
    0
  );
  const sumBranchNet = filtered.reduce((a, r) => a + (r.branchNet || 0), 0);

  const years = [...new Set(rows.map((r) => r.year).filter((y) => y != null))].sort().reverse();
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  // Month-over-month KPI block
  const now = new Date();
  const thisM = now.getMonth();
  const thisY = now.getFullYear();
  const prev = new Date(thisY, thisM - 1, 1);
  const next = new Date(thisY, thisM + 1, 1);

  function kyleStats(mIdx, yr) {
    const mName = MONTH_NAMES[mIdx];
    const kyleRows = kyleIncome.filter((r) => r.month === mName && r.year === yr);
    const volume = kyleRows.reduce((a, r) => a + (r.amount || 0), 0);
    const units = kyleRows.length;
    const loGross = kyleRows.reduce((a, r) => a + getIncomeGross(r), 0);
    const missyRows = missyIncome.filter((r) => r.month === mName && r.year === yr);
    const missyVolume = missyRows.reduce((a, r) => a + (r.amount || 0), 0);
    const missyUnits = missyRows.length;
    const override = missyRows.reduce((a, r) => a + getBranchMgrOverride(r), 0);
    return { volume, units, loGross, missyVolume, missyUnits, override, total: loGross + override };
  }

  function kyleProjected(mIdx, yr) {
    const upcoming = LOANS.filter((l) => {
      if (l.archived || l.status === 'Adversed') return false;
      if (!l.closeDate) return false;
      const d = new Date(l.closeDate);
      return (
        !isNaN(d) &&
        d.getMonth() === mIdx &&
        d.getFullYear() === yr &&
        l.stage !== 'funded' &&
        l.stage !== 'cold'
      );
    });
    const kyleUp = upcoming.filter((l) => l.lo === 'Kyle');
    const missyUp = upcoming.filter((l) => l.lo === 'Missy');
    const volume = kyleUp.reduce((a, l) => a + (l.amount || 0), 0);
    const units = kyleUp.length;
    const loGross = volume * 0.013;
    const missyVolume = missyUp.reduce((a, l) => a + (l.amount || 0), 0);
    const missyUnits = missyUp.length;
    const override = (missyVolume * KYLE_OVERRIDE_BPS) / 100;
    return { volume, units, loGross, missyVolume, missyUnits, override, total: loGross + override };
  }

  const last = kyleStats(prev.getMonth(), prev.getFullYear());
  const cur = kyleStats(thisM, thisY);
  const nxt = kyleProjected(next.getMonth(), next.getFullYear());

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const resetFilters = () =>
    setFilters({ year: 'All', month: 'All', status: 'All', lo: 'All', rate: 'All' });

  const updateRow = (idx, field, value) => {
    const num = parseFloat(value);
    setRows((rs) => {
      const n = [...rs];
      n[idx] = { ...n[idx], [field]: isNaN(num) ? 0 : num };
      return n;
    });
  };

  const updateRowOverride = (idx, field, value) => {
    const num = parseFloat(value);
    setRows((rs) => {
      const n = [...rs];
      n[idx] = { ...n[idx], [field]: isNaN(num) ? null : num };
      return n;
    });
  };

  const resetRowField = (idx, field) => {
    setRows((rs) => {
      const n = [...rs];
      n[idx] = { ...n[idx], [field]: null };
      return n;
    });
  };

  return (
    <div>
      <div className="restricted-banner">
        <div>
          <div className="restricted-banner-title">Restricted · Kyle Duke Only</div>
          <div className="restricted-banner-sub">
            This view will be auth-gated to Kyle’s account in the live build. LO compensation ·
            not visible to team members or clients.
          </div>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <KyleTile label="Last Month" dt={prev} s={last} projected={false} />
        <KyleTile label="This Month" dt={now} s={cur} projected={false} />
        <KyleTile label="Next Month" dt={next} s={nxt} projected={true} />
      </div>

      <PipelineMonth label={`Last Month · ${MONTH_NAMES[prev.getMonth()]} ${prev.getFullYear()}`} mIdx={prev.getMonth()} yr={prev.getFullYear()} />
      <PipelineMonth label={`This Month · ${MONTH_NAMES[thisM]} ${thisY}`} mIdx={thisM} yr={thisY} />
      <PipelineMonth label={`Next Month · ${MONTH_NAMES[next.getMonth()]} ${next.getFullYear()}`} mIdx={next.getMonth()} yr={next.getFullYear()} />

      <div className="income-filters">
        <FilterDropdown label="Year" value={filters.year} options={['All', ...years.map(String)]} onChange={(v) => setFilter('year', v)} />
        <FilterDropdown label="Month" value={filters.month} options={['All', ...months]} onChange={(v) => setFilter('month', v)} />
        <FilterDropdown label="Status" value={filters.status} options={['All', 'Funded', 'Adversed']} onChange={(v) => setFilter('status', v)} />
        <FilterDropdown label="LO" value={filters.lo} options={['All', ...new Set(rows.map((r) => r.lo))]} onChange={(v) => setFilter('lo', v)} />
        <FilterDropdown label="Rate" value={filters.rate} options={RATE_BUCKETS.map((b) => b.label)} onChange={(v) => setFilter('rate', v)} />
        <div
          className="income-filter"
          style={{ background: '#5a0e1a', cursor: 'pointer' }}
          onClick={resetFilters}
        >
          <span className="income-filter-label" style={{ color: '#fbb' }}>Reset</span>
        </div>
        <div className="muted" style={{ marginLeft: 'auto' }}>
          {filtered.length} of {rows.length} rows
        </div>
      </div>

      <div className="income-kpi-row-label">Filtered Totals</div>
      <div className="income-kpi-row" style={{ gridTemplateColumns: 'repeat(6,1fr)' }}>
        <div className="income-kpi">
          <div className="income-kpi-label">No. of Units</div>
          <div className="income-kpi-value">{filtered.length}</div>
        </div>
        <div className="income-kpi red">
          <div className="income-kpi-label">Sum of Loan Amount</div>
          <div className="income-kpi-value">{fmt$(sumLoanAmt)}</div>
        </div>
        <div className="income-kpi gray">
          <div className="income-kpi-label">Sum of LO Net</div>
          <div className="income-kpi-value">{fmt$(sumLONet)}</div>
        </div>
        <div className="income-kpi">
          <div className="income-kpi-label">Sum of Branch Gross</div>
          <div className="income-kpi-value">{fmt$(sumBranchGross)}</div>
        </div>
        <div className="income-kpi" style={{ background: '#eef4ff', color: '#1976d2' }}>
          <div className="income-kpi-label" style={{ color: '#1976d2' }}>
            Sum of Branch Mgr Override
          </div>
          <div className="income-kpi-value">{fmt$(sumBranchMgrOverride)}</div>
        </div>
        <div className="income-kpi">
          <div className="income-kpi-label">Sum of Branch Net</div>
          <div className="income-kpi-value">{fmt$(sumBranchNet)}</div>
        </div>
      </div>

      <div className="income-kpi-row-label">All-Time Totals (unfiltered)</div>
      <div className="income-kpi-row">
        <div className="income-kpi red">
          <div className="income-kpi-label">Total Volume Funded</div>
          <div className="income-kpi-value">{fmt$M(allTimeTotals.totalVolume)}</div>
        </div>
        <div className="income-kpi dark">
          <div className="income-kpi-label">Total LO Net</div>
          <div className="income-kpi-value">{fmt$(allTimeTotals.totalLONet)}</div>
        </div>
        <div className="income-kpi">
          <div className="income-kpi-label">Total Branch Net</div>
          <div className="income-kpi-value">{fmt$(allTimeTotals.totalBranchNet)}</div>
        </div>
        <div className="income-kpi dark">
          <div className="income-kpi-label">Total Units Closed</div>
          <div className="income-kpi-value">{allTimeTotals.totalUnits}</div>
        </div>
      </div>

      <details
        style={{
          background: '#fff8e1',
          border: '1px solid #f5e3a1',
          color: '#7a6300',
          borderRadius: 6,
          fontSize: 11,
          marginBottom: 14,
        }}
      >
        <summary
          style={{
            padding: '10px 14px',
            cursor: 'pointer',
            fontFamily: "'Oswald',sans-serif",
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            fontWeight: 700,
            listStyle: 'none',
          }}
        >
          Comp Formulas
        </summary>
        <div style={{ padding: '0 14px 12px' }}>
          <strong>LO Gross</strong> = Loan Amount × BPs% (Kyle 130 bps · Missy 120 bps) — editable.{' '}
          <strong>LO Net</strong> = LO Gross − LOA Fee − Concessions.
          <br />
          <strong>Branch Gross</strong> = 10 bps × Loan Amount (30 bps for closings on/after Apr 2026; branch-level revenue, <em>not</em>{' '}
          Kyle's personal pay).{' '}
          <strong style={{ color: '#1976d2' }}>Branch Mgr Override</strong> ={' '}
          <strong>Kyle's personal pay</strong>, 10 bps × Missy's loan amount (not paid on his own
          loans). Separate from Branch Gross / Branch Net.
          <br />
          <span style={{ color: '#1976d2' }}>■ Auto (blue italic)</span> = formula-driven.{' '}
          <span style={{ color: '#7a6300' }}>■ Manual (bold yellow)</span> = you typed a value
          directly. Click ↻ to reset to auto.
        </div>
      </details>

      <div className="section-card">
        <div className="section-header">
          <div className="section-title">Loan Income Detail</div>
          <div className="section-sub">{filtered.length} rows · click any cell to edit</div>
        </div>
        <div className="section-body" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="income-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Closing</th>
                <th>Status</th>
                <th>LO</th>
                <th>Loan Amount</th>
                <th>BPs</th>
                <th>LO Gross</th>
                <th>Branch Gross</th>
                <th title="Kyle's Branch Manager Override — 10 bps on Missy's loans">
                  Branch Mgr Override
                </th>
                <th>LOA Fee</th>
                <th>Concessions</th>
                <th>LO Net</th>
                <th>Branch Net</th>
                <th>Month</th>
                <th>Year</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const idx = rows.indexOf(r);
                const gross = getIncomeGross(r);
                const net = getIncomeNet(r);
                const gManual = isGrossManual(r);
                const nManual = isNetManual(r);
                const bmo = getBranchMgrOverride(r);
                return (
                  <tr key={idx}>
                    <td><strong>{r.client}</strong></td>
                    <td>{r.date}</td>
                    <td>
                      <span className={`status-pill ${r.status.toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>{r.lo}</td>
                    <td className="num money">
                      <input
                        type="number"
                        value={r.amount || 0}
                        onChange={(e) => updateRow(idx, 'amount', e.target.value)}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        step="0.01"
                        value={r.bps || 0}
                        onChange={(e) => updateRow(idx, 'bps', e.target.value)}
                      />
                    </td>
                    <td
                      className={`num money ${gManual ? 'manual' : 'auto'}`}
                      title={
                        gManual
                          ? 'Manual override (click ↻ to reset to formula)'
                          : 'Auto: Loan Amount × BPs%'
                      }
                    >
                      <input
                        type="number"
                        step="0.01"
                        value={gross.toFixed(2)}
                        onChange={(e) => updateRowOverride(idx, 'loGross', e.target.value)}
                      />
                      {gManual ? (
                        <button
                          className="reset-btn"
                          onClick={() => resetRowField(idx, 'loGross')}
                          title="Reset to formula"
                        >
                          ↻
                        </button>
                      ) : null}
                    </td>
                    <td className="num money">
                      <input
                        type="number"
                        step="0.01"
                        value={r.branchGross || 0}
                        onChange={(e) => updateRow(idx, 'branchGross', e.target.value)}
                      />
                    </td>
                    <td
                      className="num money"
                      style={{
                        background: bmo > 0 ? '#eef4ff' : '#fafafa',
                        color: bmo > 0 ? '#1976d2' : '#bbb',
                        fontWeight: bmo > 0 ? 700 : 400,
                      }}
                      title="Kyle's Branch Manager Override — 10 bps on Missy's loans only. Formula, not editable."
                    >
                      {bmo > 0 ? fmt$(bmo) : '—'}
                    </td>
                    <td className="num money">
                      <input
                        type="number"
                        step="0.01"
                        value={r.loaFee || 0}
                        onChange={(e) => updateRow(idx, 'loaFee', e.target.value)}
                      />
                    </td>
                    <td className="num money">
                      <input
                        type="number"
                        step="0.01"
                        value={r.concessions || 0}
                        onChange={(e) => updateRow(idx, 'concessions', e.target.value)}
                      />
                    </td>
                    <td
                      className={`num money ${nManual ? 'manual' : 'auto'}`}
                      title={
                        nManual
                          ? 'Manual override (click ↻ to reset to formula)'
                          : 'Auto: LO Gross − LOA Fee − Concessions'
                      }
                    >
                      <input
                        type="number"
                        step="0.01"
                        value={net.toFixed(2)}
                        onChange={(e) => updateRowOverride(idx, 'loNet', e.target.value)}
                      />
                      {nManual ? (
                        <button
                          className="reset-btn"
                          onClick={() => resetRowField(idx, 'loNet')}
                          title="Reset to formula"
                        >
                          ↻
                        </button>
                      ) : null}
                    </td>
                    <td className="num money">
                      <input
                        type="number"
                        step="0.01"
                        value={r.branchNet || 0}
                        onChange={(e) => updateRow(idx, 'branchNet', e.target.value)}
                      />
                    </td>
                    <td>{r.month}</td>
                    <td>{r.year}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function KyleTile({ label, dt, s, projected }) {
  return (
    <div className="kpi" style={projected ? { borderTopColor: '#1976d2' } : undefined}>
      <div className="kpi-label">
        {label} · {MONTH_NAMES[dt.getMonth()]} {dt.getFullYear()}
        {projected ? ' (Projected)' : ''}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          marginTop: 8,
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              fontWeight: 700,
            }}
          >
            Volume
          </div>
          <div
            style={{
              fontFamily: "'Oswald',sans-serif",
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--brand-red)',
            }}
          >
            {fmt$M(s.volume)}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              fontWeight: 700,
            }}
          >
            Units
          </div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 17, fontWeight: 700 }}>
            {s.units}
          </div>
        </div>
        <div>
          <div
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              fontWeight: 700,
            }}
          >
            LO Gross
          </div>
          <div
            style={{
              fontFamily: "'Oswald',sans-serif",
              fontSize: 17,
              fontWeight: 700,
              color: '#2e7d32',
            }}
          >
            {fmt$(Math.round(s.loGross))}
          </div>
        </div>
      </div>
      <div
        style={{
          borderTop: '1px dashed #e5e5e8',
          paddingTop: 8,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              fontWeight: 700,
            }}
          >
            Branch Mgr Override (10 bps)
          </div>
          <div
            style={{
              fontFamily: "'Oswald',sans-serif",
              fontSize: 14,
              fontWeight: 700,
              color: '#1976d2',
            }}
          >
            {fmt$(Math.round(s.override))}
          </div>
          <div style={{ fontSize: 9, color: '#aaa', marginTop: 1 }}>
            {s.missyUnits} Missy unit{s.missyUnits !== 1 ? 's' : ''} · {fmt$M(s.missyVolume)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '.4px',
              fontWeight: 700,
            }}
          >
            Kyle's Total Earnings
          </div>
          <div
            style={{
              fontFamily: "'Oswald',sans-serif",
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--brand-red)',
            }}
          >
            {fmt$(Math.round(s.total))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-loan breakdown for a given month: still-active pipeline loans for
// the month plus everything that's already funded for the month from the
// canonical funded ledger (LOANS-funded + PAST_CLIENTS historical, deduped).
// Grouped by LO with per-group subtotals and a grand total.
function PipelineMonth({ label, mIdx, yr, defaultOpen = false }) {
  const matchesMonth = (closeDate) => {
    if (!closeDate) return false;
    const d = new Date(closeDate);
    return !isNaN(d) && d.getMonth() === mIdx && d.getFullYear() === yr;
  };

  // In-flight pipeline (anything still active in LOANS for this month).
  const inFlight = LOANS
    .filter((l) =>
      !l.archived && l.status !== 'Adversed' && l.stage !== 'cold' &&
      l.stage !== 'funded' && (l.status || '') !== 'Funded' &&
      matchesMonth(l.closeDate)
    )
    .map((l) => ({
      key: `loan-${l.id}`,
      name: l.borrower || '',
      closeDate: l.closeDate,
      amount: l.amount || 0,
      lo: l.lo || '',
      agent: l.agent || '',
      status: l.status || l.stage || '—',
    }));

  // Funded ledger (LOANS-funded + PAST_CLIENTS historical, deduped).
  const funded = getAllFunded()
    .filter((r) => matchesMonth(r.closeDate))
    .map((r, i) => ({
      key: `funded-${r.id || r.name}-${r.closeDate}-${i}`,
      name: r.name || '',
      closeDate: r.closeDate,
      amount: r.amount || 0,
      lo: r.lo || 'Kyle',
      agent: r.agent || '',
      status: 'Funded',
    }));

  const all = [...inFlight, ...funded].sort(
    (a, b) => new Date(a.closeDate) - new Date(b.closeDate)
  );

  const loGrossBps = (r) => (r.lo === 'Missy' ? 0.012 : 0.013);
  const loGross = (r) => (r.amount || 0) * loGrossBps(r);
  const branchGross = (r) => computeBranchGross(r.amount, r.closeDate);
  const branchMgrOverride = (r) => (r.lo === 'Missy' ? (r.amount || 0) * 0.001 : 0);

  const sumGroup = (rows) => rows.reduce(
    (acc, r) => ({
      units: acc.units + 1,
      amt: acc.amt + (r.amount || 0),
      lo: acc.lo + loGross(r),
      branch: acc.branch + branchGross(r),
      override: acc.override + branchMgrOverride(r),
    }),
    { units: 0, amt: 0, lo: 0, branch: 0, override: 0 }
  );

  const kyleRows = all.filter((r) => r.lo === 'Kyle');
  const missyRows = all.filter((r) => r.lo === 'Missy');
  const otherRows = all.filter((r) => r.lo !== 'Kyle' && r.lo !== 'Missy');
  const kyleTot = sumGroup(kyleRows);
  const missyTot = sumGroup(missyRows);
  const otherTot = sumGroup(otherRows);
  const grand = sumGroup(all);

  const COLSPAN = 9;

  const renderRow = (r) => (
    <tr key={r.key}>
      <td>{r.name}</td>
      <td>{r.closeDate}</td>
      <td>{r.status || '—'}</td>
      <td>{r.lo || '—'}</td>
      <td>{r.agent || '—'}</td>
      <td className="num">{fmt$(r.amount || 0)}</td>
      <td className="num">{fmt$(Math.round(loGross(r)))}</td>
      <td className="num">{fmt$(Math.round(branchGross(r)))}</td>
      <td className="num">{branchMgrOverride(r) > 0 ? fmt$(Math.round(branchMgrOverride(r))) : '—'}</td>
    </tr>
  );

  const renderSubtotal = (label, t, bg) => (
    <tr style={{ fontWeight: 700, background: bg }}>
      <td colSpan={5} style={{ textAlign: 'right' }}>{label} subtotal · {t.units} unit{t.units === 1 ? '' : 's'}</td>
      <td className="num">{fmt$(Math.round(t.amt))}</td>
      <td className="num">{fmt$(Math.round(t.lo))}</td>
      <td className="num">{fmt$(Math.round(t.branch))}</td>
      <td className="num">{fmt$(Math.round(t.override))}</td>
    </tr>
  );

  return (
    <details open={defaultOpen} className="section-card" style={{ marginBottom: 14 }}>
      <summary
        className="section-header"
        style={{ cursor: 'pointer', listStyle: 'none', display: 'block' }}
      >
        <div className="section-title">{label}</div>
        <div className="section-sub">
          {grand.units} unit{grand.units === 1 ? '' : 's'} · {fmt$M(grand.amt)} volume
          {kyleTot.units > 0 && (
            <> · Kyle: {kyleTot.units} · {fmt$(Math.round(kyleTot.lo))} gross</>
          )}
          {missyTot.units > 0 && (
            <> · Missy: {missyTot.units} · {fmt$(Math.round(missyTot.lo))} gross · {fmt$(Math.round(missyTot.override))} override</>
          )}
        </div>
      </summary>
      <div className="section-body" style={{ padding: 0, overflowX: 'auto' }}>
        {all.length === 0 ? (
          <div style={{ padding: '14px 18px', color: '#888', fontSize: 12 }}>
            No loans with a close date in this month.
          </div>
        ) : (
          <table className="income-table">
            <thead>
              <tr>
                <th>Borrower</th>
                <th>Close Date</th>
                <th>Status</th>
                <th>LO</th>
                <th>Agent</th>
                <th className="num">Loan Amount</th>
                <th className="num">Est. LO Gross</th>
                <th className="num">Branch Gross</th>
                <th className="num">Branch Mgr Override</th>
              </tr>
            </thead>
            <tbody>
              {kyleRows.length > 0 && (
                <>
                  <tr style={{ background: '#fff8e1', fontWeight: 700 }}>
                    <td colSpan={COLSPAN} style={{ padding: '8px 12px', fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 11 }}>
                      Kyle
                    </td>
                  </tr>
                  {kyleRows.map(renderRow)}
                  {renderSubtotal('Kyle', kyleTot, '#fafafa')}
                </>
              )}
              {missyRows.length > 0 && (
                <>
                  <tr style={{ background: '#e3f2fd', fontWeight: 700 }}>
                    <td colSpan={COLSPAN} style={{ padding: '8px 12px', fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 11 }}>
                      Missy
                    </td>
                  </tr>
                  {missyRows.map(renderRow)}
                  {renderSubtotal('Missy', missyTot, '#fafafa')}
                </>
              )}
              {otherRows.length > 0 && (
                <>
                  <tr style={{ background: '#f5f5f5', fontWeight: 700 }}>
                    <td colSpan={COLSPAN} style={{ padding: '8px 12px', fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px', fontSize: 11 }}>
                      Other / Unassigned
                    </td>
                  </tr>
                  {otherRows.map(renderRow)}
                  {renderSubtotal('Other', otherTot, '#fafafa')}
                </>
              )}
              <tr style={{ fontWeight: 700, background: '#eaeaea' }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>Grand Total · {grand.units} unit{grand.units === 1 ? '' : 's'}</td>
                <td className="num">{fmt$(Math.round(grand.amt))}</td>
                <td className="num">{fmt$(Math.round(grand.lo))}</td>
                <td className="num">{fmt$(Math.round(grand.branch))}</td>
                <td className="num">{fmt$(Math.round(grand.override))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </details>
  );
}
