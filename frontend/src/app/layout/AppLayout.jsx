// ─────────────────────────────────────────────────────────────
// AppLayout.jsx — sidebar + top bar shell for every /app/* page
// ─────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import Icon from "../ui/Icon";
import { Avatar, IconBtn, cx, timeAgo } from "../ui/kit";
import { Meter } from "../ui/charts";
import { useWorkspace } from "../store";
import { NOTIFICATIONS } from "../mock";
import { useAuth } from "../context/AuthContext";

export const NAV = [
  {
    sec: "Overview", items: [
      { to: "/app", icon: "dashboard", label: "Dashboard", end: true },
      { to: "/app/accounts", icon: "link", label: "Social Accounts" },
    ]
  },
  {
    sec: "Create", items: [
      { to: "/app/studio", icon: "sparkles", label: "AI Content Studio", badge: "AI", kind: "ai" },
      { to: "/app/editor", icon: "pen", label: "Content Editor" },
      { to: "/app/calendar", icon: "calendar", label: "Calendar" },
      { to: "/app/pipeline", icon: "pipeline", label: "Publishing Pipeline" },
      { to: "/app/repurpose", icon: "repeat", label: "Repurposing" },
    ]
  },
  {
    sec: "Intelligence", items: [
      { to: "/app/research", icon: "target", label: "Competitor Research", badge: "Live", kind: "new" },
      { to: "/app/trends", icon: "trend", label: "Trends" },
      { to: "/app/competitors", icon: "swords", label: "Competitors" },
      { to: "/app/hashtags", icon: "hash", label: "Hashtags & Keywords" },
      { to: "/app/audience", icon: "users", label: "Audience" },
      { to: "/app/analyst", icon: "scan", label: "AI Post Analyst" },
    ]
  },
  {
    sec: "Engage", items: [
      { to: "/app/inbox", icon: "inbox", label: "Unified Inbox", badge: "12", kind: "count" },
      { to: "/app/dm", icon: "bot", label: "DM Automation" },
      { to: "/app/leads", icon: "magnet", label: "Leads" },
    ]
  },
  {
    sec: "Measure", items: [
      { to: "/app/analytics", icon: "chart", label: "Analytics & Reports" },
      { to: "/app/settings", icon: "settings", label: "Settings" },
    ]
  },
];

export const LogoMark = ({ size = 38 }) => (
  <span className="sa-logo-mark" style={{ width: size, height: size }}>
    <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
      <path d="M20 12a8 8 0 1 1-3-6.25" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="18.5" cy="5.5" r="1.5" fill="#fff" stroke="none" />
    </svg>
  </span>
);

function Workspace() {
  const { products, current, selectProduct, online } = useWorkspace();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const name = current?.aiProfile?.name || "Northbeam Studio";
  const sub = current ? current.aiProfile?.category || "Brand" : online === false ? "Offline · demo" : "Agency · demo";
  return (
    <div ref={ref}>
      <button type="button" className="sa-ws" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar name={name} size={40} square />
        <span className="grow">
          <b>{name}</b>
          <small className="ellipsis" style={{ display: "block", maxWidth: 150 }}>{sub}{products.length > 1 ? ` · ${products.length} brands` : ""}</small>
        </span>
        <Icon name="chevronUpDown" size={18} />
      </button>
      {open && (
        <div className="sa-ws-menu">
          {products.length === 0 && <div className="small muted" style={{ padding: 10 }}>{online === false ? "Backend offline — start it to load your brands." : "No brands yet."}</div>}
          {products.map((p) => (
            <button key={p._id} type="button" className={cx(p._id === current?._id && "on")} onClick={() => { selectProduct(p._id); setOpen(false); }}>
              <Avatar name={p.aiProfile?.name || "?"} size={28} square />
              <span className="grow ellipsis">{p.aiProfile?.name || "Untitled"}<br /><small className="muted">{p.aiProfile?.category} · {timeAgo(p.createdAt)}</small></span>
              {p._id === current?._id && <Icon name="check" size={16} />}
            </button>
          ))}
          <hr />
          <Link to="/onboarding" onClick={() => setOpen(false)}><Icon name="plus" size={16} /> Add a brand (Brand Brain)</Link>
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <IconBtn icon="bell" label="Notifications" dot onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="sa-pop">
          <h4>Notifications</h4>
          {NOTIFICATIONS.map((n) => (
            <Link key={n.title} to={n.to} className="sa-li" onClick={() => setOpen(false)}>
              <span className={`sa-ic tone-${n.tone}`}><Icon name={n.icon} size={18} /></span>
              <span className="grow"><b>{n.title}</b><small>{n.sub}</small></span>
              <small className="faint">{n.time}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { online } = useWorkspace();
  const [navOpen, setNavOpen] = useState(false);
  const [autopilot, setAutopilot] = useState(true);
  const [q, setQ] = useState("");
  const loc = useLocation();
  const navigate = useNavigate();
  const searchRef = useRef(null);
  const { user, logout } = useAuth();

  useEffect(() => setNavOpen(false), [loc.pathname]);
  useEffect(() => {
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const allItems = NAV.flatMap((s) => s.items);
  const matches = q.trim() ? allItems.filter((i) => i.label.toLowerCase().includes(q.trim().toLowerCase())) : [];

  return (
    <div className={cx("sa-layout", navOpen && "nav-open")}>
      {navOpen && <div className="sa-scrim" onClick={() => setNavOpen(false)} />}
      <aside className="sa-side" aria-label="Main navigation">
        <Link to="/" className="sa-logo"><LogoMark /> Sociva <span className="sa-ai-tag">AI</span></Link>
        <Workspace />
        <nav className="sa-nav">
          {NAV.map((s) => (
            <div key={s.sec}>
              <div className="sa-nav-sec">{s.sec.toUpperCase()}</div>
              {s.items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end}>
                  <Icon name={i.icon} size={19} />
                  <span>{i.label}</span>
                  {i.badge && <em className={i.kind}>{i.badge}</em>}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sa-side-spacer" />
        <div className="sa-plan">
          <b><Icon name="rocket" size={18} /> Autopilot Pro</b>
          <p>7,240 / 10,000 AI credits used</p>
          <Meter value={72} color="linear-gradient(90deg,#a78bfa,#f0abfc)" />
          <Link to="/app/settings?tab=billing">Upgrade plan <Icon name="arrowRight" size={14} /></Link>
        </div>
      </aside>

      <div className="sa-main">
        <header className="sa-top">
          <IconBtn icon="menu" label="Open menu" className="sa-burger" onClick={() => setNavOpen(true)} />
          <div className="sa-search" style={{ position: "relative" }}>
            <Icon name="search" size={18} />
            <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts, clients, insights…"
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { navigate(matches[0].to); setQ(""); } if (e.key === "Escape") setQ(""); }} />
            <kbd>⌘K</kbd>
            {matches.length > 0 && (
              <div className="sa-pop" style={{ top: 50, left: 0, right: "auto", width: "100%" }}>
                {matches.map((m) => (
                  <Link key={m.to} to={m.to} className="sa-li" onClick={() => setQ("")}>
                    <span className="sa-ic tone-violet"><Icon name={m.icon} size={16} /></span>
                    <span className="grow"><b>{m.label}</b></span>
                    <Icon name="arrowRight" size={15} />
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="sa-top-right">
            <Notifications />
            <Link to="/app/settings" className="sa-user" title="Account Settings">
              <Avatar name={user?.name || "User"} size={42} />
              <div>
                <b>{user?.name || "User"}</b>
                <small>{user?.email || "Account"}</small>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
              title="Sign out of Sociva"
              style={{
                marginLeft: "6px",
                padding: "8px 12px",
                borderRadius: "10px",
                border: "1px solid #e2e8f0",
                background: "#ffffff",
                color: "#64748b",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#dc2626";
                e.currentTarget.style.borderColor = "#fecaca";
                e.currentTarget.style.background = "#fff5f5";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#64748b";
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.background = "#ffffff";
              }}
            >
              <Icon name="logout" size={14} />
              Log out
            </button>
          </div>
        </header>
        <main className="sa-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
