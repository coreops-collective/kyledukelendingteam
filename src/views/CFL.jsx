import { useEffect, useMemo, useState } from 'react';
import { LOANS } from '../data/loans.js';
import { PAST_CLIENTS } from '../data/pastClients.js';
import {
  loadClientDates, getAllDates, upsertClientDate, deleteClientDate,
  parseLocalDate, allKnownDateLabels, collectClientNames,
} from '../lib/clientDates.js';
import {
  loadWorkflows, getWorkflows, getTasksFor,
  createWorkflow, updateWorkflow, deleteWorkflow,
  createTask, updateTask, deleteTask,
  markTaskCompleted, unmarkTaskCompleted,
  generateTasksForClient, generateStatusTasks, buildAnchorsForClient, composeMailto,
  ROLES, ROLE_LABELS, TRIGGER_BUILTIN_CLOSING, WORKFLOW_CATEGORIES,
  CONDITION_FIELDS, CONDITION_OPS,
} from '../lib/workflows.js';
import {
  loadClientProfiles, getProfile, upsertClientProfile, REVIEW_SOURCES,
} from '../lib/clientProfiles.js';
import {
  loadKeyDateTypes, getKeyDateTypes, getKeyDateTypeLabels,
  createKeyDateType, updateKeyDateType, deleteKeyDateType,
} from '../lib/keyDateTypes.js';

const DAY = 86400000;
const fmtDate = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const fmtMonthDay = (d) => d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

export default function CFL() {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [filterRole, setFilterRole] = useState('All');
  const [filterStatus, setFilterStatus] = useState('Open');
  const [openClient, setOpenClient] = useState(null); // client name string or null
  // Bump every time underlying data changes so memos that read from
  // module-level stores (getAllDates / getWorkflows / getProfile /
  // getKeyDateTypes) re-run. Previously the task list cached its
  // result and only refreshed when the user toggled a filter.
  const [dataVersion, setDataVersion] = useState(0);
  // Search / focus filters layered ON TOP of role + status so the team
  // can drill from 800 tasks down to "just this client" or "just my
  // birthday workflow" without scrolling.
  const [search, setSearch] = useState('');
  const [filterWorkflow, setFilterWorkflow] = useState('All');
  // Collapsed-by-default for non-urgent buckets — the user complained
  // about 800 tasks showing as "due soon." This Month + Later both
  // stay collapsed unless explicitly expanded.
  const [collapsed, setCollapsed] = useState({ 'This Month': true, 'Later': true });
  // Historical past clients (some going back years) generate
  // year-1 / year-2 anniversary tasks whose due date is in the deep
  // past. Sending a card 4 years late is pointless, and it drowns
  // the Overdue bucket in noise. Default: hide anything more than
  // 30 days overdue. The toggle in the toolbar surfaces them if
  // Kimberly ever wants to prove they're there.
  const [showAncient, setShowAncient] = useState(false);
  const ANCIENT_DAYS = 30;

  useEffect(() => {
    const bumpAll = () => {
      bump();
      setDataVersion((v) => v + 1);
    };
    loadClientDates().then(bumpAll);
    loadWorkflows().then(bumpAll);
    loadClientProfiles().then(bumpAll);
    loadKeyDateTypes().then(bumpAll);
    const events = [
      'kdt-client-dates-changed', 'kdt-client-dates-loaded',
      'kdt-workflows-changed', 'kdt-workflows-loaded',
      'kdt-client-profiles-changed', 'kdt-client-profiles-loaded',
      'kdt-key-date-types-changed', 'kdt-key-date-types-loaded',
    ];
    events.forEach((evt) => window.addEventListener(evt, bumpAll));
    return () => events.forEach((evt) => window.removeEventListener(evt, bumpAll));
  }, []);

  // Build the live task list. For every active loan and every past
  // client we generate every workflow_task that resolves against the
  // anchor dates we have on file for them. Sorted by due date.
  //
  // Depends on dataVersion so the list refreshes the instant any
  // underlying store fires its change event (client_dates updated,
  // task completed, workflow added, etc.). Previously the memo deps
  // were only [filterRole, filterStatus], so the task list went stale
  // until the user touched a filter.
  const generated = useMemo(() => {
    const clientDates = getAllDates();
    const seen = new Map();
    const collect = (name, rawCloseDate) => {
      if (!name) return;
      const k = name.trim().toLowerCase();
      // LOANS stores closeDate as "M/D/YYYY"; PAST_CLIENTS stores
      // "YYYY-MM-DD". A lexicographic compare across the two formats
      // returned garbage and we'd silently pick the wrong record (and
      // wrong year for the anchor). Parse both into real Dates first.
      const parsed = rawCloseDate ? parseLocalDate(rawCloseDate) : null;
      const prev = seen.get(k);
      if (prev) {
        const prevParsed = prev.parsed;
        // Keep whichever record has the more recent close date. Records
        // missing a closeDate lose to anything with one.
        if (prevParsed && (!parsed || parsed <= prevParsed)) return;
      }
      seen.set(k, { name: name.trim(), closeDate: rawCloseDate, parsed });
    };
    LOANS.forEach((l) => {
      collect(l.borrower, l.closeDate);
      // Co-borrower on the loan becomes their own client for CFL
      // purposes. They inherit the loan's closeDate for Closing +
      // Closing Anniversary triggers, and any birthday saved
      // against their name via NewLoan intake or the CoBorrowerEditor
      // fires their own birthday tasks.
      const coFirst = l.coFirst || l.c2first;
      const coLast = l.coLast || l.c2last;
      if (coFirst && coLast) {
        collect(`${coLast}, ${coFirst}`.trim(), l.closeDate);
      }
    });
    PAST_CLIENTS.forEach((c) => collect(c.name, c.closeDate));
    // Also pick up anyone who has a client_dates entry but isn't in
    // LOANS or PAST_CLIENTS (e.g., a co-borrower whose birthday was
    // saved before their name landed in the loans record). Ensures
    // saved birthdays never orphan.
    clientDates.forEach((row) => {
      if (row.client_name) collect(row.client_name, null);
    });
    const items = [];
    seen.forEach(({ name, closeDate }) => {
      const anchors = buildAnchorsForClient(name, { closeDate, clientDates });
      if (anchors.size === 0) return;
      items.push(...generateTasksForClient(name, anchors));
    });
    // Status-triggered tasks iterate LOANS by current status (not by
    // client-with-anchor) so they're generated in a separate pass.
    items.push(...generateStatusTasks(LOANS));
    items.sort((a, b) => a.due_date - b.due_date);
    return items;
  }, [dataVersion]);

  const filtered = generated.filter((it) => {
    if (filterRole !== 'All' && (it.task.role || 'lo') !== filterRole.toLowerCase()) return false;
    if (filterStatus === 'Open' && it.completed) return false;
    if (filterStatus === 'Done' && !it.completed) return false;
    if (filterWorkflow !== 'All' && it.workflow.name !== filterWorkflow) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${it.client_name} ${it.task.title} ${it.workflow.name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const buckets = [
    { label: 'Overdue', items: [] },
    { label: 'Today', items: [] },
    { label: 'This Week', items: [] },
    { label: 'This Month', items: [] },
    { label: 'Later', items: [] },
  ];
  let ancientHidden = 0;
  filtered.forEach((it) => {
    const days = Math.round((it.due_date - today) / DAY);
    if (days < -ANCIENT_DAYS && !showAncient) { ancientHidden += 1; return; }
    if (days < 0) buckets[0].items.push(it);
    else if (days === 0) buckets[1].items.push(it);
    else if (days <= 7) buckets[2].items.push(it);
    else if (days <= 31) buckets[3].items.push(it);
    else buckets[4].items.push(it);
  });

  // Birthdays this month — separate from the task list since the user
  // specifically asked for an at-a-glance panel. Past-month birthdays
  // for the current calendar month are filtered out (no "Jan 3" panel
  // entry on Jan 20). Days-away is always >= 0 because we project to
  // this year first and skip anything already passed.
  const birthdaysThisMonth = useMemo(() => {
    const month = today.getMonth();
    const out = [];
    getAllDates().forEach((row) => {
      if (!row.date_value) return;
      if (!/birthday/i.test(row.date_label)) return;
      const d = parseLocalDate(row.date_value);
      if (!d) return;
      if (d.getMonth() !== month) return;
      const next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
      const daysAway = Math.round((next - today) / DAY);
      if (daysAway < 0) return; // already happened this month
      out.push({ name: row.client_name, label: row.date_label, raw: row.date_value, monthDay: fmtMonthDay(d), daysAway });
    });
    return out.sort((a, b) => a.daysAway - b.daysAway);
  }, [dataVersion]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '14px 18px', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: 'var(--shadow-sm)', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px' }}>
            Client for Life · Task List
          </div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
            Auto-generated from your workflows + each client's key dates · {filtered.length} of {generated.length} tasks
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic' }}>
          Workflows &amp; key date types are managed on the Workflows &amp; SOPs tab.
        </div>
      </div>

      <BirthdaysPanel rows={birthdaysThisMonth} onOpenDates={null} onOpenClient={setOpenClient} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client, task, or workflow…"
          style={{ flex: '1 1 240px', minWidth: 240, padding: '8px 12px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 999, boxSizing: 'border-box' }}
        />
        <FilterChip label="Role" value={filterRole} options={['All', 'LO', 'LOA', 'Admin', 'Automated']} onChange={setFilterRole} />
        <FilterChip
          label="Workflow"
          value={filterWorkflow}
          options={['All', ...getWorkflows().map((w) => w.name)]}
          onChange={setFilterWorkflow}
        />
        <FilterChip label="Status" value={filterStatus} options={['Open', 'Done', 'All']} onChange={setFilterStatus} />
        {ancientHidden > 0 && !showAncient && (
          <button
            className="form-btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
            title={`Hidden: ${ancientHidden} tasks more than 30 days overdue (mostly year-1 anniversary tasks from old past clients).`}
            onClick={() => setShowAncient(true)}
          >Show {ancientHidden} ancient overdue</button>
        )}
        {showAncient && (
          <button
            className="form-btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => setShowAncient(false)}
          >Hide ancient</button>
        )}
        {(search || filterRole !== 'All' || filterWorkflow !== 'All' || filterStatus !== 'Open') && (
          <button
            className="form-btn"
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => { setSearch(''); setFilterRole('All'); setFilterWorkflow('All'); setFilterStatus('Open'); }}
          >Reset</button>
        )}
      </div>

      {generated.length === 0 ? (
        <EmptyState />
      ) : (
        buckets.map((b) => b.items.length > 0 && (
          <Section
            key={b.label}
            label={b.label}
            items={b.items}
            today={today}
            onOpenClient={setOpenClient}
            collapsed={!!collapsed[b.label]}
            onToggle={() => setCollapsed((c) => ({ ...c, [b.label]: !c[b.label] }))}
          />
        ))
      )}

      {openClient && <ClientCardDrawer clientName={openClient} onClose={() => setOpenClient(null)} />}
    </div>
  );
}

function FilterChip({ label, value, options, onChange }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#0A0A0A', color: '#fff', borderRadius: 999, padding: '6px 12px' }}>
      <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.6px', color: '#aaa' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: 'transparent', color: '#fff', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
        {options.map((o) => <option key={o} value={o} style={{ color: '#000' }}>{o}</option>)}
      </select>
    </div>
  );
}

function BirthdaysPanel({ rows, onOpenDates, onOpenClient }) {
  if (rows.length === 0) return null;
  return (
    <div className="section-card" style={{ marginBottom: 16 }}>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="section-title">Birthdays This Month</div>
          <div className="section-sub">{rows.length} client{rows.length === 1 ? '' : 's'} · click a name to open their card</div>
        </div>
        {onOpenDates && (
          <button className="form-btn" type="button" onClick={onOpenDates}>+ Add</button>
        )}
      </div>
      <div className="section-body" style={{ padding: 0 }}>
        {rows.map((r) => (
          <div key={`${r.name}-${r.label}`} style={{
            display: 'grid', gridTemplateColumns: '1fr 140px 100px', gap: 10,
            padding: '10px 18px', borderTop: '1px solid #f1f1f1', alignItems: 'center',
            background: r.daysAway <= 3 ? '#fff8e1' : '#fff',
          }}>
            <div
              onClick={() => onOpenClient && onOpenClient(r.name)}
              style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--brand-red)' }}
            >{r.name}</div>
            <div style={{ color: '#555' }}>{r.monthDay}</div>
            <div style={{ textAlign: 'right', fontSize: 11, fontWeight: r.daysAway <= 3 ? 700 : 400, color: r.daysAway <= 3 ? '#c62828' : '#888' }}>
              {r.daysAway === 0 ? 'TODAY' : `${r.daysAway}d away`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Section({ label, items, today, onOpenClient, collapsed, onToggle }) {
  const headerColor = label === 'Overdue' ? '#c62828' : label === 'Today' ? '#e65100' : '#555';
  // Cap rendered rows per section so a Later bucket with 500 items
  // doesn't blow up the DOM. The team can "Show all" if they really
  // need to scroll the long tail.
  const [showAll, setShowAll] = useState(false);
  const CAP = 50;
  const visible = !collapsed && (showAll || items.length <= CAP) ? items : items.slice(0, collapsed ? 0 : CAP);
  const hidden = items.length - visible.length;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={onToggle}
        style={{
          fontFamily: "'Oswald',sans-serif", fontSize: 11, textTransform: 'uppercase',
          letterSpacing: 1, color: headerColor, margin: '6px 0 8px',
          cursor: onToggle ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 6,
          userSelect: 'none',
        }}
      >
        <span style={{ display: 'inline-block', width: 12, color: '#888' }}>{collapsed ? '▸' : '▾'}</span>
        {label} ({items.length})
      </div>
      {!collapsed && (
        <div className="section-card">
          {visible.map((it, i) => (
            <TaskRow key={it.id} item={it} today={today} first={i === 0} onOpenClient={onOpenClient} />
          ))}
          {hidden > 0 && (
            <div
              onClick={() => setShowAll(true)}
              style={{ padding: '10px 14px', textAlign: 'center', fontSize: 12, color: '#888', borderTop: '1px solid #f1f1f1', cursor: 'pointer', background: '#fafafa' }}
            >
              Show {hidden} more…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ item, today, first, onOpenClient }) {
  const role = item.task.role || 'lo';
  const roleColors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
  const days = Math.round((item.due_date - today) / DAY);
  const dueLabel = days < 0 ? `${-days}d overdue` : days === 0 ? 'Today' : `${days}d`;
  const onToggle = () => {
    const due = item.due_date;
    const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`;
    if (item.completed) unmarkTaskCompleted(item.task.id, item.client_name, iso);
    else markTaskCompleted(item.task.id, item.client_name, iso);
  };
  // Two dates per row now: the due date (when the task should be
  // done) and the underlying trigger date (the closing anniversary /
  // birthday / lease end / etc. that the task is anchored to).
  // Showing both makes "Send card 7 days before Birthday" legible
  // at a glance — you see "Due Jul 15 · Birthday Jul 22".
  const showAnchor = item.anchor_date && +item.anchor_date !== +item.due_date;
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '30px 1fr 220px 90px 80px', gap: 10,
      padding: '12px 14px', borderTop: first ? 'none' : '1px solid #f1f1f1',
      alignItems: 'center', background: item.completed ? '#fafafa' : '#fff',
    }}>
      <input type="checkbox" checked={item.completed} onChange={onToggle}
        style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--brand-red)' }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: item.completed ? '#aaa' : '#222', textDecoration: item.completed ? 'line-through' : 'none' }}>
          {item.task.title}
        </div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
          <span
            onClick={(e) => { e.stopPropagation(); onOpenClient && onOpenClient(item.client_name); }}
            style={{ color: 'var(--brand-red)', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline', textDecorationColor: 'rgba(198,40,40,.3)' }}
          >
            {item.client_name}
          </span>
          {' · '}{item.workflow.name}
          {item.task.notes ? ` · ${item.task.notes}` : ''}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#666' }}>
        <div><strong style={{ color: '#222', fontWeight: 700 }}>Due</strong> {fmtDate(item.due_date)}</div>
        {showAnchor && (
          <div style={{ marginTop: 2, color: '#888' }}>
            {item.anchor_label} {fmtDate(item.anchor_date)}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: roleColors[role] || '#555', padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>
          {ROLE_LABELS[role] || role}
        </span>
        {item.task.email_subject && (
          <a
            href={(() => {
              const loan = LOANS.find((l) => (l.borrower || '').trim().toLowerCase() === (item.client_name || '').trim().toLowerCase());
              return composeMailto(item.task, item.client_name, loan) || '#';
            })()}
            onClick={(e) => e.stopPropagation()}
            title="Compose email from template"
            style={{
              fontSize: 10, fontWeight: 700, color: '#fff', background: '#0d47a1',
              padding: '3px 8px', borderRadius: 4, textDecoration: 'none',
              textTransform: 'uppercase', letterSpacing: '.5px',
            }}
          >📧 Email</a>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: 11, fontWeight: days < 0 ? 700 : 400, color: days < 0 ? '#c62828' : days === 0 ? '#e65100' : '#888' }}>
        {dueLabel}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="section-card">
      <div className="section-body" style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No tasks yet</div>
        <div style={{ fontSize: 12, color: '#666' }}>
          Head to <strong>Workflows &amp; SOPs</strong> to build a workflow, and to <strong>Manage Key Date Types</strong> to define the dates workflows trigger off (Birthday, Wedding Anniversary, etc.). Then add per-client dates on each client's card.
        </div>
      </div>
    </div>
  );
}

// ─── Manage Key Date Types drawer ───────────────────────────────
// Global catalog: define WHAT kinds of dates the team tracks (Birthday,
// Wedding Anniversary, Lease End, etc.). Per-client VALUES are set on
// each client's card, not here.
export function ManageKeyDateTypesDrawer({ onClose }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newRecurring, setNewRecurring] = useState(true);

  const types = getKeyDateTypes();

  const submitNew = async () => {
    const label = newLabel.trim();
    if (!label) return;
    await createKeyDateType(label, newRecurring);
    setNewLabel('');
    setAdding(false);
    bump();
  };

  const inputStyle = { padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 600, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Client for Life</div>
          <div className="drawer-borrower">Key Date Types</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            What kinds of dates the team tracks. Per-client dates are set on each client's card.
          </div>
        </div>
        <div className="drawer-body">
          <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 8 }}>
            Catalog ({types.length})
          </div>

          {types.length === 0 ? (
            <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', padding: 12 }}>
              No date types defined yet. Add one below — Birthday is a good starting point.
            </div>
          ) : (
            types.map((t) => (
              <KeyDateTypeRow key={t.id} type={t} onChange={bump} />
            ))
          )}

          {adding ? (
            <div style={{ marginTop: 12, padding: 12, border: '1px dashed #d0d0d0', borderRadius: 8 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Lease End, Kid's Birthday"
                  style={{ ...inputStyle, width: '100%' }} autoFocus />
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                  <input type="checkbox" checked={newRecurring} onChange={(e) => setNewRecurring(e.target.checked)} />
                  Yearly by default
                </label>
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button className="form-btn" onClick={() => { setAdding(false); setNewLabel(''); }}>Cancel</button>
                <button className="form-btn primary" onClick={submitNew} disabled={!newLabel.trim()}>Add</button>
              </div>
            </div>
          ) : (
            <button className="form-btn primary" style={{ width: '100%', marginTop: 12 }} onClick={() => setAdding(true)}>
              + New date type
            </button>
          )}

          <div style={{ marginTop: 16, padding: 10, background: '#f5f5f5', borderRadius: 6, fontSize: 11, color: '#555' }}>
            <strong>Tip:</strong> deleting a type doesn't remove dates already entered on client cards —
            those values just stop showing up unless you re-add the type with the same name.
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" type="button" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

function KeyDateTypeRow({ type, onChange }) {
  const inputStyle = { padding: '6px 8px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 30px', gap: 8, padding: '8px 0', borderBottom: '1px solid #f5f5f5', alignItems: 'center' }}>
      <input
        defaultValue={type.label}
        onBlur={(e) => {
          const next = e.target.value.trim();
          if (next && next !== type.label) updateKeyDateType(type.id, { label: next }).then(onChange);
        }}
        style={{ ...inputStyle, width: '100%' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
        <input type="checkbox" defaultChecked={!!type.recurring_default}
          onChange={(e) => updateKeyDateType(type.id, { recurring_default: e.target.checked }).then(onChange)} />
        Yearly
      </label>
      <button
        onClick={async () => {
          if (!window.confirm(`Delete date type "${type.label}"? Per-client values you've already entered will stay in the database but won't show up on client cards.`)) return;
          await deleteKeyDateType(type.id);
          onChange && onChange();
        }}
        title="Delete type"
        style={{ background: 'transparent', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: 14 }}
      >×</button>
    </div>
  );
}

// Read-only row for a date that's derived from the loan record (i.e.
// the user shouldn't have to type it). Used for "Closing" and
// "Closing Anniversary" which both share the same source value.
function DerivedDateRow({ label, value, fromLoan, badge }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px', gap: 8, padding: '6px 0', alignItems: 'center', background: '#fafafa', borderRadius: 6, marginBottom: 4 }}>
      <div style={{ fontSize: 13, color: '#222', fontWeight: 600, paddingLeft: 8 }}>
        {label}
        {fromLoan && <span style={{ fontSize: 10, color: '#888', fontWeight: 400, marginLeft: 6 }}>· from loan</span>}
        {badge && <span style={{ fontSize: 10, background: '#e3f2fd', color: '#0d47a1', fontWeight: 600, marginLeft: 6, padding: '1px 6px', borderRadius: 8 }}>{badge}</span>}
      </div>
      <div style={{ fontSize: 12, color: value ? '#222' : '#bbb', padding: '6px 8px' }}>{value || 'Not on file'}</div>
      <div style={{ fontSize: 11, color: '#888', textAlign: 'right', paddingRight: 8 }}>
        {value ? fmtMonthDay(parseLocalDate(value)) : ''}
      </div>
    </div>
  );
}

// One row per global key-date TYPE on the client card. Pre-fills with
// the matching client_dates row if it exists; otherwise the input is
// blank. Setting the date persists; clearing it deletes the row.
function ClientDateInput({ clientName, type, existing, onChange }) {
  const [value, setValue] = useState(existing?.date_value || '');
  const persist = async (next) => {
    const v = (next ?? value).trim();
    if (!v) {
      if (existing) {
        await deleteClientDate(clientName, type.label);
        onChange && onChange();
      }
      return;
    }
    await upsertClientDate(clientName, type.label, v, {
      recurring: existing ? existing.recurring : !!type.recurring_default,
    });
    onChange && onChange();
  };
  const monthDay = value ? fmtMonthDay(parseLocalDate(value)) : '';

  const inputStyle = { padding: '6px 8px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px', gap: 8, padding: '6px 0', alignItems: 'center' }}>
      <div style={{ fontSize: 13, color: '#222', fontWeight: value ? 600 : 400 }}>{type.label}</div>
      <input type="date" value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => persist()}
        style={{ ...inputStyle, width: '100%' }} />
      <div style={{ fontSize: 11, color: '#888', textAlign: 'right' }}>{monthDay}</div>
    </div>
  );
}


// ─── Client Card drawer ─────────────────────────────────────────
// One-stop client view: shows their loan/past-client info, every key
// date inline-editable, and the review tracking checkbox/source/date.
// Reachable from any client-name link in the task list AND from the
// "Open card" button next to each client in ManageDatesDrawer.
function ClientCardDrawer({ clientName, onClose }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const profile = getProfile(clientName) || {};

  const [reviewLeft, setReviewLeft] = useState(!!profile.review_left);
  const [reviewSource, setReviewSource] = useState(profile.review_source || '');
  const [reviewDate, setReviewDate] = useState(profile.review_date || '');
  const [notes, setNotes] = useState(profile.notes || '');

  const persistProfile = async (patch) => {
    await upsertClientProfile(clientName, patch);
    bump();
  };

  // Look up best-known loan + past-client records for the header.
  const activeLoan = LOANS.find((l) => l.borrower && l.borrower.trim().toLowerCase() === clientName.trim().toLowerCase());
  const pastClient = PAST_CLIENTS.find((c) => c.name && c.name.trim().toLowerCase() === clientName.trim().toLowerCase());
  const closeDate = activeLoan?.closeDate || pastClient?.closeDate;
  const property = activeLoan?.property || pastClient?.property;
  const lo = activeLoan?.lo || pastClient?.lo;
  const agent = activeLoan?.agent || pastClient?.agent;

  // For this client, render one row per GLOBAL key-date type (from
  // key_date_types). Pre-fills with the matching client_dates row if
  // one exists. Plus any orphan dates the client has whose label
  // isn't in the global catalog anymore — keeps the data discoverable
  // until the type is added back or the value is cleared.
  const types = getKeyDateTypes();
  const allClientDates = useMemo(
    () => [...getAllDates().values()].filter(
      (r) => r.client_name && r.client_name.trim().toLowerCase() === clientName.trim().toLowerCase()
    ),
    [clientName]
  );
  const datesByLabel = useMemo(() => {
    const m = new Map();
    allClientDates.forEach((r) => m.set(r.date_label.toLowerCase(), r));
    return m;
  }, [allClientDates]);
  const orphanDates = allClientDates.filter(
    (r) => !types.some((t) => t.label.toLowerCase() === r.date_label.toLowerCase())
  );

  const inputStyle = { width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6, display: 'block' };

  return (
    <>
      <div className="drawer-overlay open" style={{ zIndex: 200 }} onClick={onClose} />
      <aside className="drawer open" style={{ width: 620, maxWidth: '95vw', zIndex: 201 }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Client Card</div>
          <div className="drawer-borrower">{clientName}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            {closeDate ? `Closed ${closeDate}` : 'No closing on file'}
            {lo ? ` · LO: ${lo}` : ''}
            {agent ? ` · Agent: ${agent}` : ''}
          </div>
        </div>
        <div className="drawer-body">
          {property && (
            <div style={{ marginBottom: 18, padding: 10, background: '#fafafa', border: '1px solid #eee', borderRadius: 6, fontSize: 12, color: '#444' }}>
              <span style={{ fontWeight: 600 }}>Property:</span> {property}
            </div>
          )}

          {/* ─── Review tracking ─── */}
          <div style={{ marginBottom: 22, padding: 14, background: reviewLeft ? '#e8f5e9' : '#fff', border: `1px solid ${reviewLeft ? '#a5d6a7' : '#e5e5e5'}`, borderRadius: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#222' }}>
              <input type="checkbox" checked={reviewLeft}
                onChange={(e) => {
                  setReviewLeft(e.target.checked);
                  persistProfile({
                    review_left: e.target.checked,
                    review_date: e.target.checked && !reviewDate ? new Date().toISOString().slice(0, 10) : (reviewDate || null),
                  });
                  if (e.target.checked && !reviewDate) setReviewDate(new Date().toISOString().slice(0, 10));
                }}
                style={{ width: 20, height: 20, accentColor: '#2e7d32' }} />
              {reviewLeft ? '⭐ Review left' : 'Has this client left a review?'}
            </label>
            {reviewLeft && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                <div>
                  <label style={labelStyle}>When</label>
                  <input type="date" value={reviewDate}
                    onChange={(e) => setReviewDate(e.target.value)}
                    onBlur={() => persistProfile({ review_date: reviewDate || null })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Where</label>
                  <select value={reviewSource}
                    onChange={(e) => { setReviewSource(e.target.value); persistProfile({ review_source: e.target.value }); }}
                    style={inputStyle}>
                    <option value="">— Pick —</option>
                    {REVIEW_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ─── Key dates: one input per global type ─── */}
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555', marginBottom: 8 }}>
              Key Dates
            </div>
            {/* Derived rows — pulled from the loan automatically so
                nobody has to enter them by hand. Workflows trigger
                off these labels via the same path. */}
            <DerivedDateRow label="Closing" value={closeDate} fromLoan />
            {closeDate && (
              <DerivedDateRow
                label="Closing Anniversary"
                value={closeDate}
                fromLoan
                badge="yearly"
              />
            )}
            {types.length === 0 ? (
              <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 8 }}>
                No date types defined. Open "Manage Key Date Types" from the main view to add some (Birthday, Anniversary, etc.).
              </div>
            ) : (
              types
                // Don't render an input for derived labels — those
                // come from the loan, not from a manual entry.
                .filter((t) => !['closing', 'closing anniversary'].includes(t.label.toLowerCase()))
                .map((t) => (
                  <ClientDateInput
                    key={t.id}
                    clientName={clientName}
                    type={t}
                    existing={datesByLabel.get(t.label.toLowerCase())}
                    onChange={bump}
                  />
                ))
            )}
            {orphanDates.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e0e0e0' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
                  Other dates on file (type no longer in catalog)
                </div>
                {orphanDates.map((row) => (
                  <ClientDateInput
                    key={row.id}
                    clientName={clientName}
                    type={{ label: row.date_label, recurring_default: row.recurring }}
                    existing={row}
                    onChange={bump}
                  />
                ))}
              </div>
            )}
          </div>

          {/* ─── Notes ─── */}
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => persistProfile({ notes: notes.trim() || null })}
              rows={4}
              placeholder="Anything memorable — kids' names, gift ideas, what to mention next call."
              style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" type="button" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}

// ─── Workflow Editor drawer ─────────────────────────────────────
export function WorkflowEditorDrawer({ onClose }) {
  const [, force] = useState(0);
  const bump = () => force((n) => n + 1);
  const [activeId, setActiveId] = useState(getWorkflows()[0]?.id || null);
  const [editingTask, setEditingTask] = useState(null);
  const [draggingTaskId, setDraggingTaskId] = useState(null);

  useEffect(() => {
    if (!activeId && getWorkflows()[0]) setActiveId(getWorkflows()[0].id);
  }, [activeId]);

  const handleNewWorkflow = async () => {
    const name = window.prompt('Name the workflow (e.g. "New Funded Loan", "Birthday Outreach")');
    if (!name) return;
    // Ask which bucket the workflow belongs to so it lands in the
    // right place on the Workflows / SOPs page.
    const catRaw = window.prompt(
      'Category?\n\n1 = Client for Life\n2 = Loan\n3 = Lead Nurture\n4 = Other',
      '2'
    );
    const catMap = { '1': 'Client for Life', '2': 'Loan', '3': 'Lead Nurture', '4': 'Other' };
    const category = catMap[(catRaw || '').trim()] || 'Loan';
    const wf = await createWorkflow(name.trim(), '', category);
    if (wf) setActiveId(wf.id);
    bump();
  };

  const handleDeleteWorkflow = async (wf) => {
    if (!window.confirm(`Delete workflow "${wf.name}" and all of its tasks? This can't be undone.`)) return;
    await deleteWorkflow(wf.id);
    const remaining = getWorkflows();
    setActiveId(remaining[0]?.id || null);
    bump();
  };

  const handleAddTask = async () => {
    if (!active) return;
    const t = await createTask(active.id, { title: 'New task' });
    if (t) setEditingTask(t);
    bump();
  };

  const handleDuplicateTask = async (t) => {
    const copy = await createTask(active.id, {
      title: `${t.title} (copy)`,
      role: t.role,
      trigger_label: t.trigger_label,
      trigger_days: t.trigger_days,
      trigger_recurring: t.trigger_recurring,
      notes: t.notes,
    });
    if (copy) setEditingTask(copy);
    bump();
  };

  // Drag-to-reorder: track which task is being dragged, swap positions
  // on drop, persist new ordering to Supabase one updateTask call per
  // task. Cheap for typical workflow sizes (5–30 tasks).
  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = async (targetTask) => {
    if (!draggingTaskId || draggingTaskId === targetTask.id) return;
    const list = [...(getTasksFor(active.id) || [])];
    const fromIdx = list.findIndex((t) => t.id === draggingTaskId);
    const toIdx = list.findIndex((t) => t.id === targetTask.id);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    await Promise.all(list.map((t, i) =>
      t.position !== i ? updateTask(t.id, { position: i }) : null
    ));
    setDraggingTaskId(null);
    bump();
  };

  const active = getWorkflows().find((w) => w.id === activeId);
  const tasks = active ? getTasksFor(active.id) : [];
  // Workflow triggers source from the global key_date_types catalog
  // (managed in Manage Key Date Types) plus the built-in Closing
  // anchor. Falls back to the historical allKnownDateLabels() when the
  // catalog is empty so the editor isn't broken pre-seed.
  const catalogLabels = getKeyDateTypeLabels();
  const triggerLabels = catalogLabels.length > 0
    ? [TRIGGER_BUILTIN_CLOSING, ...catalogLabels]
    : [TRIGGER_BUILTIN_CLOSING, ...allKnownDateLabels()];

  return (
    <>
      <div className="drawer-overlay open" onClick={onClose} />
      <aside className="drawer open" style={{ width: 980, maxWidth: '95vw' }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Client for Life</div>
          <div className="drawer-borrower">Workflows</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>Build templates · drag to reorder · click a task to edit</div>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
          <WorkflowSidebar
            workflows={getWorkflows()}
            activeId={activeId}
            onPick={setActiveId}
            onNew={handleNewWorkflow}
          />

          {active ? (
            <div>
              <WorkflowHeader workflow={active} onDelete={() => handleDeleteWorkflow(active)} bump={bump} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
                <div style={{ fontFamily: "'Oswald',sans-serif", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: '#555' }}>
                  Tasks ({tasks.length})
                </div>
                <button className="form-btn primary" onClick={handleAddTask}>+ Add Task</button>
              </div>

              {tasks.length === 0 ? (
                <EmptyTaskState onAdd={handleAddTask} />
              ) : (
                tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    isDragging={draggingTaskId === t.id}
                    onDragStart={() => setDraggingTaskId(t.id)}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(t)}
                    onEdit={() => setEditingTask(t)}
                    onDuplicate={() => handleDuplicateTask(t)}
                    onDelete={async () => {
                      if (window.confirm(`Delete task "${t.title}"?`)) {
                        await deleteTask(t.id);
                        bump();
                      }
                    }}
                  />
                ))
              )}
            </div>
          ) : (
            <div style={{ color: '#888', fontSize: 13, padding: '40px 20px', textAlign: 'center' }}>
              Create a workflow on the left to start building tasks.
            </div>
          )}
        </div>
        <div className="drawer-actions">
          <button className="drawer-btn primary" type="button" onClick={onClose}>Done</button>
        </div>
      </aside>

      {editingTask && (
        <TaskEditDrawer
          task={editingTask}
          triggerLabels={triggerLabels}
          onClose={() => { setEditingTask(null); bump(); }}
          onDelete={async () => {
            await deleteTask(editingTask.id);
            setEditingTask(null);
            bump();
          }}
        />
      )}
    </>
  );
}

function WorkflowSidebar({ workflows, activeId, onPick, onNew }) {
  return (
    <div style={{ borderRight: '1px solid #eee', paddingRight: 12 }}>
      <button className="form-btn primary" style={{ width: '100%', marginBottom: 10 }} onClick={onNew}>+ New Workflow</button>
      {workflows.length === 0 ? (
        <div style={{ fontSize: 12, color: '#888', fontStyle: 'italic', padding: 8 }}>
          No workflows yet. Create one to get started.
        </div>
      ) : (
        workflows.map((wf) => {
          const count = (getTasksFor(wf.id) || []).length;
          const isActive = wf.id === activeId;
          return (
            <div key={wf.id} onClick={() => onPick(wf.id)} style={{
              padding: '10px 12px', borderRadius: 6, marginBottom: 4, cursor: 'pointer',
              background: isActive ? '#0A0A0A' : 'transparent',
              color: isActive ? '#fff' : '#222',
              fontSize: 13,
              transition: 'background .12s',
            }}>
              <div style={{ fontWeight: 600 }}>{wf.name || 'Untitled'}</div>
              <div style={{ fontSize: 10, color: isActive ? '#bbb' : '#888', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>{count} task{count === 1 ? '' : 's'}</span>
                {wf.category && (
                  <span style={{ padding: '1px 6px', background: isActive ? 'rgba(255,255,255,.15)' : '#eee', color: isActive ? '#fff' : '#555', borderRadius: 10, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.3px' }}>{wf.category}</span>
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function WorkflowHeader({ workflow, onDelete, bump }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, padding: '4px 0' }}>
      <div style={{ flex: 1 }}>
        <input
          defaultValue={workflow.name}
          onBlur={(e) => {
            const v = e.target.value.trim() || workflow.name;
            if (v !== workflow.name) updateWorkflow(workflow.id, { name: v }).then(bump);
          }}
          style={{
            width: '100%', fontFamily: "'Oswald',sans-serif", fontSize: 22, fontWeight: 700,
            border: 'none', borderBottom: '1px solid transparent', padding: '4px 2px',
            background: 'transparent', outline: 'none',
          }}
          onFocus={(e) => e.target.style.borderBottomColor = '#0A0A0A'}
          onBlurCapture={(e) => e.target.style.borderBottomColor = 'transparent'}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px' }}>Category</span>
          <select
            value={workflow.category || 'Loan'}
            onChange={(e) => updateWorkflow(workflow.id, { category: e.target.value }).then(bump)}
            style={{ padding: '4px 8px', fontSize: 12, border: '1px solid #d0d0d0', borderRadius: 6, fontFamily: 'inherit' }}
          >
            {WORKFLOW_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          defaultValue={workflow.description || ''}
          placeholder="Description (optional)"
          onBlur={(e) => updateWorkflow(workflow.id, { description: e.target.value }).then(bump)}
          style={{
            width: '100%', fontSize: 12, color: '#666',
            border: 'none', padding: '4px 2px', marginTop: 4,
            background: 'transparent', outline: 'none',
          }}
        />
      </div>
      <button className="form-btn" style={{ color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>
        Delete workflow
      </button>
    </div>
  );
}

function EmptyTaskState({ onAdd }) {
  return (
    <div style={{
      padding: 30, textAlign: 'center', border: '2px dashed #e0e0e0',
      borderRadius: 8, color: '#888',
    }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#555', marginBottom: 6 }}>No tasks yet</div>
      <div style={{ fontSize: 12, marginBottom: 14 }}>
        Add tasks that should fire against every client this workflow runs on.
      </div>
      <button className="form-btn primary" onClick={onAdd}>+ Add first task</button>
    </div>
  );
}

function TaskCard({ task, isDragging, onDragStart, onDragOver, onDrop, onEdit, onDuplicate, onDelete }) {
  const role = task.role || 'lo';
  const roleColors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        background: '#fff',
        border: '1px solid #e5e5e5',
        borderRadius: 8,
        padding: 14,
        marginBottom: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,.04)',
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}
    >
      <div style={{ color: '#bbb', fontSize: 16, padding: '4px 4px 0', userSelect: 'none', cursor: 'grab' }} title="Drag to reorder">⋮⋮</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: '#fff',
            background: roleColors[role] || '#555',
            padding: '3px 8px', borderRadius: 4,
            textTransform: 'uppercase', letterSpacing: '.5px',
          }}>{ROLE_LABELS[role] || role}</span>
          <span style={{ fontSize: 11, color: '#888' }}>{triggerSummary(task)}</span>
        </div>
        <div
          style={{ fontSize: 14, fontWeight: 600, color: task.title ? '#222' : '#bbb', cursor: 'pointer' }}
          onClick={onEdit}
        >
          {task.title || 'Untitled task — click Edit'}
        </div>
        {task.notes && (
          <div style={{ fontSize: 12, color: '#666', marginTop: 4, lineHeight: 1.4 }}>{task.notes}</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px' }} onClick={onEdit}>Edit</button>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px' }} title="Duplicate" onClick={onDuplicate}>Copy</button>
        <button className="form-btn" style={{ fontSize: 11, padding: '4px 10px', color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>×</button>
      </div>
    </div>
  );
}

export function triggerSummary(t) {
  let base;
  if (t.trigger_kind === 'status') {
    const label = t.trigger_label || 'loan status';
    const interval = t.repeat_interval;
    const cadence = interval === 'daily' ? ' · every day'
      : interval === 'weekly' ? ' · every week'
      : interval === 'monthly' ? ' · every month'
      : '';
    base = `While in ${label}${cadence}`;
  } else {
    const days = t.trigger_days || 0;
    const label = t.trigger_label || TRIGGER_BUILTIN_CLOSING;
    const when = days === 0
      ? `On ${label}`
      : days < 0
        ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} before ${label}`
        : `${days} day${days === 1 ? '' : 's'} after ${label}`;
    base = t.trigger_recurring ? `${when} · every year` : when;
  }
  if (t.condition_field && t.condition_op && t.condition_field !== 'none') {
    const f = CONDITION_FIELDS.find((x) => x.value === t.condition_field);
    const ops = (CONDITION_OPS[f?.type] || []);
    const op = ops.find((x) => x.value === t.condition_op);
    if (f && op) base += ` · only if ${f.label.toLowerCase()} ${op.label.toLowerCase()}`;
  }
  return base;
}

// ─── Single-task edit drawer (opens over the workflow editor) ──
function TaskEditDrawer({ task, triggerLabels, onClose, onDelete }) {
  const [title, setTitle] = useState(task.title || '');
  const [role, setRole] = useState(task.role || 'lo');
  const [triggerKind, setTriggerKind] = useState(task.trigger_kind === 'status' ? 'status' : 'date');
  const [triggerLabel, setTriggerLabel] = useState(task.trigger_label || TRIGGER_BUILTIN_CLOSING);
  const initialDays = task.trigger_days || 0;
  const [mode, setMode] = useState(initialDays === 0 ? 'on' : initialDays < 0 ? 'before' : 'after');
  const [magnitude, setMagnitude] = useState(Math.abs(initialDays));
  const [recurring, setRecurring] = useState(!!task.trigger_recurring);
  const [repeatInterval, setRepeatInterval] = useState(task.repeat_interval || 'none');
  const [notes, setNotes] = useState(task.notes || '');
  const [conditionField, setConditionField] = useState(task.condition_field || 'none');
  const [conditionOp, setConditionOp] = useState(task.condition_op || '');
  const [emailRecipient, setEmailRecipient] = useState(task.email_recipient || 'none');
  const [emailSubject, setEmailSubject] = useState(task.email_subject || '');
  const [emailBody, setEmailBody] = useState(task.email_body || '');

  // Available loan statuses for status-triggered tasks. Sourced from
  // src/data/stages.js; keeps the picker in lockstep with the actual
  // status values loans can take on.
  const STATUS_OPTIONS = ['New Lead', 'Applied', 'HOT PA', 'REFI Watch', 'New Contract', 'Disclosed', 'Processing', 'Underwriting', 'CTC Required', 'CTC', 'Approved', 'Funded'];

  const effectiveDays = mode === 'on' ? 0 : mode === 'before' ? -Math.abs(magnitude) : Math.abs(magnitude);

  const save = async () => {
    await updateTask(task.id, {
      title: title.trim() || 'Untitled task',
      role,
      trigger_kind: triggerKind,
      trigger_label: triggerLabel,
      trigger_days: triggerKind === 'status' ? 0 : effectiveDays,
      trigger_recurring: triggerKind === 'date' ? recurring : false,
      repeat_interval: triggerKind === 'status' && repeatInterval !== 'none' ? repeatInterval : null,
      condition_field: conditionField === 'none' ? null : conditionField,
      condition_op: conditionField === 'none' ? null : conditionOp,
      email_recipient: emailRecipient === 'none' ? null : emailRecipient,
      email_subject: emailSubject.trim() || null,
      email_body: emailBody.trim() || null,
      notes: notes.trim() || null,
    });
    onClose();
  };

  // Live preview: when would this task fire for a representative client?
  const previewDate = useMemo(() => {
    // Just project from today as a stand-in anchor.
    const anchor = new Date();
    anchor.setHours(0, 0, 0, 0);
    const due = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + effectiveDays);
    return due;
  }, [effectiveDays]);

  const inputStyle = { width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d0d0d0', borderRadius: 6, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6, display: 'block' };
  const sectionStyle = { marginBottom: 18 };

  return (
    <>
      <div className="drawer-overlay open" style={{ zIndex: 200 }} onClick={onClose} />
      <aside className="drawer open" style={{ width: 560, maxWidth: '95vw', zIndex: 201 }}>
        <div className="drawer-head">
          <button className="drawer-close" onClick={onClose}>×</button>
          <div className="drawer-stage">Workflow Task</div>
          <div className="drawer-borrower">{title || 'Untitled task'}</div>
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>{triggerSummary({ trigger_label: triggerLabel, trigger_days: effectiveDays, trigger_recurring: recurring })}</div>
        </div>
        <div className="drawer-body">
          <div style={sectionStyle}>
            <label style={labelStyle}>Task</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to happen?" style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} autoFocus />
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Owner</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {ROLES.map((r) => {
                const active = role === r;
                const colors = { lo: '#555', loa: '#f5c518', admin: '#2e7d32', automated: '#C8102E' };
                return (
                  <button key={r} type="button" onClick={() => setRole(r)} style={{
                    padding: '8px 14px', borderRadius: 999,
                    border: `1px solid ${active ? colors[r] : '#d0d0d0'}`,
                    background: active ? colors[r] : '#fff',
                    color: active ? '#fff' : '#333',
                    fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px',
                    cursor: 'pointer',
                  }}>{ROLE_LABELS[r]}</button>
                );
              })}
            </div>
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Trigger</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => { setTriggerKind('date'); if (triggerLabel === STATUS_OPTIONS[0]) setTriggerLabel(TRIGGER_BUILTIN_CLOSING); }}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${triggerKind === 'date' ? '#0A0A0A' : '#d0d0d0'}`,
                  background: triggerKind === 'date' ? '#0A0A0A' : '#fff',
                  color: triggerKind === 'date' ? '#fff' : '#333',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >📅 Date-based (Birthday, Closing, etc.)</button>
              <button
                type="button"
                onClick={() => { setTriggerKind('status'); if (!STATUS_OPTIONS.includes(triggerLabel)) setTriggerLabel('New Lead'); }}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  border: `1px solid ${triggerKind === 'status' ? '#0A0A0A' : '#d0d0d0'}`,
                  background: triggerKind === 'status' ? '#0A0A0A' : '#fff',
                  color: triggerKind === 'status' ? '#fff' : '#333',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                }}
              >🔄 Loan status (New Lead, etc.)</button>
            </div>
          </div>

          {triggerKind === 'status' ? (
            <div style={sectionStyle}>
              <label style={labelStyle}>Fire while loan is in status</label>
              <select value={triggerLabel} onChange={(e) => setTriggerLabel(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }}>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <label style={labelStyle}>Repeat</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { key: 'none', label: 'Once' },
                  { key: 'daily', label: 'Every day' },
                  { key: 'weekly', label: 'Every week' },
                  { key: 'monthly', label: 'Every month' },
                ].map((r) => (
                  <button key={r.key} type="button"
                    onClick={() => setRepeatInterval(r.key)}
                    style={{
                      padding: '8px 14px', borderRadius: 999,
                      border: `1px solid ${repeatInterval === r.key ? '#0A0A0A' : '#d0d0d0'}`,
                      background: repeatInterval === r.key ? '#0A0A0A' : '#fff',
                      color: repeatInterval === r.key ? '#fff' : '#333',
                      fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>{r.label}</button>
                ))}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                Task generates today for every loan currently in "{triggerLabel}".
                {repeatInterval !== 'none' && ` A fresh copy will appear ${repeatInterval === 'daily' ? 'every day' : repeatInterval === 'weekly' ? 'each week' : 'each month'} until the loan moves to a different status.`}
              </div>
            </div>
          ) : (
          <div style={sectionStyle}>
            <label style={labelStyle}>When</label>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 90px 1fr', gap: 8, alignItems: 'stretch' }}>
              <select value={mode} onChange={(e) => setMode(e.target.value)} style={inputStyle}>
                <option value="on">On the day</option>
                <option value="before">Before</option>
                <option value="after">After</option>
              </select>
              <input
                type="number" min={0} value={magnitude}
                disabled={mode === 'on'}
                onChange={(e) => setMagnitude(Math.max(0, parseInt(e.target.value, 10) || 0))}
                style={{ ...inputStyle, textAlign: 'center', opacity: mode === 'on' ? 0.4 : 1 }}
              />
              <select value={triggerLabel} onChange={(e) => setTriggerLabel(e.target.value)} style={inputStyle}>
                {triggerLabels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[
                { label: 'On day', m: 'on', n: 0 },
                { label: '1d before', m: 'before', n: 1 },
                { label: '3d before', m: 'before', n: 3 },
                { label: '1wk before', m: 'before', n: 7 },
                { label: '1d after', m: 'after', n: 1 },
                { label: '7d after', m: 'after', n: 7 },
                { label: '30d after', m: 'after', n: 30 },
                { label: '90d after', m: 'after', n: 90 },
              ].map((p) => (
                <button key={p.label} type="button"
                  onClick={() => { setMode(p.m); setMagnitude(p.n); }}
                  style={{
                    padding: '4px 10px', borderRadius: 999,
                    border: '1px solid #d0d0d0', background: '#fafafa',
                    fontSize: 11, cursor: 'pointer',
                  }}>{p.label}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13, color: '#333', cursor: 'pointer' }}>
              <input type="checkbox" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
              Repeat every year (birthdays, anniversaries)
            </label>
          </div>
          )}

          <div style={sectionStyle}>
            <label style={labelStyle}>Only generate this task if… (optional)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <select
                value={conditionField}
                onChange={(e) => {
                  setConditionField(e.target.value);
                  if (e.target.value === 'none') setConditionOp('');
                  else if (!conditionOp) {
                    const f = CONDITION_FIELDS.find((x) => x.value === e.target.value);
                    const firstOp = (CONDITION_OPS[f?.type] || [])[0];
                    if (firstOp) setConditionOp(firstOp.value);
                  }
                }}
                style={inputStyle}
              >
                <option value="none">Always — no condition</option>
                {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <select
                value={conditionOp}
                disabled={conditionField === 'none'}
                onChange={(e) => setConditionOp(e.target.value)}
                style={{ ...inputStyle, opacity: conditionField === 'none' ? 0.4 : 1 }}
              >
                {(() => {
                  const f = CONDITION_FIELDS.find((x) => x.value === conditionField);
                  return (CONDITION_OPS[f?.type] || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>);
                })()}
              </select>
            </div>
            {conditionField !== 'none' && (
              <div style={{ marginTop: 8, fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                Task will only generate for clients whose {(CONDITION_FIELDS.find((f) => f.value === conditionField)?.label || conditionField).toLowerCase()} {(CONDITION_OPS.bool.find((o) => o.value === conditionOp)?.label || '').toLowerCase()}.
              </div>
            )}
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Notes / script (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4}
              placeholder="What to say, gift ideas, special instructions, etc."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 90 }} />
          </div>

          <div style={sectionStyle}>
            <label style={labelStyle}>Email template (optional)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <select value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} style={inputStyle}>
                <option value="none">— No email —</option>
                <option value="client">Send to client</option>
                <option value="co_borrower">Send to co-borrower</option>
                <option value="agent">Send to agent</option>
              </select>
              <input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                disabled={emailRecipient === 'none'}
                placeholder="Subject"
                style={{ ...inputStyle, opacity: emailRecipient === 'none' ? 0.4 : 1 }}
              />
            </div>
            <textarea
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              disabled={emailRecipient === 'none'}
              rows={6}
              placeholder={'Body of the email. Use variables: {{first_name}}, {{last_name}}, {{property}}, {{close_date}}, {{agent_name}}'}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 100, opacity: emailRecipient === 'none' ? 0.4 : 1 }}
            />
            {emailRecipient !== 'none' && emailSubject && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#666', fontStyle: 'italic' }}>
                A blue 📧 Email button appears on every generated task in the list. Click it to open Outlook with the subject and body pre-filled and variables substituted from the client's loan record.
              </div>
            )}
          </div>

          <div style={{ padding: 14, background: '#fff8e1', border: '1px solid #f5e7a3', borderRadius: 8, fontSize: 12, color: '#5a4a1a' }}>
            <strong>Preview</strong>
            <div style={{ marginTop: 4 }}>
              If a client's <em>{triggerLabel}</em> were today, this task would be due{' '}
              <strong>{effectiveDays === 0 ? 'today' : fmtDate(previewDate)}</strong>
              {recurring ? ' · regenerates every year' : ''}.
            </div>
          </div>
        </div>
        <div className="drawer-actions" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <button className="drawer-btn" style={{ color: '#c62828', borderColor: '#f5b8c1' }} onClick={onDelete}>Delete</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="drawer-btn" type="button" onClick={onClose}>Cancel</button>
            <button className="drawer-btn primary" type="button" onClick={save}>Save</button>
          </div>
        </div>
      </aside>
    </>
  );
}
