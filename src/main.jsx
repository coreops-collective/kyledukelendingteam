import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { initBreadcrumbs } from './lib/breadcrumbs.js';
import './styles.css';

// Wire the global breadcrumb ring buffer as early as possible so any
// interaction before the first render is captured (helps diagnose
// bugs that fire during the initial route transition).
initBreadcrumbs();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
