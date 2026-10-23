import React from 'react';
import FeatureCard from '../FeatureCard/FeatureCard';
import './Features.css';

const Features = () => {
  return (
    <section className="features container" id="product">
      <div className="section-header">
        <h4 className="section-subtitle">ONE PLATFORM - EVERY WORKFLOW</h4>
        <h2 className="section-title">Everything a social team does,<br/>now run by AI agents</h2>
      </div>

      <div className="features-grid">
        <FeatureCard 
          icon="✨"
          title="AI Content Studio"
          description="Generate posts, carousels, captions and visuals in your brand voice — tuned for platforms."
          className="col-span-2"
        >
          {/* Mockup elements can go here */}
          <div className="content-studio-mockup">
             <div className="prompt-bubble">Prompt: Announce our new analytics feature for LinkedIn, confident tone</div>
             <div className="generated-variants">
                <div className="variant v1">Variant 1</div>
                <div className="variant v2">Variant 2</div>
                <div className="variant v3">Variant 3</div>
             </div>
          </div>
        </FeatureCard>

        <FeatureCard 
          icon="📈"
          title="Trend Intelligence"
          description="Spot micro-trends, sounds and hashtags 48 hours before they peak."
        >
          <div className="trend-list">
             <div className="trend-item"><span>#AIWorkflow</span><span className="positive">+124%</span></div>
             <div className="trend-item"><span>#GrowthHacking</span><span className="positive">+89%</span></div>
             <div className="trend-item"><span>#FutureOfWork</span><span className="positive">+56%</span></div>
          </div>
        </FeatureCard>

        <FeatureCard 
          icon="📅"
          title="Smart Scheduling"
          description="Posts publish when your audience is most active — across all channels."
        />

        <FeatureCard 
          icon="💬"
          title="Community Autopilot"
          description="Replies to comments and DMs in your voice, escalates critical situations."
        />

        <FeatureCard 
          icon="🎯"
          title="Lead Generation"
          description="Qualify commenters and sync hot leads straight to your CRM."
        />
      </div>
    </section>
  );
};

export default Features;
