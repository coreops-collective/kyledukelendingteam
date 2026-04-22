import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Pipeline from './views/Pipeline.jsx';
import NewLoan from './views/NewLoan.jsx';
import Placeholder from './views/Placeholder.jsx';

export default function App() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f5f5f5' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '24px 32px', overflow: 'auto' }}>
        <Routes>
          <Route path="/" element={<Navigate to="/pipeline" replace />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/newloan" element={<NewLoan />} />
          <Route path="/loans" element={<Placeholder title="Loan Management" />} />
          <Route path="/partners" element={<Placeholder title="Partners" />} />
          <Route path="/team" element={<Placeholder title="Team" />} />
          <Route path="/cfl" element={<Placeholder title="Clients for Life" />} />
          <Route path="/setup" element={<Placeholder title="Setup" />} />
          <Route path="*" element={<Placeholder title="Not Found" />} />
        </Routes>
      </main>
    </div>
  );
}
