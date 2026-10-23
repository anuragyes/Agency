import React from 'react';
import './Badge.css';

const Badge = ({ children, icon, className = '' }) => {
  return (
    <div className={`badge ${className}`}>
      {icon && <span className="badge-icon">{icon}</span>}
      <span className="badge-text">{children}</span>
    </div>
  );
};

export default Badge;
