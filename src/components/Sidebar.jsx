import { NavLink } from 'react-router-dom';

const NAV = [
  { section: 'Pipeline', items: [
    { to: '/pipeline', label: 'Pipeline', icon: '📊' },
    { to: '/loans', label: 'Loan Management', icon: '💰' },
    { to: '/newloan', label: 'New Loan Intake', icon: '➕' },
  ]},
  { section: 'People', items: [
    { to: '/partners', label: 'Partners', icon: '🤝' },
    { to: '/team', label: 'Team', icon: '👥' },
    { to: '/cfl', label: 'Clients for Life', icon: '♾️' },
  ]},
  { section: 'Settings', items: [
    { to: '/setup', label: 'Setup', icon: '⚙️' },
  ]},
];

export default function Sidebar() {
  return (
    <aside style={{
      width: 240,
      background: '#0A0A0A',
      color: '#fff',
      padding: '18px 10px',
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
    }}>
      <div style={{ padding: '0 8px 18px', borderBottom: '1px solid #222', marginBottom: 12 }}>
        <div className="brand-title">The Kyle Duke Team</div>
        <div className="brand-sub">Lending Hub</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.section}>
            <div className="sidebar-section-label">{group.section}</div>
            {group.items.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => 'sidebar-item' + (isActive ? ' active' : '')}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 8px', borderTop: '1px solid #222' }}>
        <button className="sidebar-logout">Log out</button>
      </div>
    </aside>
  );
}
