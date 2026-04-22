import { useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '../data/users.js';
import { setCurrentUser } from '../lib/auth.js';

const NAV_GROUPS = [
  { label: 'Overview', className: '', items: [
    { view: 'snapshot', path: '/snapshot', text: 'Lending Snapshot' },
  ]},
  { label: 'Loan Management', className: '', items: [
    { view: 'pipeline', path: '/pipeline', text: 'Loan Pipeline' },
    { view: 'loanmgmt', path: '/loanmgmt', text: 'Loan Management' },
    { view: 'loans', path: '/loans', text: 'All Loans' },
    { view: 'ratelocks', path: '/ratelocks', text: 'Rate Locks' },
  ]},
  { label: 'Process', className: '', items: [
    { view: 'workflows', path: '/workflows', text: 'Workflows & SOPs' },
    { view: 'clientforlife', path: '/clientforlife', text: 'Client for Life' },
    { view: 'tasks', path: '/tasks', text: 'Tasks & Projects' },
  ]},
  { label: 'Partners', className: '', items: [
    { view: 'partners', path: '/partners', text: 'Realtor Partners' },
  ]},
  { label: 'Team', className: '', items: [
    { view: 'team', path: '/team', text: 'Team Members' },
    { view: 'performance', path: '/performance', text: 'Performance & Goals' },
  ]},
  { label: 'Tools', className: '', items: [
    { view: 'mortgagecalc', path: '/mortgagecalc', text: 'Mortgage Calculator' },
    { view: 'closingcalc', path: '/closingcalc', text: 'Closing Costs Calculator' },
  ]},
  { label: 'Settings', className: 'settings-label', items: [
    { view: 'setup', path: '/setup', text: 'User Setup' },
  ]},
  { label: 'Restricted', className: 'restricted-label', labelStyle: { color: '#7a3030' }, items: [
    { view: 'income', path: '/income', text: 'Income & Comp', wrap: true },
  ]},
];

export default function Sidebar({ user }) {
  const location = useLocation();
  const nav = useNavigate();
  return (
    <aside className="hub-sidebar" id="hubSidebar">
      <div className="sidebar-brand">
        <div className="brand-crest">
          <img src="/brand-crest.jpeg" alt="The Kyle Duke Team"
               onError={(e) => { e.currentTarget.style.display = 'none'; }}
               style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div>
          <div className="brand-title">The Kyle Duke Team</div>
          <div className="brand-sub">Powered by Valor Home Loans</div>
        </div>
      </div>
      <nav className="sidebar-section">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <div
              className={`sidebar-section-label${group.className ? ' ' + group.className : ''}`}
              style={group.labelStyle}
            >
              {group.label}
            </div>
            {group.items.map(item => {
              const isActive = location.pathname === item.path ||
                (location.pathname === '/' && item.view === 'snapshot');
              return (
                <div
                  key={item.view}
                  className={`sidebar-item${isActive ? ' active' : ''}`}
                  data-view={item.view}
                  onClick={() => nav(item.path)}
                  style={item.wrap ? { position: 'relative' } : undefined}
                >
                  {item.wrap
                    ? <span style={{ opacity: .9 }}>{item.text}</span>
                    : item.text}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div className="sidebar-user" id="sidebarUserCard">
          {user && (
            <>
              <div className="sidebar-user-avatar">{user.initials}</div>
              <div>
                <div className="sidebar-user-name">{user.name}</div>
                <div className="sidebar-user-role">{ROLE_LABELS[user.role] || 'Team Member'}</div>
              </div>
            </>
          )}
        </div>
        <button className="sidebar-logout" onClick={() => setCurrentUser(null)}>Sign Out</button>
        <div className="sidebar-fine">
          NMLS #2172565 · Valor Home Loans<br />
          Equal Housing Lender · Member FDIC<br />
          Veteran Mortgage Advisor™
        </div>
      </div>
    </aside>
  );
}
