// Ported 1:1 from legacy/index.html renderRateLocks.
import { useMemo } from 'react';
import { LOANS } from '../data/loans.js';
import { fmt$ } from '../lib/snapshotHelpers.js';

function buildRateLocksHTML(){
  const today = new Date();
  today.setHours(0,0,0,0);
  const withDays = LOANS.filter(l=>{
    if(!l.lockExp || l.lockExp==='Funded' || l.stage==='funded') return false;
    const exp = new Date(l.lockExp);
    return !isNaN(exp);
  }).map(l=>{
    const exp = new Date(l.lockExp);
    return {...l, daysLeft: Math.ceil((exp - today) / 86400000)};
  }).sort((a,b)=>a.daysLeft-b.daysLeft);

  const rows = withDays.map(l=>`<tr style="cursor:pointer" onclick="openLoan('${l.id}')">
    <td><strong>${l.borrower}</strong><br><span class="muted">${l.property||'\u2014'}</span></td>
    <td>${l.amount?fmt$(l.amount):'\u2014'}</td>
    <td>${l.rate?l.rate+'%':'\u2014'}</td>
    <td>${l.type||'\u2014'}</td>
    <td>${l.lockExp}</td>
    <td style="color:${l.daysLeft<0?'#c62828':l.daysLeft<=7?'#c62828':l.daysLeft<=14?'#e65100':'#2e7d32'};font-weight:700">${l.daysLeft<0?(-l.daysLeft+'d late'):l.daysLeft+'d'}</td>
    <td>${l.lo||'\u2014'}</td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;padding:30px;color:#999">No active locks. Lock expiration dates set on the Loan Management tab will appear here automatically.</td></tr>';

  const totalLocked = withDays.length;
  const expiring7 = withDays.filter(l=>l.daysLeft<=7 && l.daysLeft>=0).length;
  const overdue = withDays.filter(l=>l.daysLeft<0).length;
  const next14 = withDays.filter(l=>l.daysLeft>7 && l.daysLeft<=14).length;

  return `<div class="kpi-grid">
    <div class="kpi" style="border-top-color:${overdue>0?'#c62828':'var(--brand-red)'}"><div class="kpi-label">Expired (past due)</div><div class="kpi-value">${overdue}</div><div class="kpi-sub">Urgent action</div></div>
    <div class="kpi"><div class="kpi-label">Expiring \u2264 7 days</div><div class="kpi-value">${expiring7}</div><div class="kpi-sub">Needs extension or funding</div></div>
    <div class="kpi"><div class="kpi-label">8\u201314 Days</div><div class="kpi-value">${next14}</div><div class="kpi-sub">Watch list</div></div>
    <div class="kpi"><div class="kpi-label">Total Active Locks</div><div class="kpi-value">${totalLocked}</div><div class="kpi-sub">From Loan Management</div></div>
  </div>
  <div class="section-card"><div class="section-header"><div class="section-title">Active Rate Locks</div><div class="section-sub">Auto-sourced from Loan Management \u00b7 click any row for full loan detail</div></div>
    <div class="section-body" style="padding:0"><table class="loans-table">
      <thead><tr><th>Borrower / Property</th><th>Amount</th><th>Rate</th><th>Type</th><th>Lock Expires</th><th>Days Left</th><th>LO</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

export default function RateLocks(){
  const html = useMemo(buildRateLocksHTML, []);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
