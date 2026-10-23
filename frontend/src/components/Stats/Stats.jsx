import React from 'react';
import './Stats.css';

const StatItem = ({ value, label }) => (
  <div className="stat-item">
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

const Stats = () => {
  return (
    <section className="stats container">
      <StatItem value="10x" label="Faster content output" />
      <StatItem value="5,000+" label="Brands growing" />
      <StatItem value="12" label="Channels supported" />
      <StatItem value="38%" label="Avg eng. growth lift" />
    </section>
  );
};

export default Stats;
