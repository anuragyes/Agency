import React from 'react';
import Button from '../../components/Button/Button';

const NotFound = () => (
  <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '2rem' }}>
    <div>
      <h1 style={{ fontSize: '4rem', fontWeight: 800 }}>404</h1>
      <p style={{ color: 'var(--text-secondary)', margin: '0.5rem 0 1.5rem' }}>
        We couldn&rsquo;t find that page.
      </p>
      <Button to="/" variant="primary">Back to home</Button>
    </div>
  </div>
);

export default NotFound;
