import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Pipeline from './views/Pipeline.jsx';
import NewLoan from './views/NewLoan.jsx';
import Placeholder from './views/Placeholder.jsx';
import CFL from './views/CFL.jsx';
import LoanManagement from './views/LoanManagement.jsx';
import Partners from './views/Partners.jsx';
import Team from './views/Team.jsx';

const PAGE_META = {
  '/snapshot':      { title: 'Lending Snapshot' },
  '/pipeline':      { title: 'Loan Pipeline' },
  '/loanmgmt':      { title: 'Loan Management' },
  '/loans':         { title: 'All Loans' },
  '/ratelocks':     { title: 'Rate Locks' },
  '/workflows':     { title: 'Workflows & SOPs' },
  '/clientforlife': { title: 'Client for Life' },
  '/tasks':         { title: 'Tasks & Projects' },
  '/partners':      { title: 'Realtor Partners' },
  '/team':          { title: 'Team Members' },
  '/performance':   { title: 'Performance & Goals' },
  '/mortgagecalc':  { title: 'Mortgage Calculator' },
  '/closingcalc':   { title: 'Closing Costs Calculator' },
  '/setup':         { title: 'User Setup' },
  '/income':        { title: 'Income & Comp' },
  '/newloan':       { title: 'New Loan Intake' },
};

function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function App() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = PAGE_META[location.pathname] || PAGE_META['/snapshot'];

  return (
    <div className="hub-layout">
      <button
        className="mobile-menu-btn"
        id="mobileMenuBtn"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="Menu"
      >
        ☰
      </button>
      <Sidebar />
      <main className="hub-main">
        <header className="hub-header">
          <div>
            <div className="page-title" id="pageTitle">{meta.title}</div>
            <div className="page-sub" id="pageSub">The Kyle Duke Team · Lending Hub</div>
          </div>
          <div className="header-right">
            <span className="chip" id="todayChip">{todayString()}</span>
          </div>
        </header>
        <section className="hub-content" id="viewRoot">
          <Routes>
            <Route path="/" element={<Navigate to="/snapshot" replace />} />
            <Route path="/snapshot" element={<Placeholder title="Lending Snapshot" />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/loanmgmt" element={<LoanManagement />} />
            <Route path="/loans" element={<LoanManagement />} />
            <Route path="/ratelocks" element={<Placeholder title="Rate Locks" />} />
            <Route path="/workflows" element={<Placeholder title="Workflows & SOPs" />} />
            <Route path="/clientforlife" element={<CFL />} />
            <Route path="/cfl" element={<CFL />} />
            <Route path="/tasks" element={<Placeholder title="Tasks & Projects" />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/team" element={<Team />} />
            <Route path="/performance" element={<Placeholder title="Performance & Goals" />} />
            <Route path="/mortgagecalc" element={<Placeholder title="Mortgage Calculator" />} />
            <Route path="/closingcalc" element={<Placeholder title="Closing Costs Calculator" />} />
            <Route path="/setup" element={<Placeholder title="User Setup" />} />
            <Route path="/income" element={<Placeholder title="Income & Comp" />} />
            <Route path="/newloan" element={<NewLoan />} />
            <Route path="*" element={<Placeholder title="Not Found" />} />
          </Routes>
        </section>
      </main>
      <div id="drawerRoot"></div>
      <div id="loginRoot"></div>
    </div>
  );
}
