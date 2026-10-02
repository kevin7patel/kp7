import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { KEYS, store } from './data/storage';
import './styles/app.css';

// Unlock link: #k=<key>. The fragment never leaves the browser; store it and clean the URL.
const m = window.location.hash.match(/^#k=([A-Za-z0-9_-]{40,})$/);
if (m) {
  store.set(KEYS.dataKey, m[1]!);
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/today`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
