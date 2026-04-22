import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Pipeline from './views/Pipeline.jsx';
import NewLoan from './views/NewLoan.jsx';
import Placeholder from './views/Placeholder.jsx';
import CFL from './views/CFL.jsx';
import LoanManagement from './views/LoanManagement.jsx';
import AllLoans from './views/AllLoans.jsx';
import Partners from './views/Partners.jsx';
import Team from './views/Team.jsx';
import Workflows from './views/Workflows.jsx';
import Tasks from './views/Tasks.jsx';
import MortgageCalc from './views/MortgageCalc.jsx';
import ClosingCalc from './views/ClosingCalc.jsx';
import Snapshot from './views/Snapshot.jsx';
import RateLocks from './views/RateLocks.jsx';
import Performance from './views/Performance.jsx';
import Income from './views/Income.jsx';
import Login from './views/Login.jsx';
import Welcome from './views/Welcome.jsx';
import Setup from './views/Setup.jsx';
import useAuth from './hooks/useAuth.js';
import { isAdmin, isBranchManager } from './lib/auth.js';
import { loadUsersFromSupabase } from './data/users.js';

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

function RoleGuard({ path, children }) {
  const nav = useNavigate();
  useEffect(() => {
    if (path === '/income' && !isBranchManager()) {
      nav('/snapshot', { replace: true });
    } else if (path === '/setup' && !isAdmin()) {
      nav('/snapshot', { replace: true });
    }
  }, [path, nav]);
  return children;
}

export default function App() {
  const location = useLocation();
  const user = useAuth();
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const meta = PAGE_META[location.pathname] || PAGE_META['/snapshot'];

  const [usersReady, setUsersReady] = useState(false);

  // Fetch real users from Supabase on mount (same as legacy)
  useEffect(() => { loadUsersFromSupabase().finally(() => setUsersReady(true)); }, []);

  // Sync body[data-role] for legacy role-gating CSS
  useEffect(() => {
    document.body.dataset.role = user ? user.role : '';
  }, [user]);

  if (!usersReady) return null;

  if (!user) {
    return <Login onSuccess={() => setJustLoggedIn(true)} />;
  }

  if (justLoggedIn) {
    return <Welcome user={user} onDismiss={() => setJustLoggedIn(false)} />;
  }

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
      <Sidebar user={user} />
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
            <Route path="/snapshot" element={<Snapshot />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/loanmgmt" element={<LoanManagement />} />
            <Route path="/loans" element={<AllLoans />} />
            <Route path="/ratelocks" element={<RateLocks />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/clientforlife" element={<CFL />} />
            <Route path="/cfl" element={<CFL />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/team" element={<Team />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/mortgagecalc" element={<MortgageCalc />} />
            <Route path="/closingcalc" element={<ClosingCalc />} />
            <Route path="/setup" element={<RoleGuard path="/setup"><Setup /></RoleGuard>} />
            <Route path="/income" element={<RoleGuard path="/income"><Income /></RoleGuard>} />
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
