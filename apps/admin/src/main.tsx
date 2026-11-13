import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { applyPrefs } from './lib/theme';
import { startTranslator } from './i18n';
applyPrefs();
// signed in on www.nextsoftwares.in/login: the session arrives in the address fragment (never sent to a server) and is removed at once
try { const m = location.hash.match(/^#nsw=(.+)$/); if (m) { const d = JSON.parse(decodeURIComponent(escape(atob(m[1])))); if (d.token && d.user) { localStorage.clear(); localStorage.setItem('token', d.token); localStorage.setItem('user', JSON.stringify(d.user)); } history.replaceState(null, '', location.pathname); } } catch { /* a broken link just shows the normal login */ }
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
startTranslator();
