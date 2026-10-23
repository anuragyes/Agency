import React from 'react';
import Button from '../Button/Button';
import './PricingCard.css';

const PricingCard = ({ tier, price, description, isPopular, features, buttonText = "Start free trial" }) => {
  return (
    <div className={`pricing-card ${isPopular ? 'popular' : ''}`}>
      {isPopular && <div className="popular-badge">Most popular</div>}
      
      <div className="pricing-header">
        <h3 className="tier-name">{tier}</h3>
        <div className="price-container">
          <span className="price">${price}</span>
          <span className="period">/mo</span>
        </div>
        <p className="pricing-desc">{description}</p>
      </div>

      <Button
        to="/signup"
        variant={isPopular ? 'primary' : 'outline'} 
        className="pricing-btn"
      >
        {buttonText}
      </Button>

      <ul className="pricing-features">
        {features.map((feature, index) => (
          <li key={index}>
            <span className="feature-check">✓</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PricingCard;
