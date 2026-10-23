import React from 'react';
import './HowItWorks.css';

const HowItWorks = () => {
  return (
    <section className="how-it-works container" id="solutions">
      <div className="section-header text-center">
        <h4 className="section-subtitle">HOW IT WORKS</h4>
        <h2 className="section-title">From zero to autopilot in 10 minutes</h2>
      </div>

      <div className="steps-grid">
        <div className="step-card">
          <div className="step-number">01</div>
          <h3 className="step-title">Connect your channels</h3>
          <p className="step-desc">Link Instagram, LinkedIn, TikTok, X, YouTube and more in one click.</p>
        </div>
        <div className="step-card">
          <div className="step-number">02</div>
          <h3 className="step-title">Train your Brand Brain</h3>
          <p className="step-desc">AI learns your voice, audience, competitors and goals from your site and past posts.</p>
        </div>
        <div className="step-card">
          <div className="step-number">03</div>
          <h3 className="step-title">Turn on Autopilot</h3>
          <p className="step-desc">Approve the 30-day plan and let the agents create, publish and engage.</p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
