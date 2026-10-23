import React from 'react';
import Button from '../Button/Button';
import './CTA.css';

const CTA = () => {
  return (
    <section className="cta-section container">
      <div className="cta-box">
        <h2 className="cta-title">Put your social growth on autopilot</h2>
        <p className="cta-subtitle">Join 5,000+ brands growing faster with Sociva.</p>
        <Button to="/signup" variant="secondary">Get started free &rarr;</Button>
      </div>
    </section>
  );
};

export default CTA;
