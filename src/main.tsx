import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import ProcurementCircuitBreaker from './ProcurementCircuitBreaker.tsx';
import './index.css';

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const msg = event.reason?.message || String(event.reason || "");
    if (msg.includes("tabs:outgoing.message.ready") || msg.includes("No Listener")) {
      event.preventDefault();
      console.warn("[Midnight] Handled wallet connector channel refresh.");
    }
  });
}


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProcurementCircuitBreaker>
      <App />
    </ProcurementCircuitBreaker>
  </React.StrictMode>
);
