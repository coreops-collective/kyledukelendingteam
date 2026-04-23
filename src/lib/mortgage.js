// Mortgage / closing calculator helpers — ported verbatim from legacy/index.html

export const fmt$ = n => n == null ? '\u2014' : '$ ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });

export const LOGO_SVG = '<img src="/brand-crest.jpeg" alt="The Kyle Duke Team" onerror="this.style.display=\'none\'" style="width:100%;height:100%;object-fit:contain">';

// Mortgage insurance / funding fee logic per Fannie Mae / Freddie Mac / VA guidelines
export function calcConventionalPMI(loanAmt, ltv) {
  if (ltv <= 80) return 0;
  let rate = 0;
  if (ltv > 95) rate = 0.0092;
  else if (ltv > 90) rate = 0.0062;
  else if (ltv > 85) rate = 0.0038;
  else rate = 0.0022;
  return loanAmt * rate / 12;
}
export function calcFHA_UFMIP(baseLoanAmt) { return baseLoanAmt * 0.0175; }
export function calcFHA_MonthlyMIP(totalLoanAmt, ltv, termYears) {
  // Simplified Fannie/Freddie-style FHA MIP table (30yr, base case)
  let rate = 0.0055;
  if (termYears <= 15) {
    if (ltv <= 90) rate = 0.0015;
    else rate = 0.0040;
  } else {
    if (ltv <= 95) rate = 0.0050;
    else rate = 0.0055;
  }
  return totalLoanAmt * rate / 12;
}
export function calcVAFundingFee(baseLoanAmt, downPct, firstUse, exempt) {
  if (exempt) return 0;
  let rate = 0;
  if (firstUse) {
    if (downPct < 5) rate = 0.0215;
    else if (downPct < 10) rate = 0.015;
    else rate = 0.0125;
  } else {
    if (downPct < 5) rate = 0.033;
    else if (downPct < 10) rate = 0.015;
    else rate = 0.0125;
  }
  return baseLoanAmt * rate;
}

export function computeMortgage(s) {
  const basePrice = s.price;
  const down = s.down;
  const baseLoanAmt = Math.max(basePrice - down, 0);
  const ltv = basePrice > 0 ? (baseLoanAmt / basePrice * 100) : 0;
  const downPct = basePrice > 0 ? (down / basePrice * 100) : 0;
  const loanType = s.loanType || 'Conventional';
  let upfrontFee = 0; // financed upfront fee (VA funding fee or FHA UFMIP)
  let upfrontLabel = '';
  if (loanType === 'FHA') {
    upfrontFee = calcFHA_UFMIP(baseLoanAmt);
    upfrontLabel = 'FHA UFMIP (1.75%, rolled in)';
  } else if (loanType === 'VA') {
    upfrontFee = calcVAFundingFee(baseLoanAmt, downPct, s.vaFirstUse !== false, s.vaExempt === true);
    upfrontLabel = 'VA Funding Fee (rolled in)';
  }
  const totalLoanAmt = baseLoanAmt + upfrontFee;
  const r = (s.rate || 0) / 100 / 12;
  const n = (s.term || 30) * 12;
  const pi = r > 0 ? totalLoanAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1) : totalLoanAmt / n;
  const taxM = (s.tax || 0) / 12;
  const insM = (s.ins || 0) / 12;
  const hoaM = s.hoa || 0;
  let miM = 0;
  let miLabel = '';
  if (loanType === 'Conventional') {
    miM = calcConventionalPMI(totalLoanAmt, ltv);
    miLabel = 'Conventional PMI';
  } else if (loanType === 'FHA') {
    miM = calcFHA_MonthlyMIP(totalLoanAmt, ltv, s.term || 30);
    miLabel = 'FHA Monthly MIP';
  } // VA: $0 monthly MI
  const total = pi + taxM + insM + hoaM + miM;
  return { basePrice, down, baseLoanAmt, upfrontFee, upfrontLabel, totalLoanAmt, ltv, downPct, loanType, pi, taxM, insM, hoaM, miM, miLabel, total };
}

export function computeClosing(s) {
  const lenderFees = 1200;
  const appraisal = 600;
  const credit = 75;
  const titleSearch = 350;
  const titleIns = s.loan * 0.005;
  const ownerTitle = s.price * 0.0035;
  const recording = 200;
  const transferTax = s.state === 'FL' ? s.price * 0.0070 : s.price * 0.005;
  const survey = 450;
  const inspection = 500;
  const escrowTax = (s.price * 0.012 / 12) * 6;
  const escrowIns = (s.price * 0.0042 / 12) * 12;
  const prepaidInterest = (s.loan * 0.0625 / 365) * 15;
  const total = lenderFees + appraisal + credit + titleSearch + titleIns + ownerTitle + recording + transferTax + survey + inspection + escrowTax + escrowIns + prepaidInterest;
  const totalCash = total + (s.price - s.loan);
  return { lenderFees, appraisal, credit, titleSearch, titleIns, ownerTitle, recording, transferTax, survey, inspection, escrowTax, escrowIns, prepaidInterest, total, totalCash };
}
