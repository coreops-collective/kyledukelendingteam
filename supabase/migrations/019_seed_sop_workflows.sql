-- Seed three Loan-category workflows imported from Kimberly's SOP
-- docx files (Borrower Consultation SOP, Active Shopper Process,
-- Purchase Under Contract Process). Each workflow is idempotent via a
-- name-existence check so re-running the migration is a no-op.
--
-- Tasks anchor to loan STATUS transitions (New Contract, Applied, HOT
-- PA, etc.) so they generate against real loans in the corresponding
-- state. Role assignments (lo / loa / admin) follow the "clean role
-- summary" tables at the bottom of each SOP.
-- Run in Supabase SQL editor.

-- ── Borrower Consultation SOP ────────────────────────────────────
do $$
declare wf uuid;
begin
  if not exists (select 1 from workflow_templates where name = 'Borrower Consultation SOP') then
    insert into workflow_templates (name, description, category, position)
    values (
      'Borrower Consultation SOP',
      'From application received → pre-approval → active shopper handoff.',
      'Loan',
      100
    )
    returning id into wf;

    insert into workflow_tasks (workflow_id, title, role, trigger_kind, trigger_label, trigger_days, trigger_recurring, repeat_interval, notes, position) values
      (wf, 'Send "We received your application" email', 'automated', 'status', 'Applied', 0, false, null,
       'Auto email confirms receipt; loan file is created in LOS; LO is notified.', 0),
      (wf, 'Review credit, income, assets, debt, structure viability', 'lo', 'status', 'Applied', 0, false, null,
       'LO owns Phase 1 100%. Determine one of: Denied / Credit Repair / Scenarios Desk / Pre-Approved.', 1),
      (wf, 'Make pre-approval decision (denied / repair / scenarios / approved)', 'lo', 'status', 'Applied', 0, false, null,
       'This phase is 100% Loan Officer controlled.', 2),
      (wf, 'DENIED PATH: send customized denial email + notify realtor', 'lo', 'status', 'Adversed', 0, false, null,
       'Explain reasoning if needed. Ops updates pipeline → Denied, archives file.', 3),
      (wf, 'PRE-APPROVED PATH: structure loan + full underwriting review', 'lo', 'status', 'HOT PA', 0, false, null,
       'Real production begins here. Complete the pre-approval form.', 4),
      (wf, 'Call borrower to sell the deal', 'lo', 'status', 'HOT PA', 0, false, null,
       'First "sell the deal" moment.', 5),
      (wf, 'Call agent for trust transfer', 'lo', 'status', 'HOT PA', 0, false, null,
       'Set the tone for the transaction with the buyer''s agent.', 6),
      (wf, 'Send pre-approval letter', 'lo', 'status', 'HOT PA', 0, false, null,
       'Move borrower → Active Shopper. LO does NOT involve LOA yet unless under contract.', 7);
  end if;
end $$;

-- ── Active Shopper Process ──────────────────────────────────────
do $$
declare wf uuid;
begin
  if not exists (select 1 from workflow_templates where name = 'Active Shopper Process') then
    insert into workflow_templates (name, description, category, position)
    values (
      'Active Shopper Process',
      'Phase 2 — Loan Officer only. LOA involvement: none until contract executed.',
      'Loan',
      101
    )
    returning id into wf;

    insert into workflow_tasks (workflow_id, title, role, trigger_kind, trigger_label, trigger_days, trigger_recurring, repeat_interval, notes, position) values
      (wf, 'Confirm pre-approval issued + borrower expectations set', 'lo', 'status', 'HOT PA', 0, false, null,
       'Confirm borrower understands max purchase price, cash to close, payment expectations. Verbally explain shopping process.', 0),
      (wf, 'Run numbers on each property address (as they come in)', 'lo', 'status', 'HOT PA', 0, false, 'daily',
       'For every address requested: pull accurate property taxes, estimate insurance, review HOA, confirm DTI. Never send vague numbers. No Zillow math.', 1),
      (wf, 'Structure offer with borrower before submission', 'lo', 'status', 'HOT PA', 0, false, null,
       'Confirm offer price, earnest money, seller concessions, closing timeline, loan program, down payment structure. Confirm borrower comfortable with monthly payment + cash to close.', 2),
      (wf, 'Issue property-specific pre-approval letter matching offer', 'lo', 'status', 'HOT PA', 0, false, null,
       'Matches offer price exactly. Reflects concession structure if needed. Sends to buyer + buyer''s agent.', 3),
      (wf, 'On acceptance: begin handoff to LOA (Under Contract Process)', 'lo', 'status', 'New Contract', 0, false, null,
       'Loan Officer moves file to New Contract status. Triggers the Purchase Under Contract workflow.', 4);
  end if;
end $$;

-- ── Purchase Under Contract Process ─────────────────────────────
do $$
declare wf uuid;
begin
  if not exists (select 1 from workflow_templates where name = 'Purchase Under Contract Process') then
    insert into workflow_templates (name, description, category, position)
    values (
      'Purchase Under Contract Process',
      'Contract executed → Funded. Clean handoff from LO to LOA with LO involvement at rate/registration and CTC/final CD.',
      'Loan',
      102
    )
    returning id into wf;

    insert into workflow_tasks (workflow_id, title, role, trigger_kind, trigger_label, trigger_days, trigger_recurring, repeat_interval, notes, position) values
      (wf, 'Request LOA to be cc''d on all emails', 'admin', 'status', 'New Contract', 0, false, null,
       'Centralize communication, prevent missed deadlines, create documentation trail.', 0),
      (wf, 'Verify contract details (price / concessions / EMD / close date)', 'loa', 'status', 'New Contract', 0, false, null,
       'Include: buyer agent, seller agent, seller, TCs, title company, LO, LOA, processor, closer, property address, LO notes.', 1),
      (wf, 'Update Floify: buyer agent info + change status to Under Contract', 'loa', 'status', 'New Contract', 0, false, null,
       'Ensure notifications are active. Link property address to MLM loan #.', 2),
      (wf, 'Set up MeridianLink file (loan info, borrower info, agents, income, assets, declarations)', 'loa', 'status', 'New Contract', 0, false, null,
       'Loan info · Borrower info + 2yr residency · Close date · Subject property · Agents · Adjustments/credits · Employment · Monthly income · REO · Liabilities · Declarations · Gov monitoring · Assets (EMD, cash to close, gift docs, pending RE proceeds).', 3),
      (wf, 'Update Pipeline → Under Contract', 'loa', 'status', 'New Contract', 0, false, null,
       'Spreadsheet stays "blank" until initial disclosures go out, then move to Disclosed.', 4),
      (wf, 'Teams: "File is ready for review" → LO', 'loa', 'status', 'New Contract', 0, false, null,
       'Alert LO for rate/registration + structure review.', 5),
      (wf, 'Update MeridianLink with rate + fees + registration', 'lo', 'status', 'New Contract', 0, false, null,
       'Review full structure. Confirm concessions and credits.', 6),
      (wf, 'Call borrower: rate / payment / cash to close / timeline / expectations', 'lo', 'status', 'New Contract', 0, false, null,
       'Second "sell the deal" moment.', 7),
      (wf, 'Update buyer''s agent (loan details, rate/fees confirmation, confidence)', 'lo', 'status', 'New Contract', 0, false, null,
       'Trust transfer + set agent expectations for the file.', 8),
      (wf, 'Teams: "Client is good to disclose" → LOA', 'lo', 'status', 'New Contract', 0, false, null,
       'Signals LOA to push initial disclosures.', 9),
      (wf, 'Push initial disclosures in MeridianLink', 'loa', 'status', 'Disclosed', 0, false, null,
       'Click "Submit Initial Disclosure Request" — desk sends to borrower.', 10),
      (wf, 'Update Pipeline → Disclosed + request initial documents', 'loa', 'status', 'Disclosed', 0, false, null,
       'Request docs via Floify. Send intro + next steps + FAQ email templates.', 11),
      (wf, 'Confirm disclosures signed + docs received (follow up daily if not)', 'loa', 'status', 'Disclosed', 0, false, 'daily',
       'Escalate to agent after 2 days if borrower is unresponsive.', 12),
      (wf, 'Submit to Opening Team in MeridianLink', 'loa', 'status', 'Processing', 0, false, null,
       'Confirm info + docs accurate. Loan moves to processor queue.', 13),
      (wf, 'Track appraisal deadline + notify borrower/buyer''s agent of due date', 'loa', 'status', 'Processing', 0, false, null,
       'Processor submitting open request triggers: order appraisal, USPS verification, flood cert.', 14),
      (wf, 'Chase bold items requested by processor', 'loa', 'status', 'Processing', 0, false, 'daily',
       'Loop with borrower until items collected, then send back to processor.', 15),
      (wf, 'On appraisal received: value check + ROV decision if low', 'loa', 'status', 'Underwriting', 0, false, null,
       'YES value met → proceed. NO → consult borrower + buyer''s agent. Options: renegotiate, ROV package (collect comps + support letters), or adverse. FHA/VA: also MPR / repairs check.', 16),
      (wf, 'On UW suspended: fix deficiencies + resubmit', 'lo', 'status', 'Underwriting', 0, false, null,
       'LO + LOA problem solve. Loop until approved.', 17),
      (wf, 'On Approved with Conditions: collect conditions, send back to processor', 'loa', 'status', 'CTC Required', 0, false, null,
       'Highlighted condition list arrives; send templates to borrower + agent. Update pipeline → BTP → Approved with Conditions.', 18),
      (wf, 'CTC request: balance with title + finalize numbers', 'loa', 'status', 'CTC', 0, false, null,
       'Work with closer if they need anything. Send final CD to LO to review and approve.', 19),
      (wf, 'LO reviews + approves final CD', 'lo', 'status', 'CTC', 0, false, null,
       'Final numbers must be LO-approved before final disclosure goes out.', 20),
      (wf, 'Send final disclosure email to borrower', 'loa', 'status', 'CTC', 0, false, null,
       'Use LOA email template.', 21),
      (wf, 'CTC celebration calls: LO calls borrower + agent', 'lo', 'status', 'CTC', 0, false, null,
       'Automated Floify sends CTC email to all parties. LO adds personal celebration + expectations.', 22),
      (wf, 'Track funding + move file to closed tracking', 'loa', 'status', 'Funded', 0, false, null,
       'Update Pipeline → Funded. Internal celebration. Move to Post-Close SOP.', 23);
  end if;
end $$;

notify pgrst, 'reload schema';
