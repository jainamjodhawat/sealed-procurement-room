import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import ProcurementCircuitBreaker from './ProcurementCircuitBreaker.tsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProcurementCircuitBreaker>
      <App />
    </ProcurementCircuitBreaker>
  </React.StrictMode>
);
