// Ported verbatim from legacy/index.html — helpers used by Snapshot + RateLocks.
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import { STATE_NAMES } from '../data/states.js';

export const fmt$ = n => n==null ? '\u2014' : '$' + n.toLocaleString('en-US',{maximumFractionDigits:0});
export const fmt$M = n => n==null ? '\u2014' : (n>=1e6 ? '$'+(n/1e6).toFixed(2)+'M' : '$'+(n/1e3).toFixed(0)+'K');

export const purchVsRefi = () => ({
  purchase: LOANS.filter(l=>l.purpose==='Purchase').length,
  refi:     LOANS.filter(l=>l.purpose==='Refi').length,
});

const US_STATE_CODES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']);

export const extractState = (addr) => {
  if(!addr || addr==='TBD') return null;
  const matches = [...addr.matchAll(/\b([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/g)];
  if(matches.length){
    for(let i=matches.length-1;i>=0;i--){
      const code = matches[i][1];
      if(US_STATE_CODES.has(code)) return code;
    }
  }
  const commaMatch = addr.match(/,\s*([A-Z]{2})\b/g);
  if(commaMatch){
    const last = commaMatch[commaMatch.length-1].replace(/^,\s*/,'');
    if(US_STATE_CODES.has(last)) return last;
  }
  const any = addr.match(/\b([A-Z]{2})\b/g);
  if(any){
    for(let i=any.length-1;i>=0;i--){ if(US_STATE_CODES.has(any[i])) return any[i]; }
  }
  return null;
};

const allLoansForStats = () => {
  const active = LOANS.filter(l=>l.stage!=='cold');
  const past = PAST_CLIENTS.map(c=>({
    amount:c.amount||0,
    type:c.type||'',
    property:c.property||'',
    saleType:c.saleType||'',
  }));
  return [...active, ...past];
};

export const loansByState = () => {
  const buckets = {};
  allLoansForStats().forEach(l=>{
    const s = extractState(l.property);
    if(!s) return;
    if(!buckets[s]) buckets[s] = {state:s, count:0, volume:0};
    buckets[s].count++;
    buckets[s].volume += (l.amount||0);
  });
  return Object.values(buckets).sort((a,b)=>b.volume-a.volume);
};

const normalizeType = (t) => {
  if(!t) return 'Other';
  const s = t.toString().trim().toUpperCase();
  if(s === 'CONV' || s === 'CONVENTIONAL') return 'CONV';
  if(s === 'FHA') return 'FHA';
  if(s === 'VA') return 'VA';
  if(s.includes('JUMBO')) return 'Jumbo';
  if(s.includes('NON-QM') || s.includes('NON QM')) return 'Non-QM';
  if(s === 'HELOC') return 'HELOC';
  return s;
};

export const loansByType = () => {
  const buckets = {};
  allLoansForStats().forEach(l=>{
    const t = normalizeType(l.type);
    if(!buckets[t]) buckets[t] = {type:t, count:0, volume:0};
    buckets[t].count++;
    buckets[t].volume += (l.amount||0);
  });
  return Object.values(buckets).sort((a,b)=>b.count-a.count);
};

export { STATE_NAMES };

// Rolling 12-month funded volume built from PAST_CLIENTS — ends at current month.
export function buildMonthlyFunded(){
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const today = new Date();
  const buckets = [];
  for(let i=11;i>=0;i--){
    const d = new Date(today.getFullYear(), today.getMonth()-i, 1);
    buckets.push({ m: MONTH_SHORT[d.getMonth()], monthIdx: d.getMonth(), year: d.getFullYear(), v: 0, u: 0 });
  }
  const key = (y,m) => y + '-' + m;
  const bmap = {};
  buckets.forEach(b => { bmap[key(b.year, b.monthIdx)] = b; });
  PAST_CLIENTS.forEach(c => {
    if(!c.closeDate) return;
    const d = new Date(c.closeDate);
    if(isNaN(d)) return;
    const b = bmap[key(d.getFullYear(), d.getMonth())];
    if(!b) return;
    b.v += (c.amount || 0);
    b.u += 1;
  });
  return buckets;
}

// Year-over-year history from PAST_CLIENTS
export function buildYoyHistory(){
  const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const YOY = {};
  PAST_CLIENTS.forEach(c=>{
    if(!c.closeDate || !c.year) return;
    const d = new Date(c.closeDate);
    if(isNaN(d)) return;
    const y = d.getFullYear();
    const m = MONTH_SHORT[d.getMonth()];
    if(!YOY[y]) YOY[y] = {};
    if(!YOY[y][m]) YOY[y][m] = {v:0,u:0};
    YOY[y][m].v += (c.amount || 0);
    YOY[y][m].u += 1;
  });
  return YOY;
}

export const AGENT_MILESTONES = [3, 5, 10, 25, 50, 100];

export function partnerLoc(p){
  if(p.city && p.state) return `${p.city}, ${p.state}`;
  return p.state || p.city || '\u2014';
}
