import React from 'react';
import Button from '../Button/Button';
import './Hero.css';

/* ---------- Social icons (reused in the pill + the AI draft card) ---------- */
const SOCIALS = {
  insta: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  linkedin: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452z',
  tiktok: 'M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z',
  youtube: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.015 3.015 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.501 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.377.55 9.377.55s7.505 0 9.377-.55a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  x: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  fb: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  threads: 'M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.586-1.308-.883-2.359-.89h-.029c-.844 0-1.992.232-2.721 1.32L7.734 7.847c.98-1.454 2.568-2.256 4.478-2.256h.044c3.194.02 5.097 1.975 5.287 5.388.108.046.216.094.321.142 1.49.7 2.58 1.761 3.154 3.07.797 1.82.871 4.79-1.548 7.158-1.85 1.81-4.094 2.628-7.277 2.65z',
};

const SocialIcon = ({ name, size = 'md' }) => (
  <span className={`s-icon s-icon--${size} s-icon--${name}`}>
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={SOCIALS[name]} />
    </svg>
  </span>
);

/* ---------- Small inline icons ---------- */
const Icon = ({ d, children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d ? <path d={d} /> : children}
  </svg>
);

const SparkleIcon = () => (
  <Icon d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
);

const NAV_ITEMS = [
  { label: 'Dashboard', active: true, icon: <Icon><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></Icon> },
  { label: 'AI Studio', icon: <SparkleIcon /> },
  { label: 'Calendar', icon: <Icon><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></Icon> },
  { label: 'Trends', icon: <Icon d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" /> },
  { label: 'Inbox', icon: <Icon d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /> },
  { label: 'Leads', icon: <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></Icon> },
  { label: 'Analytics', icon: <Icon d="M3 3v18h18M7 14l4-4 4 4 5-5" /> },
];

const STATS = [
  { label: 'Followers', value: '248,532', change: '12.4%' },
  { label: 'Engagement', value: '4.8%', change: '0.6 pts' },
  { label: 'Reach', value: '1.2M', change: '18.1%' },
  { label: 'Leads', value: '1,248', change: '32.4%' },
];

const QUEUE = [
  { title: 'Carousel: AI tools', time: 'Today 7:15 PM', thumb: 'violet', channel: 'insta' },
  { title: 'Case study: Acme', time: 'Tomorrow 10:00 AM', thumb: 'blue', channel: 'linkedin' },
  { title: 'Launch teaser', time: 'Sat 6:30 PM', thumb: 'orange', channel: 'tiktok' },
  { title: 'Weekly recap', time: 'Sun 9:00 AM', thumb: 'teal', channel: 'x' },
];

const Hero = () => {
  return (
    <section className="hero">
      <div className="hero-glow" aria-hidden="true" />

      <div className="hero-inner container">
        {/* ---------- Copy ---------- */}
        <div className="hero-content">
          <a href="#" className="hero-badge">
            <span className="hero-badge__tag">NEW</span>
            <span className="hero-badge__text">Autopilot 2.0 — agents that plan, post &amp; reply for you</span>
            <span className="hero-badge__arrow" aria-hidden="true">›</span>
          </a>

          <h1 className="hero-title">
            Your autonomous <span className="text-gradient">social growth</span>{' '}
            <br />
            team, powered by AI
          </h1>

          <p className="hero-subtitle">
            Sociva researches trends, writes on-brand content, publishes across every channel,
            answers your community and turns followers into leads — on autopilot.
          </p>

          <div className="hero-actions">
            <Button to="/signup" variant="primary" className="hero-btn">
              Get started free <span aria-hidden="true">→</span>
            </Button>
            <Button variant="outline" className="hero-btn hero-btn--ghost">
              <svg className="hero-btn__play" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M10 8l6 4-6 4z" fill="currentColor" />
              </svg>
              Watch 2-min demo
            </Button>
          </div>

          <ul className="hero-checks">
            <li>14-day free trial</li>
            <li>No credit card</li>
            <li>Cancel anytime</li>
          </ul>
        </div>

        {/* ---------- Dashboard mockup ---------- */}
        <div className="hero-mockup">
          <div className="mockup-frame">
            {/* Social pill sits on the top edge of the window */}
            <div className="mockup-socials">
              {['insta', 'linkedin', 'tiktok', 'youtube', 'x', 'fb'].map((n) => (
                <SocialIcon key={n} name={n} />
              ))}
            </div>

            <div className="mockup-window">
              {/* Sidebar */}
              <aside className="dash-sidebar">
                <div className="dash-logo">
                  <span className="dash-logo__mark">S</span>
                  Sociva
                  <span className="dash-logo__ai">AI</span>
                </div>
                <ul className="dash-nav">
                  {NAV_ITEMS.map((item) => (
                    <li key={item.label} className={item.active ? 'is-active' : ''}>
                      {item.icon}
                      {item.label}
                    </li>
                  ))}
                </ul>
              </aside>

              {/* Main */}
              <div className="dash-main">
                <div className="dash-header">
                  <div>
                    <h2 className="dash-title">Growth overview</h2>
                    <p className="dash-subtitle">All brands · Last 30 days</p>
                  </div>
                  <button className="dash-create" type="button">
                    <SparkleIcon />
                    Create with AI
                  </button>
                </div>

                <div className="dash-stats">
                  {STATS.map((s) => (
                    <div className="dash-stat" key={s.label}>
                      <div className="dash-stat__label">{s.label}</div>
                      <div className="dash-stat__value">{s.value}</div>
                      <div className="dash-stat__change">↑ {s.change}</div>
                    </div>
                  ))}
                </div>

                <div className="dash-bottom">
                  {/* Chart */}
                  <div className="dash-chart">
                    <div className="dash-chart__plot">
                      <div className="dash-chart__yaxis">
                        <span>100K</span>
                        <span>75K</span>
                        <span>50K</span>
                        <span>25K</span>
                        <span>0K</span>
                      </div>
                      <div className="dash-chart__canvas">
                        <div className="dash-chart__grid">
                          <span /><span /><span /><span /><span />
                        </div>
                        <svg viewBox="0 0 400 160" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="heroAreaFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.28" />
                              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                            </linearGradient>
                            <linearGradient id="heroLine" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor="#6366f1" />
                              <stop offset="100%" stopColor="#8b5cf6" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M0 100 C 25 80, 45 78, 65 88 S 100 70, 125 72 S 160 95, 185 70 S 225 50, 250 62 S 290 40, 315 45 S 350 50, 370 32 S 390 18, 400 12 L 400 160 L 0 160 Z"
                            fill="url(#heroAreaFill)"
                          />
                          <path
                            d="M0 100 C 25 80, 45 78, 65 88 S 100 70, 125 72 S 160 95, 185 70 S 225 50, 250 62 S 290 40, 315 45 S 350 50, 370 32 S 390 18, 400 12"
                            fill="none" stroke="url(#heroLine)" strokeWidth="2.5" strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                          <path
                            d="M0 128 C 30 118, 50 112, 80 118 S 120 105, 150 110 S 190 118, 220 100 S 260 95, 290 88 S 330 90, 360 78 S 390 72, 400 70"
                            fill="none" stroke="#d946ef" strokeWidth="2.5" strokeLinecap="round"
                            vectorEffect="non-scaling-stroke"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="dash-chart__xaxis">
                      <span>Sep 1</span>
                      <span>Sep 8</span>
                      <span>Sep 15</span>
                      <span>Sep 22</span>
                    </div>
                  </div>

                  {/* Autopilot queue */}
                  <div className="dash-queue">
                    <div className="dash-queue__title">Autopilot queue</div>
                    <ul>
                      {QUEUE.map((q) => (
                        <li key={q.title}>
                          <span className={`dash-queue__thumb thumb--${q.thumb}`} />
                          <span className="dash-queue__meta">
                            <strong>{q.title}</strong>
                            <small>{q.time}</small>
                          </span>
                          <SocialIcon name={q.channel} size="xs" />
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating card — left */}
          <div className="float-card float-card--growth">
            <div className="float-card__head">
              <span className="float-card__icon float-card__icon--green">
                <Icon d="M22 7l-8.5 8.5-5-5L2 17M16 7h6v6" />
              </span>
              <div>
                <div className="float-card__label">Follower growth</div>
                <div className="float-card__value">+38.2%</div>
              </div>
            </div>
            <svg className="float-card__spark" viewBox="0 0 120 36" preserveAspectRatio="none">
              <defs>
                <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d="M0 30 C 15 28, 25 24, 40 26 S 65 20, 80 16 S 105 8, 120 4 L 120 36 L 0 36 Z" fill="url(#heroSpark)" />
              <path d="M0 30 C 15 28, 25 24, 40 26 S 65 20, 80 16 S 105 8, 120 4" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
          </div>

          {/* Floating card — right */}
          <div className="float-card float-card--draft">
            <div className="float-card__row">
              <span className="float-card__icon float-card__icon--purple"><SparkleIcon /></span>
              <strong>AI draft ready</strong>
              <span className="float-card__score">98 score</span>
            </div>
            <p className="float-card__quote">
              “3 automation workflows every marketing team should steal this quarter…”
            </p>
            <div className="float-card__channels">
              <SocialIcon name="linkedin" size="xs" />
              <SocialIcon name="x" size="xs" />
              <SocialIcon name="threads" size="xs" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
