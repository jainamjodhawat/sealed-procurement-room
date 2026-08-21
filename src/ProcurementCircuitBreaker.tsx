import React from 'react';

type BoundaryProps = { children: React.ReactNode };
type BoundaryState = { failed: boolean };

export default class ProcurementCircuitBreaker extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('ProcurementCircuitBreaker captured an unrecoverable render error', error);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main role="alert" aria-live="assertive" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem', background: '#090b12', color: '#f8fafc' }}>
        <section style={{ width: 'min(34rem, 100%)', padding: '2rem', border: '1px solid rgba(148,163,184,.35)', borderRadius: '1.25rem', background: '#111827' }}>
          <p style={{ margin: 0, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.12em', fontSize: '.75rem' }}>Safe recovery</p>
          <h1 style={{ margin: '.75rem 0', fontSize: 'clamp(1.75rem, 6vw, 2.75rem)' }}>Bid room safely halted</h1>
          <p style={{ color: '#cbd5e1', lineHeight: 1.65 }}>The interface stopped before continuing. Confirm your transaction history before retrying a bid.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ marginTop: '1rem', border: 0, borderRadius: '.75rem', padding: '.85rem 1.1rem', fontWeight: 700, cursor: 'pointer' }}>Re-enter bid room</button>
        </section>
      </main>
    );
  }
}

