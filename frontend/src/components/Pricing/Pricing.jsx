import React from 'react';
import PricingCard from '../PricingCard/PricingCard';
import './Pricing.css';

const Pricing = () => {
  return (
    <section className="pricing container" id="pricing">
      <div className="section-header text-center">
        <h4 className="section-subtitle">PRICING</h4>
        <h2 className="section-title">Simple plans that scale with you</h2>
      </div>

      <div className="pricing-grid">
        <PricingCard 
          tier="Starter"
          price="29"
          description="For solo creators and small teams"
          buttonText="Start free"
          features={[
            "2 social accounts",
            "1,000 AI credits /mo",
            "Content calendar"
          ]}
        />
        <PricingCard 
          tier="Growth"
          price="99"
          description="For growing brands on autopilot"
          isPopular={true}
          features={[
            "10 social accounts",
            "10,000 AI credits /mo",
            "Autopilot + AI agents",
            "Competitor intelligence"
          ]}
        />
        <PricingCard 
          tier="Agency"
          price="299"
          description="For agencies managing clients"
          buttonText="Talk to sales"
          features={[
            "Unlimited accounts",
            "White-label reports",
            "Client approval portal"
          ]}
        />
      </div>
    </section>
  );
};

export default Pricing;
