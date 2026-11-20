import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Automatically recover from stale lazy chunks after a new Vercel deployment
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  try {
    const lastReload = Number(sessionStorage.getItem('cp_chunk_reload_at') || 0);
    if (Date.now() - lastReload > 15000) {
      sessionStorage.setItem('cp_chunk_reload_at', String(Date.now()));
      window.location.reload();
    }
  } catch {
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="CinePulse encountered an unexpected error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
