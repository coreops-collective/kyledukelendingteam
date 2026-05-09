import { useEffect, useState } from 'react';
import { isBranchManager } from '../lib/auth.js';
import { getAllFunded } from '../lib/fundedLoans.js';
import { LOANS } from '../data/loans.js';
import { subscribeLoans } from '../lib/loansStore.js';

// Mirror of the Income tab's per-LO comp formulas. Kyle's personal earnings
// = LO gross on his own loans + branch-manager override on Missy's loans.
const KYLE_BPS = 0.013;            // 130 bps on Kyle's loans
const MISSY_OVERRIDE_BPS = 0.001;  // 10 bps on Missy's loans (Kyle's override)

const fmt$ = (n) => (n == null || isNaN(n) ? '—' : '$' + Math.round(n).toLocaleString('en-US'));
const fmtPct = (n) => `${(n * 100).toFixed(1)}%`;

// 2026 IRS-projected federal brackets. Defaults; not editable in the UI but
// clearly noted so the user knows what's being applied.
const FEDERAL_BRACKETS = {
  single: [
    { upTo: 12150,    rate: 0.10 },
    { upTo: 49450,    rate: 0.12 },
    { upTo: 105700,   rate: 0.22 },
    { upTo: 201775,   rate: 0.24 },
    { upTo: 256225,   rate: 0.32 },
    { upTo: 640600,   rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { upTo: 24300,    rate: 0.10 },
    { upTo: 98900,    rate: 0.12 },
    { upTo: 211400,   rate: 0.22 },
    { upTo: 403550,   rate: 0.24 },
    { upTo: 512450,   rate: 0.32 },
    { upTo: 768700,   rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { upTo: 17350,    rate: 0.10 },
    { upTo: 66150,    rate: 0.12 },
    { upTo: 105700,   rate: 0.22 },
    { upTo: 201775,   rate: 0.24 },
    { upTo: 256225,   rate: 0.32 },
    { upTo: 640600,   rate: 0.35 },
    { upTo: Infinity, rate: 0.37 },
  ],
};

const STATUS_LABEL = {
  single: 'Single',
  married_jointly: 'Married — Joint',
  head_of_household: 'Head of Household',
};

const DEFAULT_STD_DEDUCTION = {
  single: 16100,
  married_jointly: 32200,
  head_of_household: 24150,
};

// 2026 SSA wage base (estimated). Editable below would be overkill; this
// only matters for incomes ≤ ~$182k anyway.
const SS_WAGE_BASE = 182400;
const ADDL_MEDICARE_THRESHOLD = {
  single: 200000,
  married_jointly: 250000,
  head_of_household: 200000,
};
const ADDL_MEDICARE_RATE = 0.009;

// Child Tax Credit (post-OBBBA). $2,200/qualifying-child for 2025+ with
// minor inflation adjustments thereafter; $500 for "other dependents."
// Both phase out together: $50 reduction per $1,000 (or fraction) over
// the AGI threshold for filing status.
const CTC_PER_CHILD = 2200;
const ODC_PER_DEP = 500;
const CTC_PHASEOUT_THRESHOLD = {
  single: 200000,
  married_jointly: 400000,
  head_of_household: 200000,
};

function calcChildTaxCredit(numChildren, numOtherDeps, agi, filingStatus) {
  const baseCredit = (numChildren || 0) * CTC_PER_CHILD + (numOtherDeps || 0) * ODC_PER_DEP;
  if (baseCredit <= 0) return 0;
  const threshold = CTC_PHASEOUT_THRESHOLD[filingStatus] || 200000;
  const over = Math.max(0, agi - threshold);
  // Round excess up to next $1,000 increment, then $50 per increment.
  const reduction = Math.ceil(over / 1000) * 50;
  return Math.max(0, baseCredit - reduction);
}

function calcFederalTax(taxable, brackets) {
  if (taxable <= 0) return 0;
  let tax = 0;
  let prev = 0;
  for (const { upTo, rate } of brackets) {
    const slab = Math.min(taxable, upTo) - prev;
    if (slab > 0) tax += slab * rate;
    if (taxable <= upTo) return tax;
    prev = upTo;
  }
  return tax;
}

function calcMarginalRate(taxable, brackets) {
  if (taxable <= 0) return brackets[0].rate;
  for (const b of brackets) if (taxable <= b.upTo) return b.rate;
  return brackets[brackets.length - 1].rate;
}

function calcFica(wages, mode, filingStatus) {
  if (mode === 'none' || wages <= 0) {
    return { ss: 0, medicare: 0, addlMedicare: 0, total: 0 };
  }
  const ssRate = mode === 'self_employed' ? 0.124 : 0.062;
  const mcRate = mode === 'self_employed' ? 0.029 : 0.0145;
  const ss = Math.min(wages, SS_WAGE_BASE) * ssRate;
  const medicare = wages * mcRate;
  const threshold = ADDL_MEDICARE_THRESHOLD[filingStatus] || 200000;
  const addlMedicare = Math.max(0, wages - threshold) * ADDL_MEDICARE_RATE;
  return { ss, medicare, addlMedicare, total: ss + medicare + addlMedicare };
}

function kyleGrossInRange(funded, from, to) {
  return funded.reduce((acc, r) => {
    if (!r.closeDate) return acc;
    const d = new Date(r.closeDate);
    if (isNaN(d) || d < from || d > to) return acc;
    if (r.lo === 'Kyle') return acc + (r.amount || 0) * KYLE_BPS;
    if (r.lo === 'Missy') return acc + (r.amount || 0) * MISSY_OVERRIDE_BPS;
    return acc;
  }, 0);
}

function pipelineGrossInRange(loans, from, to) {
  return loans.reduce((acc, l) => {
    if (l.archived || l.status === 'Adversed' || l.stage === 'cold') return acc;
    if (l.stage === 'funded' || l.status === 'Funded') return acc;
    if (!l.closeDate) return acc;
    const d = new Date(l.closeDate);
    if (isNaN(d) || d < from || d > to) return acc;
    if (l.lo === 'Kyle') return acc + (l.amount || 0) * KYLE_BPS;
    if (l.lo === 'Missy') return acc + (l.amount || 0) * MISSY_OVERRIDE_BPS;
    return acc;
  }, 0);
}

// Walk Kyle's funded loans for the year in close-date order, treating each
// one as a paycheck. For each, compute the marginal federal/FICA/state tax
// slice on TOP of the running YTD total — so the per-paycheck tax reflects
// the bracket Kyle is actually in when that loan funds (not a flat rate).
// CTC is intentionally not pro-rated here; it's an annual credit applied
// at filing, so per-paycheck "net" matches what hits the bank account.
function computePaychecks(funded, year, opts) {
  const { brackets, stdDeduction, preTax, ficaMode, filingStatus, stateRate } = opts;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const inYear = funded
    .filter((r) => {
      if (!r.closeDate) return false;
      const d = new Date(r.closeDate);
      return !isNaN(d) && d >= yearStart && d <= yearEnd;
    })
    .map((r) => {
      let gross = 0;
      if (r.lo === 'Kyle') gross = (r.amount || 0) * KYLE_BPS;
      else if (r.lo === 'Missy') gross = (r.amount || 0) * MISSY_OVERRIDE_BPS;
      return { name: r.name, closeDate: r.closeDate, lo: r.lo, gross };
    })
    .filter((r) => r.gross > 0)
    .sort((a, b) => new Date(a.closeDate) - new Date(b.closeDate));

  let cum = 0;
  const ssRate = ficaMode === 'self_employed' ? 0.124 : ficaMode === 'w2' ? 0.062 : 0;
  const mcRate = ficaMode === 'self_employed' ? 0.029 : ficaMode === 'w2' ? 0.0145 : 0;
  const addlThreshold = ADDL_MEDICARE_THRESHOLD[filingStatus] || 200000;

  return inYear.map((r) => {
    const before = cum;
    cum += r.gross;

    const taxableBefore = Math.max(0, before - preTax - stdDeduction);
    const taxableAfter = Math.max(0, cum - preTax - stdDeduction);
    const fed = calcFederalTax(taxableAfter, brackets) - calcFederalTax(taxableBefore, brackets);

    const ss = (Math.min(cum, SS_WAGE_BASE) - Math.min(before, SS_WAGE_BASE)) * ssRate;
    const medicare = r.gross * mcRate;
    const addl = (Math.max(0, cum - addlThreshold) - Math.max(0, before - addlThreshold)) * ADDL_MEDICARE_RATE;
    const fica = ss + medicare + addl;

    const state = r.gross * (stateRate / 100);
    const tax = fed + fica + state;
    const net = r.gross - tax;
    return { ...r, fed, fica, state, tax, net, takeHomeRate: r.gross > 0 ? net / r.gross : 0 };
  });
}

function Blocked() {
  return <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Restricted — Branch Manager only.</div>;
}

export default function NetIncomeCalc() {
  if (!isBranchManager()) return <Blocked />;
  return <Inner />;
}

function Inner() {
  // Re-render when the loan store fires (new fundings, edits, realtime).
  const [, setTick] = useState(0);
  useEffect(() => subscribeLoans(() => setTick((t) => t + 1)), []);

  // Anchor "today" once per mount so date math is stable across re-renders.
  const [today] = useState(() => new Date());
  const year = today.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

  const funded = getAllFunded();
  const ytdFundedGross = kyleGrossInRange(funded, yearStart, today);
  const restOfYearPipeline = pipelineGrossInRange(LOANS, today, yearEnd);
  const projectedEoyGross = ytdFundedGross + restOfYearPipeline;

  const [filingStatus, setFilingStatus] = useState('married_jointly');
  const [stdDeduction, setStdDeduction] = useState(DEFAULT_STD_DEDUCTION.married_jointly);
  const [stdTouched, setStdTouched] = useState(false);
  const [preTax, setPreTax] = useState(0);
  const [otherIncome, setOtherIncome] = useState(0);
  // Florida: 0% state income tax. Hillsborough County levies no local
  // income tax either, so this defaults to 0 and the field is mostly a
  // safety valve for future moves.
  const [stateRate, setStateRate] = useState(0);
  const [ficaMode, setFicaMode] = useState('w2');
  const [overrideGross, setOverrideGross] = useState('');
  const [taxesWithheldYtd, setTaxesWithheldYtd] = useState(0);
  const [numChildren, setNumChildren] = useState(3);
  const [numOtherDeps, setNumOtherDeps] = useState(0);

  // Reset std deduction to status default if the user hasn't manually edited it.
  useEffect(() => {
    if (!stdTouched) {
      setStdDeduction(DEFAULT_STD_DEDUCTION[filingStatus] || DEFAULT_STD_DEDUCTION.single);
    }
  }, [filingStatus, stdTouched]);

  const overrideNum = parseFloat(overrideGross);
  const baseGrossYtd = overrideGross !== '' && !isNaN(overrideNum) ? overrideNum : ytdFundedGross;
  const ytdGross = baseGrossYtd + (otherIncome || 0);

  const brackets = FEDERAL_BRACKETS[filingStatus] || FEDERAL_BRACKETS.single;
  const taxableYtd = Math.max(0, ytdGross - (preTax || 0) - (stdDeduction || 0));
  const fedYtdGross = calcFederalTax(taxableYtd, brackets);
  // CTC is an annual credit applied against the year-end liability, but
  // for paystub-level YTD we apportion it against YTD federal so the
  // YTD net reflects the credit Kyle will eventually claim. Phaseout is
  // calculated against AGI (gross − pre-tax), not taxable income.
  const ytdAgi = Math.max(0, ytdGross - (preTax || 0));
  const ctcYtd = calcChildTaxCredit(numChildren, numOtherDeps, ytdAgi, filingStatus);
  const fedYtd = Math.max(0, fedYtdGross - ctcYtd);
  const stateYtd = ytdGross * ((stateRate || 0) / 100);
  const ficaYtd = calcFica(ytdGross, ficaMode, filingStatus);
  const totalTaxYtd = fedYtd + stateYtd + ficaYtd.total;
  const netYtd = ytdGross - totalTaxYtd - (preTax || 0);
  const marginalRate = calcMarginalRate(taxableYtd, brackets);
  const effectiveRate = ytdGross > 0 ? totalTaxYtd / ytdGross : 0;
  const remainingTaxOwed = totalTaxYtd - (taxesWithheldYtd || 0);

  // End-of-year projection: YTD funded + rest-of-year pipeline + other income.
  const projectedGross = projectedEoyGross + (otherIncome || 0);
  const projectedTaxable = Math.max(0, projectedGross - (preTax || 0) - (stdDeduction || 0));
  const projectedFedGross = calcFederalTax(projectedTaxable, brackets);
  const projectedAgi = Math.max(0, projectedGross - (preTax || 0));
  const projectedCtc = calcChildTaxCredit(numChildren, numOtherDeps, projectedAgi, filingStatus);
  const projectedFed = Math.max(0, projectedFedGross - projectedCtc);
  const projectedState = projectedGross * ((stateRate || 0) / 100);
  const projectedFica = calcFica(projectedGross, ficaMode, filingStatus);
  const projectedTax = projectedFed + projectedState + projectedFica.total;
  const projectedNet = projectedGross - projectedTax - (preTax || 0);
  const projectedMarginal = calcMarginalRate(projectedTaxable, brackets);

  const paychecks = computePaychecks(funded, year, {
    brackets,
    stdDeduction: stdDeduction || 0,
    preTax: preTax || 0,
    ficaMode,
    filingStatus,
    stateRate: stateRate || 0,
  });
  // Newest first for the UI; the math itself runs oldest-first inside.
  const paychecksDisplay = [...paychecks].reverse();

  const onChangeStd = (v) => {
    setStdTouched(true);
    setStdDeduction(parseFloat(v) || 0);
  };

  return (
    <div>
      <div className="restricted-banner">
        <div>
          <div className="restricted-banner-title">Restricted · Kyle Duke Only</div>
          <div className="restricted-banner-sub">
            Personal net-income calculator. Pulls YTD gross from the funded ledger (same source as
            the Income tab) and applies federal · state · FICA tax estimates. Estimate only — confirm
            with your CPA.
          </div>
        </div>
      </div>

      <div className="calc-wrap">
        <div>
          <div className="form-card">
            <div className="section-header">
              <div className="section-title">YTD Gross · Pulled from Income Tab</div>
              <div className="section-sub">
                Funded ledger · {year} · through {today.toLocaleDateString('en-US')}
              </div>
            </div>
            <div style={{ padding: 20, display: 'grid', gap: 10 }}>
              <Tile label="YTD Funded Gross (Kyle)" value={fmt$(ytdFundedGross)} red />
              <Tile label="Pipeline Rest-of-Year (Projected)" value={fmt$(restOfYearPipeline)} />
              <Tile label="Projected EOY Gross" value={fmt$(projectedEoyGross)} dark />
              <div className="form-field" style={{ marginTop: 8 }}>
                <label>Override YTD Gross (optional · match a paystub)</label>
                <input
                  type="number"
                  placeholder="leave blank to use computed value"
                  value={overrideGross}
                  onChange={(e) => setOverrideGross(e.target.value)}
                />
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                YTD gross = LO gross on Kyle's funded loans (130 bps) + 10 bps override on Missy's.
                Same formula the Income tab uses for "Kyle's Total Earnings."
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="section-header">
              <div className="section-title">Tax Assumptions</div>
              <div className="section-sub">Edit to match your actual filing situation</div>
            </div>
            <div style={{ padding: 20 }}>
              <div className="calc-input-row">
                <div className="form-field">
                  <label>Filing Status</label>
                  <select value={filingStatus} onChange={(e) => setFilingStatus(e.target.value)}>
                    <option value="single">Single</option>
                    <option value="married_jointly">Married — Joint</option>
                    <option value="head_of_household">Head of Household</option>
                  </select>
                </div>
                <div className="form-field">
                  <label>FICA / SE Tax</label>
                  <select value={ficaMode} onChange={(e) => setFicaMode(e.target.value)}>
                    <option value="w2">W-2 Employee (7.65%)</option>
                    <option value="self_employed">1099 / Self-Employed (15.3%)</option>
                    <option value="none">None</option>
                  </select>
                </div>
              </div>
              <div className="calc-input-row">
                <div className="form-field">
                  <label>Standard Deduction</label>
                  <input
                    type="number"
                    value={stdDeduction}
                    onChange={(e) => onChangeStd(e.target.value)}
                  />
                </div>
                <div className="form-field">
                  <label>Pre-Tax Contributions YTD (401k, HSA)</label>
                  <input
                    type="number"
                    value={preTax}
                    onChange={(e) => setPreTax(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="calc-input-row">
                <div className="form-field">
                  <label>Other Taxable Income YTD</label>
                  <input
                    type="number"
                    value={otherIncome}
                    onChange={(e) => setOtherIncome(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field">
                  <label>State Tax Rate (%) · Florida = 0%</label>
                  <input
                    type="number"
                    step="0.01"
                    value={stateRate}
                    onChange={(e) => setStateRate(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div className="calc-input-row">
                <div className="form-field">
                  <label>Children under 17 (CTC)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={numChildren}
                    onChange={(e) => setNumChildren(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="form-field">
                  <label>Other Dependents (ODC)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={numOtherDeps}
                    onChange={(e) => setNumOtherDeps(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
              <div className="calc-input-row">
                <div className="form-field">
                  <label>Taxes Already Withheld YTD (paystubs)</label>
                  <input
                    type="number"
                    value={taxesWithheldYtd}
                    onChange={(e) => setTaxesWithheldYtd(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="form-field">
                  <label>Effective Rate YTD (read-only)</label>
                  <input value={fmtPct(effectiveRate)} disabled style={{ background: '#f4f4f6' }} />
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
                Florida · Hillsborough County: no state or local income tax. Federal brackets are
                2026 IRS-projected tables. Standard deduction auto-fills by filing status. CTC is
                $2,200/child + $500/other dependent, phased out $50 per $1k over $400k AGI (MFJ).
              </div>
            </div>
          </div>

          <div className="form-card">
            <div className="section-header">
              <div className="section-title">YTD Bracket Fill · {STATUS_LABEL[filingStatus]}</div>
              <div className="section-sub">
                Marginal bracket: <strong>{fmtPct(marginalRate)}</strong> · Taxable YTD:{' '}
                <strong>{fmt$(taxableYtd)}</strong>
              </div>
            </div>
            <div style={{ padding: 0, overflowX: 'auto' }}>
              <BracketTable taxable={taxableYtd} brackets={brackets} />
            </div>
          </div>

          <div className="form-card">
            <div className="section-header">
              <div className="section-title">Per-Paycheck Breakdown · {year}</div>
              <div className="section-sub">
                Each funded loan, sorted newest first. Tax is the marginal slice taken
                at Kyle's running YTD position when that loan funded — so the rate
                climbs as the year progresses. CTC isn't shown per-paycheck because
                it's an annual credit applied at filing.
              </div>
            </div>
            <div style={{ padding: 0, overflowX: 'auto' }}>
              <PaycheckTable rows={paychecksDisplay} />
            </div>
          </div>
        </div>

        <div className="calc-result">
          <div className="calc-result-label">YTD Net Income</div>
          <div className="calc-result-value">{fmt$(netYtd)}</div>
          <div className="calc-result-sub">
            of {fmt$(ytdGross)} gross · {fmtPct(effectiveRate)} effective rate
          </div>
          <div className="calc-result-row">
            <span className="lbl">Federal Tax YTD (gross)</span>
            <span className="val">{fmt$(fedYtdGross)}</span>
          </div>
          {(numChildren > 0 || numOtherDeps > 0) && (
            <div className="calc-result-row">
              <span className="lbl" style={{ paddingLeft: 12 }}>
                · Child Tax Credit ({numChildren}c · {numOtherDeps}d)
              </span>
              <span className="val">−{fmt$(ctcYtd)}</span>
            </div>
          )}
          <div className="calc-result-row">
            <span className="lbl">Federal Tax YTD (after credits)</span>
            <span className="val">{fmt$(fedYtd)}</span>
          </div>
          <div className="calc-result-row">
            <span className="lbl">State Tax YTD ({(stateRate || 0).toFixed(2)}%)</span>
            <span className="val">{fmt$(stateYtd)}</span>
          </div>
          <div className="calc-result-row">
            <span className="lbl">FICA / SE Tax YTD</span>
            <span className="val">{fmt$(ficaYtd.total)}</span>
          </div>
          {ficaYtd.addlMedicare > 0 && (
            <div className="calc-result-row">
              <span className="lbl" style={{ paddingLeft: 12 }}>· Addl Medicare (0.9%)</span>
              <span className="val">{fmt$(ficaYtd.addlMedicare)}</span>
            </div>
          )}
          {(preTax || 0) > 0 && (
            <div className="calc-result-row">
              <span className="lbl">Pre-Tax Withheld</span>
              <span className="val">{fmt$(preTax)}</span>
            </div>
          )}
          <div className="calc-result-row total">
            <span className="lbl">Total Tax YTD</span>
            <span className="val">{fmt$(totalTaxYtd)}</span>
          </div>
          <div className="calc-result-row">
            <span className="lbl">Marginal Bracket</span>
            <span className="val">{fmtPct(marginalRate)}</span>
          </div>
          {(taxesWithheldYtd || 0) > 0 && (
            <div className="calc-result-row">
              <span className="lbl">{remainingTaxOwed >= 0 ? 'Still Owed vs Withholding' : 'Overpaid (refund est.)'}</span>
              <span className="val">{fmt$(Math.abs(remainingTaxOwed))}</span>
            </div>
          )}

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '2px solid var(--brand-red)' }}>
            <div className="calc-result-label">Projected End of {year}</div>
            <div
              style={{
                fontFamily: "'Oswald',sans-serif",
                fontSize: 26,
                fontWeight: 700,
                color: '#fff',
                lineHeight: 1,
                margin: '4px 0',
              }}
            >
              {fmt$(projectedNet)}
            </div>
            <div className="calc-result-sub">
              of {fmt$(projectedGross)} gross · marginal {fmtPct(projectedMarginal)}
            </div>
            <div className="calc-result-row">
              <span className="lbl">Projected Total Tax</span>
              <span className="val">{fmt$(projectedTax)}</span>
            </div>
            {(numChildren > 0 || numOtherDeps > 0) && (
              <div className="calc-result-row">
                <span className="lbl">Projected CTC (after phaseout)</span>
                <span className="val">{fmt$(projectedCtc)}</span>
              </div>
            )}
            <div className="calc-result-row">
              <span className="lbl">Pipeline Rest-of-Year</span>
              <span className="val">{fmt$(restOfYearPipeline)}</span>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              paddingTop: 12,
              borderTop: '1px solid #333',
              fontSize: 10,
              color: '#888',
              textAlign: 'center',
            }}
          >
            Estimate only. Consult a CPA for tax filings.
          </div>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, red, dark }) {
  const cls = `income-kpi${red ? ' red' : ''}${dark ? ' dark' : ''}`;
  return (
    <div className={cls} style={{ textAlign: 'left', padding: '14px 16px' }}>
      <div className="income-kpi-label">{label}</div>
      <div className="income-kpi-value">{value}</div>
    </div>
  );
}

function BracketTable({ taxable, brackets }) {
  let prev = 0;
  return (
    <table className="income-table">
      <thead>
        <tr>
          <th>Bracket</th>
          <th>Range</th>
          <th>Rate</th>
          <th className="num">Filled</th>
          <th className="num">Tax in Bracket</th>
        </tr>
      </thead>
      <tbody>
        {brackets.map((b, i) => {
          const start = prev;
          const end = b.upTo;
          const filled = Math.max(0, Math.min(taxable, end) - start);
          const taxIn = filled * b.rate;
          prev = end;
          const isCurrent = taxable > start && taxable <= end;
          return (
            <tr key={i} style={isCurrent ? { background: '#fff8e1', fontWeight: 700 } : undefined}>
              <td>{i + 1}</td>
              <td>
                {fmt$(start)} – {end === Infinity ? '∞' : fmt$(end)}
              </td>
              <td>{fmtPct(b.rate)}</td>
              <td className="num">{fmt$(filled)}</td>
              <td className="num">{fmt$(taxIn)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PaycheckTable({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: '14px 18px', color: '#888', fontSize: 12 }}>
        No funded loans yet this year.
      </div>
    );
  }
  const totals = rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      tax: acc.tax + r.tax,
      net: acc.net + r.net,
    }),
    { gross: 0, tax: 0, net: 0 }
  );
  return (
    <table className="income-table">
      <thead>
        <tr>
          <th>Close</th>
          <th>Borrower</th>
          <th>LO</th>
          <th className="num">Gross</th>
          <th className="num">Federal</th>
          <th className="num">FICA</th>
          <th className="num">State</th>
          <th className="num">Total Tax</th>
          <th className="num">Net</th>
          <th className="num">Take-Home %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.closeDate}-${r.name}-${i}`}>
            <td>{r.closeDate}</td>
            <td><strong>{r.name}</strong></td>
            <td>{r.lo}</td>
            <td className="num money">{fmt$(r.gross)}</td>
            <td className="num money">{fmt$(r.fed)}</td>
            <td className="num money">{fmt$(r.fica)}</td>
            <td className="num money">{fmt$(r.state)}</td>
            <td className="num money">{fmt$(r.tax)}</td>
            <td className="num money" style={{ color: '#1a6b4a', fontWeight: 700 }}>{fmt$(r.net)}</td>
            <td className="num">{fmtPct(r.takeHomeRate)}</td>
          </tr>
        ))}
        <tr style={{ fontWeight: 700, background: '#fafafa' }}>
          <td colSpan={3} style={{ textAlign: 'right' }}>
            YTD · {rows.length} loan{rows.length === 1 ? '' : 's'}
          </td>
          <td className="num money">{fmt$(totals.gross)}</td>
          <td className="num money" colSpan={3}>{fmt$(totals.tax)} total tax</td>
          <td className="num money" />
          <td className="num money" style={{ color: '#1a6b4a' }}>{fmt$(totals.net)}</td>
          <td className="num">{totals.gross > 0 ? fmtPct(totals.net / totals.gross) : '—'}</td>
        </tr>
      </tbody>
    </table>
  );
}
