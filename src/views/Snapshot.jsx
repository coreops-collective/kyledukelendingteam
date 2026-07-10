// Ported 1:1 from legacy/index.html renderSnapshot (+ supporting render blocks).
// Uses dangerouslySetInnerHTML to preserve every class name, inline style,
// and copy string verbatim from the legacy template literal.
import { useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import { PARTNERS } from '../data/partners.js';
import {
  fmt$M, purchVsRefi, loansByState, loansByType,
  STATE_NAMES, buildMonthlyFunded, buildYoyHistory,
  AGENT_MILESTONES, partnerLoc,
} from '../lib/snapshotHelpers.js';
import { parseLocalDate } from '../lib/clientDates.js';
import { getAllFunded } from '../lib/fundedLoans.js';

function renderAnniversariesBlock(){
  const today = new Date();
  const upcoming = PAST_CLIENTS.map(c=>{
    const d = parseLocalDate(c.closeDate);
    if(!d) return { ...c, daysAway: 9999, yearsTogether: 0, annivDate: '' };
    const annivThisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    const daysAway = Math.ceil((annivThisYear - today) / 86400000);
    const yearsTogether = today.getFullYear() - d.getFullYear();
    return {...c, daysAway, yearsTogether, annivDate: annivThisYear.toLocaleDateString('en-US',{month:'short',day:'numeric'})};
  }).filter(c=>c.daysAway >= -7 && c.daysAway <= 60).sort((a,b)=>a.daysAway-b.daysAway);

  if(!upcoming.length) return '';
  const rows = upcoming.map(c=>{
    const badge = c.daysAway === 0 ? '#C8102E' : c.daysAway <= 7 ? '#f5c518' : c.daysAway <= 30 ? '#999' : '#ccc';
    return `<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid #f0f0f0">
      <div style="background:${badge};color:#fff;font-family:'Oswald',sans-serif;font-weight:700;font-size:11px;padding:6px 10px;border-radius:6px;text-align:center;min-width:70px;text-transform:uppercase;letter-spacing:.4px">${c.daysAway===0?'TODAY':c.daysAway<0?(-c.daysAway+'d ago'):(c.daysAway+'d')}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${c.name}</div>
        <div style="font-size:11px;color:#888">${c.property||''}${c.agent?' \u00b7 '+c.agent:''}</div>
      </div>
      <div style="text-align:right">
        <div style="font-family:'Oswald',sans-serif;font-weight:700;font-size:14px">${c.yearsTogether} yr${c.yearsTogether!==1?'s':''}</div>
        <div style="font-size:10px;color:#888">${c.annivDate}</div>
      </div>
    </div>`;
  }).join('');

  return `<div class="section-card">
    <div class="section-header"><div class="section-title">Home Anniversaries Coming Up</div><div class="section-sub">Next 60 days \u00b7 trigger CFL touches</div></div>
    <div class="section-body" style="max-height:340px;overflow-y:auto">${rows}</div>
  </div>`;
}

function renderAgentMilestonesBlock(){
  const watchlist = PARTNERS.map(p=>{
    const total = p.deals;
    const nextMilestone = AGENT_MILESTONES.find(m => m > total);
    const lastMilestone = [...AGENT_MILESTONES].reverse().find(m => m <= total);
    const justHit = lastMilestone && total === lastMilestone;
    const dealsAway = nextMilestone ? nextMilestone - total : null;
    return {...p, nextMilestone, lastMilestone, justHit, dealsAway};
  }).filter(p => p.justHit || (p.dealsAway && p.dealsAway <= 2));

  if(!watchlist.length) return '';
  const rows = watchlist.map(p=>{
    if(p.justHit){
      return `<div style="display:flex;align-items:center;gap:14px;padding:12px;background:#fff8e1;border-left:4px solid #f5c518;border-radius:6px;margin-bottom:8px">
        <div style="background:#f5c518;color:#1a1a1a;font-family:'Oswald',sans-serif;font-weight:700;font-size:11px;padding:6px 12px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px">${p.lastMilestone}-Deal Milestone</div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:13px">${p.name}</div>
          <div style="font-size:11px;color:#7a6300">${partnerLoc(p)} \u00b7 Trigger milestone gift + handwritten note</div>
        </div>
      </div>`;
    }
    return `<div style="display:flex;align-items:center;gap:14px;padding:12px;background:#fff;border:1px solid var(--border);border-left:4px solid var(--brand-red);border-radius:6px;margin-bottom:8px">
      <div style="background:var(--brand-red);color:#fff;font-family:'Oswald',sans-serif;font-weight:700;font-size:11px;padding:6px 12px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px">${p.dealsAway} away</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:13px">${p.name}</div>
        <div style="font-size:11px;color:#888">${partnerLoc(p)} \u00b7 ${p.deals} \u2192 ${p.nextMilestone} milestone</div>
      </div>
    </div>`;
  }).join('');

  return `<div class="section-card">
    <div class="section-header"><div class="section-title">Agent Milestone Watch</div><div class="section-sub">Trigger gift + recognition when an agent hits a deal milestone</div></div>
    <div class="section-body" style="max-height:340px;overflow-y:auto">${rows}</div>
  </div>`;
}

function renderYoYBlock(YOY_HISTORY){
  const MSHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const thisYr = now.getFullYear();
  const thisMoIdx = now.getMonth();
  const thisMo = MSHORT[thisMoIdx];
  const lastMoDate = new Date(thisYr, thisMoIdx-1, 1);
  const lastYrSame = thisYr - 1;
  const cur = YOY_HISTORY[thisYr]?.[thisMo] || {v:0,u:0};
  const sameMoPrev = YOY_HISTORY[lastYrSame]?.[thisMo] || {v:0,u:0};

  const thisQ = Math.floor(thisMoIdx/3)+1;
  const qMonths = (qNum)=>{ const start=(qNum-1)*3; return [MSHORT[start],MSHORT[start+1],MSHORT[start+2]]; };
  const qSum = (year, qNum)=>{
    return qMonths(qNum).reduce((a,m)=>{
      const r = YOY_HISTORY[year]?.[m] || {v:0,u:0};
      return {v:a.v+r.v, u:a.u+r.u};
    },{v:0,u:0});
  };
  const lastQ = thisQ===1 ? 4 : thisQ-1;
  const lastQYr = thisQ===1 ? thisYr-1 : thisYr;
  const thisQStats = qSum(thisYr, thisQ);
  const lastQStats = qSum(lastQYr, lastQ);

  const pct = (a,b)=>b?Math.round(((a-b)/b)*100):0;
  const arrow = (n)=>n>=0?'\u25B2':'\u25BC';
  const color = (n)=>n>=0?'#2e7d32':'#c62828';
  const sign = (n)=>n>=0?'+':'';

  const volDelta = cur.v - sameMoPrev.v;
  const unitDelta = cur.u - sameMoPrev.u;
  const volPct = pct(cur.v, sameMoPrev.v);
  const unitPct = pct(cur.u, sameMoPrev.u);
  const qVolDelta = thisQStats.v - lastQStats.v;
  const qUnitDelta = thisQStats.u - lastQStats.u;
  const qVolPct = pct(thisQStats.v, lastQStats.v);
  const qUnitPct = pct(thisQStats.u, lastQStats.u);

  const compareRow = (label, thisVal, lastVal, delta, pctVal) => `
    <div style="display:grid;grid-template-columns:60px 1fr auto;gap:8px;padding:6px 0;align-items:center;font-size:11px;border-bottom:1px dashed #f0f0f0">
      <div style="color:#888;text-transform:uppercase;letter-spacing:.4px;font-weight:700;font-size:10px">${label}</div>
      <div style="font-family:'Oswald',sans-serif;font-weight:700;color:#222"><span style="font-size:14px">${thisVal}</span> <span style="color:#999;font-size:11px">vs ${lastVal}</span></div>
      <div style="text-align:right;font-family:'Oswald',sans-serif;font-weight:700;color:${color(delta)};font-size:12px">${arrow(delta)} ${sign(delta)}${pctVal}%</div>
    </div>`;

  const thisMoLong = now.toLocaleString('en-US',{month:'long'});
  const qName = (q)=>['Q1','Q2','Q3','Q4'][q-1];

  return `<div class="section-card">
    <div class="section-header"><div class="section-title">Year-Over-Year &amp; Quarter Comparison</div><div class="section-sub">Where we are vs. last year and last quarter</div></div>
    <div class="section-body">
      <div class="grid-3">
        <div class="kpi"><div class="kpi-label">${thisMoLong} ${thisYr} So Far</div><div class="kpi-value">${fmt$M(cur.v)}</div><div class="kpi-sub">${cur.u} units</div></div>
        <div class="kpi"><div class="kpi-label">${thisMoLong} ${lastYrSame} (Final)</div><div class="kpi-value">${fmt$M(sameMoPrev.v)}</div><div class="kpi-sub">${sameMoPrev.u} units closed</div></div>
        <div class="kpi" style="border-top-color:${color(volDelta)}">
          <div class="kpi-label">${thisMoLong} ${thisYr} vs ${lastYrSame}</div>
          ${compareRow('Volume', fmt$M(cur.v), fmt$M(sameMoPrev.v), volDelta, volPct)}
          ${compareRow('Units', cur.u, sameMoPrev.u, unitDelta, unitPct)}
          <div style="font-size:10px;color:#888;margin-top:6px;font-style:italic">${sign(volDelta)}${fmt$M(Math.abs(volDelta))} \u00b7 ${sign(unitDelta)}${unitDelta} units</div>
        </div>
      </div>
      <div class="income-kpi-row-label">This Quarter vs Last Quarter</div>
      <div class="grid-3">
        <div class="kpi"><div class="kpi-label">${qName(thisQ)} ${thisYr} \u00b7 In Progress</div><div class="kpi-value">${fmt$M(thisQStats.v)}</div><div class="kpi-sub">${thisQStats.u} units \u00b7 ${qMonths(thisQ).join('/')}</div></div>
        <div class="kpi"><div class="kpi-label">${qName(lastQ)} ${lastQYr} \u00b7 Completed</div><div class="kpi-value">${fmt$M(lastQStats.v)}</div><div class="kpi-sub">${lastQStats.u} units \u00b7 ${qMonths(lastQ).join('/')}</div></div>
        <div class="kpi" style="border-top-color:${color(qVolDelta)}">
          <div class="kpi-label">${qName(thisQ)} vs ${qName(lastQ)}</div>
          ${compareRow('Volume', fmt$M(thisQStats.v), fmt$M(lastQStats.v), qVolDelta, qVolPct)}
          ${compareRow('Units', thisQStats.u, lastQStats.u, qUnitDelta, qUnitPct)}
          <div style="font-size:10px;color:#888;margin-top:6px;font-style:italic">${sign(qVolDelta)}${fmt$M(Math.abs(qVolDelta))} \u00b7 ${sign(qUnitDelta)}${qUnitDelta} units</div>
        </div>
      </div>
    </div>
  </div>`;
}

function renderGeoLoanTypeBlock(){
  const states = loansByState();
  const types = loansByType();
  const stateMax = Math.max(...states.map(s=>s.volume),1);
  const typeMax = Math.max(...types.map(t=>t.count),1);
  const stateRows = states.slice(0,8).map(s=>`
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
      <div style="width:120px;font-size:11px"><strong>${s.state}</strong> <span style="color:#999">${STATE_NAMES[s.state]||''}</span></div>
      <div style="flex:1;background:#f4f4f6;border-radius:4px;height:20px;position:relative">
        <div style="height:100%;background:var(--brand-red);border-radius:4px;width:${(s.volume/stateMax*100)}%"></div>
      </div>
      <div style="width:90px;text-align:right;font-size:11px;font-weight:600;font-family:'Oswald',sans-serif">${fmt$M(s.volume)}</div>
      <div style="width:30px;text-align:right;font-size:10px;color:#888">${s.count}</div>
    </div>`).join('');
  const typeColors = {VA:'#0A0A0A',FHA:'#C8102E',CONV:'#888','Conv':'#888'};
  const typeRows = types.map(t=>`
    <div style="display:flex;align-items:center;gap:10px;margin:8px 0">
      <div style="width:60px;font-size:12px;font-weight:700;font-family:'Oswald',sans-serif">${t.type}</div>
      <div style="flex:1;background:#f4f4f6;border-radius:4px;height:24px;position:relative">
        <div style="height:100%;background:${typeColors[t.type]||'#888'};border-radius:4px;width:${(t.count/typeMax*100)}%;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:10px;font-weight:700">${t.count}</div>
      </div>
      <div style="width:90px;text-align:right;font-size:11px;font-weight:600;font-family:'Oswald',sans-serif">${fmt$M(t.volume)}</div>
    </div>`).join('');
  return `<div class="two-col">
    <div class="section-card">
      <div class="section-header"><div class="section-title">Top States by Volume</div><div class="section-sub">Where the business is</div></div>
      <div class="section-body">${stateRows||'<div class="muted">No address data yet</div>'}</div>
    </div>
    <div class="section-card">
      <div class="section-header"><div class="section-title">Loan Type Mix</div><div class="section-sub">VA / FHA / Conventional</div></div>
      <div class="section-body">${typeRows}</div>
    </div>
  </div>`;
}

function buildSnapshotHTML(){
  const activeLoans = LOANS.filter(l=>!l.archived && l.status!=='Adversed' && l.stage!=='funded' && l.stage!=='cold');
  const refiCount = LOANS.filter(l=>!l.archived && l.status!=='Adversed' && l.stage==='refiwatch').length;
  const kyleCount = activeLoans.filter(l=>l.lo==='Kyle').length;
  const missyCount = activeLoans.filter(l=>l.lo==='Missy').length;
  const now = new Date();
  const thisMoIdx = now.getMonth();
  const thisYr = now.getFullYear();
  const nextMoDate = new Date(thisYr, thisMoIdx+1, 1);
  const nextMoIdx = nextMoDate.getMonth();
  const nextMoYr = nextMoDate.getFullYear();
  const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const closingInMonth = (mIdx, yr) => LOANS.filter(l=>{
    if(l.archived || l.status==='Adversed' || !l.closeDate || l.stage==='funded' || l.stage==='cold') return false;
    const d = parseLocalDate(l.closeDate);
    return d && d.getMonth()===mIdx && d.getFullYear()===yr;
  }).length;
  const closingThisMo = closingInMonth(thisMoIdx, thisYr);
  const closingNextMo = closingInMonth(nextMoIdx, nextMoYr);
  // Lifetime volume includes PAST_CLIENTS (historical seed) plus any loans
  // the team has funded through the app since — getAllFunded dedupes them
  // by name+closeDate so a record in both sources only counts once.
  const funded = getAllFunded();
  const lifetimeVolume = funded.reduce((a,c)=>a+(c.amount||0),0);
  const lifetimeUnits = funded.length;
  const activeWithAmt = activeLoans.filter(l=>l.amount);
  const avgLoan = activeWithAmt.length ? activeWithAmt.reduce((a,l)=>a+l.amount,0) / activeWithAmt.length : 0;
  const kpis = [
    {label:'Active Files',value:activeLoans.length,sub:`Kyle: ${kyleCount} \u00b7 Missy: ${missyCount}`},
    {label:'Pipeline Volume',value:fmt$M(activeLoans.reduce((a,l)=>a+(l.amount||0),0)),sub:'All stages pre-funded',cls:'up'},
    {label:'REFI Watch',value:refiCount,sub:'Tracking for opportunity'},
    {label:`Closing in ${MONTH_FULL[thisMoIdx]}`,value:closingThisMo,sub:`${MONTH_FULL[thisMoIdx]} ${thisYr}`,cls:'up'},
    {label:`Closing in ${MONTH_FULL[nextMoIdx]}`,value:closingNextMo,sub:`${MONTH_FULL[nextMoIdx]} ${nextMoYr}`,cls:'up'},
    {label:'Avg Loan Amount',value:fmt$M(avgLoan),sub:`${activeWithAmt.length} active files`},
    {label:'Lifetime Volume',value:fmt$M(lifetimeVolume),sub:`${lifetimeUnits} closed loans`},
  ];
  const MONTHLY_FUNDED = buildMonthlyFunded();
  const YOY_HISTORY = buildYoyHistory();
  const maxV = Math.max(...MONTHLY_FUNDED.map(m=>m.v), 1);
  const totalFunded12 = MONTHLY_FUNDED.reduce((a,m)=>a+(m.v||0),0);
  const totalUnits12 = MONTHLY_FUNDED.reduce((a,m)=>a+(m.u||0),0);
  const bars = MONTHLY_FUNDED.map(m=>`<div class="bar-col" title="${m.m} ${m.year} \u00b7 ${m.u} units"><div class="bar-val">${m.v?fmt$M(m.v):'\u2014'}</div><div class="bar" style="height:${(m.v/maxV*100).toFixed(1)}%"></div><div class="bar-label">${m.m}</div></div>`).join('');
  const pr = purchVsRefi();
  const prTotal = pr.purchase+pr.refi;
  const pPct = prTotal ? Math.round(pr.purchase/prTotal*100) : 0;
  const circ = 2*Math.PI*55;
  return `
    <div class="kpi-grid">${kpis.map(k=>`<div class="kpi"><div class="kpi-label">${k.label}</div><div class="kpi-value">${k.value}</div><div class="kpi-sub ${k.cls||''}">${k.sub}</div></div>`).join('')}</div>
    <div class="two-col">
      <div class="section-card">
        <div class="section-header"><div class="section-title">12-Month Funded Volume</div><div class="section-sub">${fmt$M(totalFunded12)} \u00b7 ${totalUnits12} units \u00b7 from real closings</div></div>
        <div class="section-body"><div class="bar-chart">${bars}</div></div>
      </div>
      <div class="section-card">
        <div class="section-header"><div class="section-title">Purchase vs Refi</div><div class="section-sub">Active pipeline</div></div>
        <div class="section-body"><div class="donut-wrap">
          <svg width="140" height="140" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r="55" fill="none" stroke="#e5e5e8" stroke-width="20"/>
            <circle cx="70" cy="70" r="55" fill="none" stroke="#C8102E" stroke-width="20" stroke-dasharray="${(circ*pPct/100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 70 70)"/>
            <text x="70" y="68" text-anchor="middle" font-family="Oswald" font-size="22" font-weight="700" fill="#0A0A0A">${pPct}%</text>
            <text x="70" y="86" text-anchor="middle" font-size="10" fill="#888">Purchase</text>
          </svg>
          <div class="donut-legend"><div><span class="sw" style="background:#C8102E"></span>Purchase \u00b7 ${pr.purchase} loans</div><div><span class="sw" style="background:#e5e5e8"></span>Refinance \u00b7 ${pr.refi} loans</div></div>
        </div></div>
      </div>
    </div>
    ${renderYoYBlock(YOY_HISTORY)}
    ${renderGeoLoanTypeBlock()}
    <div class="two-col">
      ${renderAnniversariesBlock()}
      ${renderAgentMilestonesBlock()}
    </div>
`;
}

// Monthly Targets \u2014 persisted per-month in localStorage. Targets live under
// kdt-monthly-targets-v1 keyed by "YYYY-MM"; progress is computed live from
// LOANS + the funded ledger. Edit via the pencil button.
const TARGETS_KEY = 'kdt-monthly-targets-v1';
const DEFAULT_TARGETS = { volume: 3_500_000, units: 10, newApps: 18 };

function loadAllTargets() {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}
function saveAllTargets(map) {
  try { localStorage.setItem(TARGETS_KEY, JSON.stringify(map || {})); } catch { /* ignore */ }
}
function targetKey(year, mIdx) { return `${year}-${String(mIdx + 1).padStart(2, '0')}`; }

function MonthlyTargets() {
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const [editing, setEditing] = useState(false);

  const now = new Date();
  const mIdx = now.getMonth();
  const yr = now.getFullYear();
  const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const key = targetKey(yr, mIdx);

  const all = loadAllTargets();
  const t = { ...DEFAULT_TARGETS, ...(all[key] || {}) };

  // Actuals: funded volume + units this month from the canonical ledger,
  // new apps this month = LOANS with any activity this month that aren't
  // funded/adversed/archived.
  let volumeFunded = 0;
  let unitsFunded = 0;
  getAllFunded().forEach((f) => {
    const d = parseLocalDate(f.closeDate);
    if (!d || d.getMonth() !== mIdx || d.getFullYear() !== yr) return;
    volumeFunded += Number(f.amount || 0);
    unitsFunded += 1;
  });
  // "New apps" proxy: LOANS whose closeDate is this month AND aren't yet
  // funded \u2014 i.e. the deals currently in pipeline for this month.
  let newAppsCount = 0;
  LOANS.forEach((l) => {
    if (l.archived || l.status === 'Adversed') return;
    if (l.stage === 'funded' || l.status === 'Funded') return;
    if (!l.closeDate) return;
    const d = parseLocalDate(l.closeDate);
    if (d && d.getMonth() === mIdx && d.getFullYear() === yr) newAppsCount += 1;
  });

  const fmtMoney = (n) =>
    n >= 1_000_000 ? '$' + (n / 1_000_000).toFixed(2) + 'M' :
    n >= 1_000 ? '$' + Math.round(n / 1000) + 'K' : '$' + Math.round(n);
  const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

  const saveEdits = (patch) => {
    const next = { ...all, [key]: { ...t, ...patch } };
    saveAllTargets(next);
    bump();
  };

  const kpiStyle = { padding: '14px 16px', background: '#fff', border: '1px solid #eee', borderRadius: 8 };

  return (
    <div className="section-card">
      <div className="section-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div className="section-title">Monthly Targets</div>
          <div className="section-sub">{MONTH_FULL[mIdx]} {yr}</div>
        </div>
        <button
          onClick={() => setEditing(true)}
          style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, border: '1px solid #d0d0d0', background: '#fff', borderRadius: 6, cursor: 'pointer' }}
          aria-label="Edit monthly targets"
        >Edit targets</button>
      </div>
      <div className="section-body">
        <div className="grid-3">
          <div className="kpi" style={kpiStyle}>
            <div className="kpi-label">Volume Target</div>
            <div className="kpi-value">{fmtMoney(t.volume)}</div>
            <div className="kpi-sub">{pct(volumeFunded, t.volume)}% to target \u00b7 {fmtMoney(volumeFunded)} funded</div>
          </div>
          <div className="kpi" style={kpiStyle}>
            <div className="kpi-label">Units Target</div>
            <div className="kpi-value">{t.units}</div>
            <div className="kpi-sub">{unitsFunded} funded \u00b7 {Math.max(0, t.units - unitsFunded)} to go</div>
          </div>
          <div className="kpi" style={kpiStyle}>
            <div className="kpi-label">New Apps Target</div>
            <div className="kpi-value">{t.newApps}</div>
            <div className="kpi-sub">{newAppsCount} pipeline \u00b7 {pct(newAppsCount, t.newApps)}% pace</div>
          </div>
        </div>
      </div>
      {editing && <TargetsEditor targets={t} monthLabel={`${MONTH_FULL[mIdx]} ${yr}`} onSave={(p) => { saveEdits(p); setEditing(false); }} onClose={() => setEditing(false)} />}
    </div>
  );
}

function TargetsEditor({ targets, monthLabel, onSave, onClose }) {
  const [vol, setVol] = useState(targets.volume);
  const [units, setUnits] = useState(targets.units);
  const [apps, setApps] = useState(targets.newApps);
  const submit = (e) => {
    e.preventDefault();
    onSave({
      volume: Math.max(0, Number(vol) || 0),
      units: Math.max(0, Number(units) || 0),
      newApps: Math.max(0, Number(apps) || 0),
    });
  };
  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 420, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose} aria-label="Close">\u00d7</button>
          <div className="drawer-stage">Edit Targets</div>
          <div className="drawer-borrower">{monthLabel}</div>
        </div>
        <form onSubmit={submit} className="drawer-body" style={{ padding: 18 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Volume Target ($)</label>
            <input type="number" min="0" step="10000" value={vol} onChange={(e) => setVol(e.target.value)} style={{ width: '100%', padding: '8px 10px' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>Units Target</label>
            <input type="number" min="0" value={units} onChange={(e) => setUnits(e.target.value)} style={{ width: '100%', padding: '8px 10px' }} />
          </div>
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 4 }}>New Apps Target</label>
            <input type="number" min="0" value={apps} onChange={(e) => setApps(e.target.value)} style={{ width: '100%', padding: '8px 10px' }} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" style={{ padding: '8px 14px', background: '#c62828', color: '#fff', fontWeight: 700, border: 'none', borderRadius: 6, cursor: 'pointer' }}>Save</button>
            <button type="button" onClick={onClose} style={{ padding: '8px 14px', background: '#fff', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      </aside>
    </>
  );
}

export default function Snapshot(){
  const html = useMemo(buildSnapshotHTML, []);
  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <MonthlyTargets />
    </div>
  );
}
