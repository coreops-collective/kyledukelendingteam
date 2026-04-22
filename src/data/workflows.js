// Workflows & SOPs — verbatim port from legacy/index.html (WORKFLOWS + TASK_ROLES).
// Legacy used a `newTaskId()` helper that returned incrementing ids; here we
// generate stable ids at module load time so React keys stay consistent.
let _taskIdCounter = 1;
const newTaskId = () => 't' + (_taskIdCounter++);

export const TASK_ROLES = { lo:'Loan Officer', loa:'LOA', automated:'Automated', admin:'Admin' };

export const WORKFLOWS = [
  {title:'Buyer Consultation Process',desc:'From loan application submission through pre-approval hand-off.',steps:[
    {role:'automated',label:'Trigger',text:'Lead completes loan application (online)',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Automation',text:'Automation puts lead info into pipeline tracker spreadsheet',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Floify',text:'Email "we\u2019ve received your loan application" triggered via Floify',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Task',text:'Application reviewed by loan officer',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Decision',text:'LO determines: Denied / Credit Repair / Scenarios Desk / Pre-Approved',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA \u2014 Denied',text:'Send denial email, update pipeline tracker, update realtor with denial info',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO \u2014 Credit Repair',text:'Identify score blockers, utilization, disputes \u2192 create action plan',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA \u2014 Credit Repair',text:'Send credit repair plan email to lead, update pipeline tracker + realtor',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO \u2014 Scenarios Desk',text:'Loan officer sends application to scenarios desk for extended review',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA \u2014 Scenarios',text:'Wait for outcome, update lead & realtor with extended timeline',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO \u2014 Pre-Approved',text:'LO fills out pre-approval form, calls client with next steps, calls agent to inform',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA \u2014 Delivery',text:'Send pre-approval form via email/text to lead and agent',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA \u2014 Tracker',text:'Move client in pipeline tracker from Applied \u2192 Pre-Approved',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Hand-off',text:'Move to ACTIVE SHOPPER PROCESS',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
  ]},
  {title:'Active Shopper Process',desc:'From pre-approval through offer accepted.',steps:[
    {role:'automated',label:'Start',text:'Buyer is pre-approved',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA Task',text:'Update pipeline tracker \u2192 Active Shopper',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Task',text:'Run numbers for addresses as needed (as buyer tours homes)',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Task',text:'Give client + agent updated payment, cash to close, strategy',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Decision',text:'Ready to submit offer?',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Task',text:'Before submission \u2014 confirm offer price, earnest money, seller concessions',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Task',text:'Issue updated pre-approval letter matching the offer price',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Decision',text:'Offer accepted?',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Hand-off',text:'Proceed to UNDER CONTRACT PROCESS',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
  ]},
  {title:'Purchase Under Contract Process',desc:'Loan setup \u2192 disclosures \u2192 underwriting \u2192 CTC \u2192 funded.',steps:[
    {role:'automated',label:'Trigger',text:'Contract executed \u2014 notified via email from realtor or TC',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA Setup',text:'Request file delivered to all parties, verify key notes, update pipeline tracker',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Setup',text:'Send contract to processor, update spreadsheet \u2192 "Set Up"',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA Disclosures',text:'Mandatory info: credit, disclosures, dates, check appraisal request + inspection',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA Disclosures',text:'Send intro/welcome email + next steps to borrower',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Automation',text:'Fresh approval deadlines reminder, notify listing agent of deadlines',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Underwriting',text:'Disclosures re-signed, submit to underwriter, update spreadsheet \u2192 "Submitted to UW"',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO UW',text:'Follow up with borrower on any missing docs within 48 hrs',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA UW',text:'Order appraisal, order title, coordinate with processor',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO CTC',text:'Clear conditions, confirm appraisal matches, final CD review',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'loa',label:'LOA CTC',text:'Issue Clear to Close, update spreadsheet, notify agents',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'lo',label:'LO Funding',text:'Work with closer to make adjustments, email wire to borrower',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
    {role:'automated',label:'Close',text:'Update spreadsheet \u2192 Funded, proceed to POST CLOSE PROCESS',id:newTaskId(),assignee:'',system:'',completed:false,dueDate:'',how:'',why:''},
  ]},
];

// SOPS — legacy file did not define a separate `SOPS` array; the Workflows & SOPs
// page is powered entirely by WORKFLOWS. Exported as alias for convenience.
export const SOPS = WORKFLOWS;

export { newTaskId };
