// Ported 1:1 from legacy/index.html renderSnapshot (+ supporting render blocks).
// Uses dangerouslySetInnerHTML to preserve every class name, inline style,
// and copy string verbatim from the legacy template literal.
import { useMemo } from 'react';
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import { PARTNERS } from '../data/partners.js';
import {
  fmt$M, purchVsRefi, loansByState, loansByType,
  STATE_NAMES, buildMonthlyFunded, buildYoyHistory,
  AGENT_MILESTONES, partnerLoc,
} from '../lib/snapshotHelpers.js';

function renderAnniversariesBlock(){
  const today = new Date();
  const upcoming = PAST_CLIENTS.map(c=>{
    const d = new Date(c.closeDate);
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
    const d = new Date(l.closeDate);
    return !isNaN(d) && d.getMonth()===mIdx && d.getFullYear()===yr;
  }).length;
  const closingThisMo = closingInMonth(thisMoIdx, thisYr);
  const closingNextMo = closingInMonth(nextMoIdx, nextMoYr);
  const lifetimeVolume = PAST_CLIENTS.reduce((a,c)=>a+(c.amount||0),0);
  const lifetimeUnits = PAST_CLIENTS.length;
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
    <div class="section-card">
      <div class="section-header"><div class="section-title">Monthly Targets</div><div class="section-sub">April 2026</div></div>
      <div class="section-body"><div class="grid-3">
        <div class="kpi"><div class="kpi-label">Volume Target</div><div class="kpi-value">$3.5M</div><div class="kpi-sub">26% to target \u00b7 $930K funded</div></div>
        <div class="kpi"><div class="kpi-label">Units Target</div><div class="kpi-value">10</div><div class="kpi-sub">2 funded \u00b7 8 to go</div></div>
        <div class="kpi"><div class="kpi-label">New Apps Target</div><div class="kpi-value">18</div><div class="kpi-sub">12 received \u00b7 67% pace</div></div>
      </div></div>
    </div>`;
}

export default function Snapshot(){
  const html = useMemo(buildSnapshotHTML, []);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
