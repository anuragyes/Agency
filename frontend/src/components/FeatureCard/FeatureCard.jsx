import React from 'react';
import './FeatureCard.css';

const FeatureCard = ({ icon, title, description, children, className = '' }) => {
  return (
    <div className={`feature-card ${className}`}>
      <div className="feature-card-icon">{icon}</div>
      <h3 className="feature-card-title">{title}</h3>
      <p className="feature-card-desc">{description}</p>
      {children && <div className="feature-card-content">{children}</div>}
    </div>
  );
};

export default FeatureCard;
