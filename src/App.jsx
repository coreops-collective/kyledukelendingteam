import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';
import ToasterStack from './components/ToasterStack.jsx';
import GlobalSearch from './components/GlobalSearch.jsx';
import ReportIssueButton from './components/ReportIssueButton.jsx';
import FlashBanner from './components/FlashBanner.jsx';
import Pipeline from './views/Pipeline.jsx';
import NewLoan from './views/NewLoan.jsx';
import Placeholder from './views/Placeholder.jsx';
import CFL from './views/CFL.jsx';
import LoanManagement from './views/LoanManagement.jsx';
import AllLoans from './views/AllLoans.jsx';
import Partners from './views/Partners.jsx';
import Team from './views/Team.jsx';
import Roles from './views/Roles.jsx';
import LeadSources from './views/LeadSources.jsx';
import Workflows from './views/Workflows.jsx';
import Tasks from './views/Tasks.jsx';
import Projects from './views/Projects.jsx';
import MortgageCalc from './views/MortgageCalc.jsx';
import ClosingCalc from './views/ClosingCalc.jsx';
import Snapshot from './views/Snapshot.jsx';
import RateLocks from './views/RateLocks.jsx';
import Performance from './views/Performance.jsx';
import Income from './views/Income.jsx';
import NetIncomeCalc from './views/NetIncomeCalc.jsx';
import Login from './views/Login.jsx';
import Welcome from './views/Welcome.jsx';
import Setup from './views/Setup.jsx';
import useAuth from './hooks/useAuth.js';
import { isAdmin, isBranchManager, enforceSessionCap } from './lib/auth.js';
import { loadUsersFromSupabase } from './data/users.js';
import { loadLoansFromSupabase } from './lib/loansStore.js';
import { loadPartnersFromSupabase } from './lib/partnersStore.js';
import { loadWebhookSubscriptions } from './lib/webhooks.js';
import { loadJobRoles } from './lib/jobRoles.js';
import { loadLeadSources } from './lib/leadSources.js';

const PAGE_META = {
  '/snapshot':      { title: 'Lending Snapshot' },
  '/pipeline':      { title: 'Loan Pipeline' },
  '/loanmgmt':      { title: 'Loan Management' },
  '/loans':         { title: 'All Loans' },
  '/ratelocks':     { title: 'Rate Locks' },
  '/workflows':     { title: 'Workflows & SOPs' },
  '/clientforlife': { title: 'Client for Life' },
  '/tasks':         { title: 'Pipeline Tasks' },
  '/projects':      { title: 'Projects' },
  '/partners':      { title: 'Realtor Partners' },
  '/team':          { title: 'Team Members' },
  '/roles':         { title: 'Roles & Responsibilities' },
  '/leadsources':   { title: 'Lead Sources' },
  '/performance':   { title: 'Performance & Goals' },
  '/mortgagecalc':  { title: 'Mortgage Calculator' },
  '/closingcalc':   { title: 'Closing Costs Calculator' },
  '/setup':         { title: 'User Setup' },
  '/income':        { title: 'Income & Comp' },
  '/netincome':     { title: 'Net Income Calculator' },
  '/newloan':       { title: 'New Loan Intake' },
};

function todayString() {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function RoleGuard({ path, children }) {
  // Check synchronously so restricted views never render even briefly
  // to unauthorized users. Also covers direct-URL access (no flash).
  if (path === '/income' && !isBranchManager()) {
    return <Navigate to="/snapshot" replace />;
  }
  if (path === '/netincome' && !isBranchManager()) {
    return <Navigate to="/snapshot" replace />;
  }
  if (path === '/setup' && !isAdmin()) {
    return <Navigate to="/snapshot" replace />;
  }
  return children;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuth();
  const [justLoggedIn, setJustLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Track the previous user value so we can detect the "just logged in"
  // transition (null → truthy) regardless of whether the Login form's
  // onSuccess callback ran. Firing setJustLoggedIn from a useEffect
  // that watches `user` is more robust than the callback chain — the
  // Welcome screen was disappearing when native-event ordering caused
  // React to re-render past the Login screen before onSuccess ran.
  const prevUserRef = useRef(user);
  useEffect(() => {
    const prev = prevUserRef.current;
    if (!prev && user) setJustLoggedIn(true);
    prevUserRef.current = user;
  }, [user]);
  const meta = PAGE_META[location.pathname] || PAGE_META['/snapshot'];

  const [usersReady, setUsersReady] = useState(false);

  // Fetch real users + loans from Supabase on mount (same as legacy)
  useEffect(() => {
    Promise.all([loadUsersFromSupabase(), loadLoansFromSupabase(), loadPartnersFromSupabase(), loadWebhookSubscriptions(), loadJobRoles(), loadLeadSources()])
      .finally(() => setUsersReady(true));
  }, []);

  // Refresh preserves the current URL — no forced /snapshot redirect.
  // (Deep links, bookmarks, and browser back/forward all keep working
  // because we don't run any pathname-mangling effects on mount.)

  // Sync body[data-role] for legacy role-gating CSS
  useEffect(() => {
    document.body.dataset.role = user ? user.role : '';
  }, [user]);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Global Cmd+K / Ctrl+K opens the fuzzy-search modal. Standard search
  // hotkey across most modern apps — no advertised shortcut screen
  // needed. Skipped when typing in a form field so the shortcut can't
  // interrupt data entry.
  useEffect(() => {
    const onKey = (e) => {
      const isSearchShortcut = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (!isSearchShortcut) return;
      // Don't hijack when the user is typing in a native input.
      const t = e.target;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (inField) return;
      e.preventDefault();
      setSearchOpen((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 12h absolute session cap. Check on mount, on window focus / tab
  // visibility, and every 5 minutes. If the login timestamp is > 12h
  // old, enforceSessionCap clears storage and dispatches kdt-auth-changed
  // which drops the user back to Login on the next render.
  useEffect(() => {
    enforceSessionCap();
    const onFocus = () => enforceSessionCap();
    const onVisibility = () => { if (document.visibilityState === 'visible') enforceSessionCap(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(enforceSessionCap, 5 * 60 * 1000);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
    };
  }, []);

  if (!usersReady) return (<><UpdateBanner /><ToasterStack /></>);

  if (!user) {
    return (
      <>
        <UpdateBanner />
        <Login onSuccess={() => setJustLoggedIn(true)} />
        <ToasterStack />
      </>
    );
  }

  if (justLoggedIn) {
    return (
      <>
        <UpdateBanner />
        <Welcome user={user} onDismiss={() => setJustLoggedIn(false)} />
        <ToasterStack />
      </>
    );
  }

  return (
    <div className="hub-layout">
      <UpdateBanner />
      <button
        className={`mobile-menu-btn${mobileOpen ? ' open' : ''}`}
        id="mobileMenuBtn"
        onClick={() => setMobileOpen(v => !v)}
        aria-label="Menu"
        aria-expanded={mobileOpen}
      >
        {mobileOpen ? '×' : '☰'}
      </button>
      <Sidebar user={user} open={mobileOpen} />
      <main className="hub-main">
        <header className="hub-header">
          <div>
            <div className="page-title" id="pageTitle">{meta.title}</div>
            <div className="page-sub" id="pageSub">The Kyle Duke Home Loan Team · Lending Hub</div>
          </div>
          <div className="header-right">
            {/* Page-scoped Take a tour trigger. Only appears on
                routes that have a tour registered. Fires an event the
                page component listens for so we don't need a
                global-tour registry / context wired here. */}
            {['/workflows', '/pipeline', '/snapshot', '/loanmgmt', '/clientforlife', '/cfl', '/partners', '/newloan', '/roles', '/loans', '/ratelocks', '/tasks', '/projects', '/performance', '/setup', '/income', '/netincome', '/leadsources'].includes(location.pathname) && (
              <button
                className="chip"
                style={{ cursor: 'pointer', border: '1px solid #d0d0d0', background: '#fff', color: 'var(--brand-red, #c62828)', fontWeight: 700 }}
                onClick={() => window.dispatchEvent(new Event('kdt-start-tour'))}
                title="Guided walkthrough of every feature on this page"
                aria-label="Start guided tour of this page"
              >📖 Take a tour</button>
            )}
            {/* Global "Report an issue" chip — visible on every page so
                anyone (Kim especially) can flag something weird without
                needing to hunt for a support channel. Opens a modal that
                emails Lauren with the current URL + browser context. */}
            <ReportIssueButton />
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
            <Route path="/projects" element={<Projects />} />
            <Route path="/partners" element={<Partners />} />
            <Route path="/team" element={<Team />} />
            <Route path="/roles" element={<Roles />} />
            <Route path="/leadsources" element={<LeadSources />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/mortgagecalc" element={<MortgageCalc />} />
            <Route path="/closingcalc" element={<ClosingCalc />} />
            <Route path="/setup" element={<RoleGuard path="/setup"><Setup /></RoleGuard>} />
            <Route path="/income" element={<RoleGuard path="/income"><Income /></RoleGuard>} />
            <Route path="/netincome" element={<RoleGuard path="/netincome"><NetIncomeCalc /></RoleGuard>} />
            <Route path="/newloan" element={<NewLoan />} />
            <Route path="*" element={<Placeholder title="Not Found" />} />
          </Routes>
        </section>
      </main>
      <div id="drawerRoot"></div>
      <div id="loginRoot"></div>
      <ToasterStack />
      <FlashBanner />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
