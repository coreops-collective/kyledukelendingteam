import { useMemo, useState, useEffect, useCallback } from 'react';
import { LOANS } from '../data/loans.js';
import FilterDropdown from '../components/FilterDropdown.jsx';
import { isBranchManager } from '../lib/auth.js';
import { getAllFunded } from '../lib/fundedLoans.js';
import { subscribeLoans } from '../lib/loansStore.js';
import { parseLocalDate } from '../lib/clientDates.js';
import Tour from '../components/Tour.jsx';

// ---- helpers (ported from legacy) ----
const fmt$ = (n) =>
  n == null ? '—' : '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmt$M = (n) =>
  n == null ? '—' : n >= 1e6 ? '$' + (n / 1e6).toFixed(2) + 'M' : '$' + (n / 1e3).toFixed(0) + 'K';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Branch gross date breakpoints:
//   before 2025-06-01       → 0 bps (no branch revenue)
//   2025-06-01 … 2026-03-31 → pre-bump rate (default 10 bps)
//   2026-04-01 onward       → post-bump rate (default 30 bps)
const BRANCH_GROSS_START = parseLocalDate('2025-06-01');
const BRANCH_GROSS_BUMP = parseLocalDate('2026-04-01');

// Default BPS assumptions. Kept as user-editable state in IncomeInner so
// Kyle can model different splits without a rebuild. All values are the
// classic mortgage "bps as integer" — 130 bps = 1.30% of loan amount.
const DEFAULT_BPS = {
  kyle: 130,
  missy: 120,
  override: 10,          // Kyle's override on Missy's loans
  branchGrossPre: 10,    // branch gross for closings before 2026-04-01
  branchGrossPost: 30,   // branch gross for closings on/after 2026-04-01
};
const BPS_STORAGE_KEY = 'kdt-income-bps';

// bps-as-integer → decimal fraction. 130 bps → 0.013.
const asFrac = (bps) => (Number.isFinite(+bps) ? +bps / 10000 : 0);

const loBpsFor = (lo, bps = DEFAULT_BPS) =>
  lo === 'Missy' ? +bps.missy / 100 : +bps.kyle / 100;

function branchGrossBpsFor(closeDate, bps = DEFAULT_BPS) {
  if (!closeDate) return 0;
  const d = parseLocalDate(closeDate);
  if (!d) return 0;
  if (d < BRANCH_GROSS_START) return 0;
  if (d >= BRANCH_GROSS_BUMP) return +bps.branchGrossPost / 100;
  return +bps.branchGrossPre / 100;
}
const computeBranchGross = (amt, closeDate, bps = DEFAULT_BPS) =>
  Math.round(((amt || 0) * branchGrossBpsFor(closeDate, bps)) / 100 * 100) / 100;

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
const getBranchMgrOverride = (r, bps = DEFAULT_BPS) => {
  if (r.lo !== 'Missy') return 0;
  return Math.round(((r.amount || 0) * (+bps.override / 100)) / 100 * 100) / 100;
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

  // Editable BPS assumptions. Persisted per browser so Kyle's what-if
  // splits survive reload. Drives BOTH the top three monthly tiles and
  // the per-loan pipeline breakdowns below — one lever to pull.
  const [bpsSettings, setBpsSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(BPS_STORAGE_KEY) || '{}');
      return { ...DEFAULT_BPS, ...saved };
    } catch { return { ...DEFAULT_BPS }; }
  });
  useEffect(() => {
    try { localStorage.setItem(BPS_STORAGE_KEY, JSON.stringify(bpsSettings)); } catch { /* full storage, fine */ }
  }, [bpsSettings]);
  const setBps = (key, value) => {
    const n = parseFloat(value);
    setBpsSettings((s) => ({ ...s, [key]: Number.isFinite(n) ? n : 0 }));
  };
  const resetBps = () => setBpsSettings({ ...DEFAULT_BPS });
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    const startTour = () => setTourOpen(true);
    window.addEventListener('kdt-start-tour', startTour);
    return () => window.removeEventListener('kdt-start-tour', startTour);
  }, []);
  const INCOME_TOUR_STEPS = [
    {
      title: 'Income & Comp — Branch Manager only',
      body: 'This is the compensation ledger. Every funded loan shows LO gross, LOA fee, concessions, LO net, and (for Kyle only) the branch-manager override on Missy\'s loans.\n\nRestricted to Branch Manager — Admin and LO can\'t see this page.',
    },
    {
      target: '[data-tour="bps-assumptions"]',
      title: 'BPS assumptions — one lever for everything',
      body: 'Every basis-point value the page uses lives in this bar. Change Kyle, Missy, the Kyle override on Missy, or either branch gross tier and every number below re-flows immediately — the three monthly tiles AND the per-loan pipeline breakdowns.\n\nYour edits are saved to your browser, so they stick between sessions. Hit ↻ Reset to snap back to the standard split (Kyle 130 / Missy 120 / Override 10 / Branch 10 → 30).',
    },
    {
      title: 'How the numbers are computed',
      body: 'LO Gross = loan amount × BPS (default 130 for Kyle, 120 for Missy — editable up top).\n\nBranch Gross is scaled by close date:\n  • Before Jun 2025 → 0 bps\n  • Jun 2025 to Mar 2026 → your "Branch Gross (< Apr)" value\n  • Apr 2026 onward → your "Branch Gross (Apr+)" value\n\nKyle\'s override on Missy\'s loans uses your "Kyle Override on Missy" value.',
    },
    {
      title: 'This month + next month + pipeline',
      body: 'The tiles at the top compare last / this / next month for both LOs — so you know at a glance whether the desk is on pace. Change any BPS above and the tile totals recompute instantly.',
    },
    {
      title: 'Per-loan pipeline breakdowns',
      body: 'The three collapsible sections show every loan closing that month, grouped by LO with per-group subtotals. In-flight loans come from the pipeline; Funded ones come from the funded ledger. Est. LO Gross, Branch Gross, and Branch Mgr Override columns all track the BPS bar at the top.',
    },
    {
      title: 'Per-row editing (bottom table)',
      body: 'The bottom table lets you override LO gross, LOA fee, and concessions on any row (useful when a real check comes in different from what BPS predicts). These per-row edits are ephemeral — they reset when the ledger rebuilds. For lasting comp adjustments, edit the loan directly.',
    },
    {
      title: 'Pair with Net Income Calculator',
      body: 'For after-tax paycheck math (federal + FICA + state, YTD progression by month), open the Net Income Calculator from the sidebar. Same source data, projected paycheck by paycheck through year end.',
    },
  ];
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
    (a, r) => a + getBranchMgrOverride(r, bpsSettings),
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

  // Tile stats for any month: count every non-adversed loan with a close
  // date in that month, regardless of stage. Funded loans come from the
  // canonical funded ledger (LOANS-funded + PAST_CLIENTS); still-active
  // pipeline loans come from the live LOANS list. Same logic powers the
  // collapsible breakdown below so the tile and the breakdown agree.
  function statsForMonth(mIdx, yr) {
    const matches = (cd) => {
      if (!cd) return false;
      const d = parseLocalDate(cd);
      return !!d && d.getMonth() === mIdx && d.getFullYear() === yr;
    };

    const inFlight = LOANS
      .filter((l) =>
        !l.archived && l.status !== 'Adversed' && l.stage !== 'cold' &&
        l.stage !== 'funded' && (l.status || '') !== 'Funded' &&
        matches(l.closeDate)
      )
      .map((l) => ({ amount: l.amount || 0, lo: l.lo || '' }));

    const funded = getAllFunded()
      .filter((r) => matches(r.closeDate))
      .map((r) => ({ amount: r.amount || 0, lo: r.lo || 'Kyle' }));

    const all = [...inFlight, ...funded];
    const kyle = all.filter((r) => r.lo === 'Kyle');
    const missy = all.filter((r) => r.lo === 'Missy');
    const volume = kyle.reduce((a, r) => a + r.amount, 0);
    const missyVolume = missy.reduce((a, r) => a + r.amount, 0);
    const loGross = volume * asFrac(bpsSettings.kyle);
    const override = missyVolume * asFrac(bpsSettings.override);
    return {
      volume,
      units: kyle.length,
      loGross,
      missyVolume,
      missyUnits: missy.length,
      override,
      total: loGross + override,
    };
  }

  const last = statsForMonth(prev.getMonth(), prev.getFullYear());
  const cur = statsForMonth(thisM, thisY);
  const nxt = statsForMonth(next.getMonth(), next.getFullYear());

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

      <div
        data-tour="bps-assumptions"
        style={{
          background: '#fff',
          border: '1px solid #e5e5e8',
          borderLeft: '4px solid var(--brand-red)',
          borderRadius: 8,
          padding: '10px 14px',
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--brand-black)' }}>
          BPS Assumptions
        </div>
        <BpsInput label="Kyle" value={bpsSettings.kyle} onChange={(v) => setBps('kyle', v)} title="Kyle's LO gross basis points (default 130 = 1.30%). Drives Kyle's tile Volume × BPS and Kyle rows in the pipeline breakdown below." />
        <BpsInput label="Missy" value={bpsSettings.missy} onChange={(v) => setBps('missy', v)} title="Missy's LO gross basis points (default 120). Drives Missy rows in the pipeline breakdown below." />
        <BpsInput label="Kyle Override on Missy" value={bpsSettings.override} onChange={(v) => setBps('override', v)} title="Kyle's branch manager override on Missy's loans (default 10 bps). Feeds Kyle's override tile + override column in the breakdown." />
        <BpsInput label={`Branch Gross (< Apr ${BRANCH_GROSS_BUMP.getFullYear()})`} value={bpsSettings.branchGrossPre} onChange={(v) => setBps('branchGrossPre', v)} title="Branch-level gross for closings before Apr 2026 (default 10 bps)." />
        <BpsInput label={`Branch Gross (Apr ${BRANCH_GROSS_BUMP.getFullYear()}+)`} value={bpsSettings.branchGrossPost} onChange={(v) => setBps('branchGrossPost', v)} title="Branch-level gross for closings Apr 2026 and after (default 30 bps)." />
        <button
          type="button"
          onClick={resetBps}
          style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid #d0d0d0', borderRadius: 6, padding: '6px 10px', fontSize: 11, fontFamily: "'Oswald',sans-serif", textTransform: 'uppercase', letterSpacing: '.5px', color: '#666', cursor: 'pointer' }}
          title="Reset all BPS values back to the standard split (Kyle 130 / Missy 120 / Override 10 / Branch 10→30)"
        >
          ↻ Reset
        </button>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <KyleTile label="Last Month" dt={prev} s={last} overrideBps={bpsSettings.override} projected={false} />
        <KyleTile label="This Month" dt={now} s={cur} overrideBps={bpsSettings.override} projected={false} />
        <KyleTile label="Next Month" dt={next} s={nxt} overrideBps={bpsSettings.override} projected={true} />
      </div>

      <PipelineMonth label={`Last Month · ${MONTH_NAMES[prev.getMonth()]} ${prev.getFullYear()}`} mIdx={prev.getMonth()} yr={prev.getFullYear()} bpsSettings={bpsSettings} />
      <PipelineMonth label={`This Month · ${MONTH_NAMES[thisM]} ${thisY}`} mIdx={thisM} yr={thisY} bpsSettings={bpsSettings} />
      <PipelineMonth label={`Next Month · ${MONTH_NAMES[next.getMonth()]} ${next.getFullYear()}`} mIdx={next.getMonth()} yr={next.getFullYear()} bpsSettings={bpsSettings} />

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
          <strong>LO Gross</strong> = Loan Amount × BPS% — Kyle and Missy BPS are set in the assumptions bar
          at the top of the page (defaults: Kyle 130 · Missy 120). Per-row LO Gross is also editable.{' '}
          <strong>LO Net</strong> = LO Gross − LOA Fee − Concessions.
          <br />
          <strong>Branch Gross</strong> = Branch Gross BPS × Loan Amount (defaults: 10 bps before Apr 2026, 30 bps after;
          both editable at the top). Branch-level revenue — <em>not</em> Kyle's personal pay.{' '}
          <strong style={{ color: '#1976d2' }}>Branch Mgr Override</strong> ={' '}
          <strong>Kyle's personal pay</strong>, "Kyle Override on Missy" BPS × Missy's loan amount
          (default 10 bps; not paid on Kyle's own loans). Separate from Branch Gross / Branch Net.
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
      {tourOpen && <Tour steps={INCOME_TOUR_STEPS} onClose={() => setTourOpen(false)} />}
    </div>
  );
}

function KyleTile({ label, dt, s, projected, overrideBps = DEFAULT_BPS.override }) {
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
            Branch Mgr Override ({overrideBps} bps)
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
function PipelineMonth({ label, mIdx, yr, bpsSettings = DEFAULT_BPS, defaultOpen = false }) {
  const matchesMonth = (closeDate) => {
    if (!closeDate) return false;
    const d = parseLocalDate(closeDate);
    return !!d && d.getMonth() === mIdx && d.getFullYear() === yr;
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

  const all = [...inFlight, ...funded].sort((a, b) => {
    const ad = parseLocalDate(a.closeDate);
    const bd = parseLocalDate(b.closeDate);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return ad - bd;
  });

  const loGrossBps = (r) => (r.lo === 'Missy' ? asFrac(bpsSettings.missy) : asFrac(bpsSettings.kyle));
  const loGross = (r) => (r.amount || 0) * loGrossBps(r);
  const branchGross = (r) => computeBranchGross(r.amount, r.closeDate, bpsSettings);
  const branchMgrOverride = (r) => (r.lo === 'Missy' ? (r.amount || 0) * asFrac(bpsSettings.override) : 0);

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

function BpsInput({ label, value, onChange, title }) {
  return (
    <label
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        color: '#555',
        fontFamily: "'Oswald',sans-serif",
        textTransform: 'uppercase',
        letterSpacing: '.4px',
      }}
    >
      <span>{label}</span>
      <input
        type="number"
        step="1"
        min="0"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: 62,
          padding: '5px 6px',
          border: '1px solid #d0d0d0',
          borderRadius: 5,
          fontSize: 13,
          fontFamily: "'Oswald',sans-serif",
          fontWeight: 700,
          textAlign: 'right',
          color: 'var(--brand-black)',
        }}
      />
      <span style={{ color: '#888', fontSize: 10 }}>bps</span>
    </label>
  );
}
