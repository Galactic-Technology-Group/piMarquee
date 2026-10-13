import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Last-resort self heal for a kiosk that must never stay blank.
window.addEventListener('error', () => {
  window.setTimeout(() => location.reload(), 5000);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
