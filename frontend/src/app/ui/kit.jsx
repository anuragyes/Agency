// ─────────────────────────────────────────────────────────────
// kit.jsx — shared UI building blocks for the Sociva app
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { Sparkline } from "./charts";

export const cx = (...a) => a.filter(Boolean).join(" ");

export function Btn({ children, variant = "default", size, icon, iconRight, to, loading, className, ...rest }) {
  const cls = cx("sa-btn", `sa-btn-${variant}`, size && `sa-btn-${size}`, loading && "is-loading", className);
  const inner = (
    <>
      {loading ? <Spinner size={16} /> : icon && <Icon name={icon} size={size === "sm" ? 15 : 18} />}
      {children && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 18} />}
    </>
  );
  if (to) return <Link to={to} className={cls} {...rest}>{inner}</Link>;
  return <button type="button" className={cls} disabled={loading || rest.disabled} {...rest}>{inner}</button>;
}

export function IconBtn({ icon, label, dot, className, ...rest }) {
  return (
    <button type="button" className={cx("sa-iconbtn", className)} aria-label={label} title={label} {...rest}>
      <Icon name={icon} size={19} />
      {dot && <i className="sa-dot" />}
    </button>
  );
}

export function Spinner({ size = 18 }) {
  return <span className="sa-spinner" style={{ width: size, height: size }} aria-label="Loading" />;
}

export function Card({ title, sub, action, children, className, pad = true, ...rest }) {
  return (
    <section className={cx("sa-card", !pad && "no-pad", className)} {...rest}>
      {(title || action) && (
        <header className="sa-card-head">
          <div>
            {title && <h3>{title}</h3>}
            {sub && <p>{sub}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, sub, badge, children, crumbs }) {
  return (
    <div className="sa-page-head">
      <div>
        {crumbs && (
          <nav className="sa-crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <b>{c.label}</b>}
                {i < crumbs.length - 1 && <Icon name="chevronRight" size={14} />}
              </span>
            ))}
          </nav>
        )}
        <h1>{title}{badge}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="sa-page-actions">{children}</div>}
    </div>
  );
}

/** tone: violet | green | amber | red | blue | gray | pink */
export function Pill({ tone = "violet", icon, children, className, ...rest }) {
  return (
    <span className={cx("sa-pill", `tone-${tone}`, className)} {...rest}>
      {icon && <Icon name={icon} size={13} stroke={2.2} />}
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label, size }) {
  return (
    <button type="button" role="switch" aria-checked={!!checked} aria-label={label}
      className={cx("sa-toggle", checked && "on", size === "sm" && "sm")} onClick={() => onChange?.(!checked)}>
      <i />
    </button>
  );
}

const AV_GRADS = [
  "linear-gradient(135deg,#06b6d4,#0e7490)",
  "linear-gradient(135deg,#f472b6,#a855f7)",
  "linear-gradient(135deg,#f59e0b,#78350f)",
  "linear-gradient(135deg,#22d3ee,#6366f1)",
  "linear-gradient(135deg,#34d399,#0f766e)",
  "linear-gradient(135deg,#fb7185,#e11d48)",
];
export const initials = (name = "") =>
  String(name).replace(/^@/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "S";
const hash = (s = "") => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = 36, square, className }) {
  return (
    <span className={cx("sa-avatar", square && "square", className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: square ? "#0f0f1a" : AV_GRADS[hash(name) % AV_GRADS.length] }}>
      {initials(name)}
    </span>
  );
}

export function Thumb({ seed = "", size = 48, radius = 12, children, className }) {
  const g = [
    "linear-gradient(135deg,#a78bfa,#ec4899)",
    "linear-gradient(135deg,#818cf8,#4f46e5)",
    "linear-gradient(135deg,#fb923c,#ea580c)",
    "linear-gradient(135deg,#22d3ee,#0ea5e9)",
    "linear-gradient(135deg,#f472b6,#9333ea)",
    "linear-gradient(135deg,#2dd4bf,#0891b2)",
  ];
  return (
    <span className={cx("sa-thumb", className)} style={{ width: size, height: size, borderRadius: radius, background: g[hash(seed) % g.length] }}>
      {children}
    </span>
  );
}
export const gradientFor = (seed = "") =>
  ["linear-gradient(135deg,#8b5cf6 0%,#6366f1 55%,#4f46e5 100%)", "linear-gradient(135deg,#a78bfa,#db2777)", "linear-gradient(135deg,#14b8a6,#0891b2)", "linear-gradient(135deg,#fb7185,#9333ea)", "linear-gradient(135deg,#f97316,#db2777)"][hash(seed) % 5];

/** options: [{ value, label, count? }] */
export function Segmented({ options, value, onChange, className }) {
  return (
    <div className={cx("sa-seg", className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
          className={cx(value === o.value && "on")} onClick={() => onChange(o.value)}>
          {o.icon && <Icon name={o.icon} size={16} />}
          {o.label}
          {o.count != null && <em>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function Tabs({ options, value, onChange }) {
  return (
    <div className="sa-tabs" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value}
          className={cx(value === o.value && "on")} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <em className={o.danger ? "danger" : ""}>{o.count}</em>}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon = "sparkles", title, children, action }) {
  return (
    <div className="sa-empty">
      <span className="sa-empty-ic"><Icon name={icon} size={22} /></span>
      <h4>{title}</h4>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function DemoTag({ title = "Sample data — this module's backend isn't connected yet" }) {
  return <span className="sa-demo" title={title}><Icon name="flask" size={12} /> Demo data</span>;
}
export function LiveTag({ children = "Live" }) {
  return <span className="sa-live"><i />{children}</span>;
}

export function Banner({ icon = "sparkles", title, children, actions, tone = "violet" }) {
  return (
    <div className={cx("sa-banner", `tone-${tone}`)}>
      <span className="sa-banner-ic"><Icon name={icon} size={22} /></span>
      <div className="sa-banner-body">
        {title && <h4>{title}</h4>}
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="sa-banner-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon, iconTone = "violet", label, value, delta, deltaLabel, spark, sparkColor, down }) {
  return (
    <div className="sa-card sa-stat">
      <div className="sa-stat-top">
        {icon && <span className={cx("sa-ic", `tone-${iconTone}`)}><Icon name={icon} size={18} /></span>}
        <span className="sa-stat-label">{label}</span>
      </div>
      <div className="sa-stat-row">
        <div>
          <div className="sa-stat-value">{value}</div>
          {delta && (
            <div className={cx("sa-delta", down && "down")}>
              <Icon name="arrowUpRight" size={14} stroke={2.4} style={down ? { transform: "rotate(90deg)" } : undefined} />
              {delta} {deltaLabel && <span>{deltaLabel}</span>}
            </div>
          )}
        </div>
        {spark && <Sparkline data={spark} color={sparkColor} width={130} height={46} />}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer, width = 520 }) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sa-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="sa-modal" style={{ maxWidth: width }} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h3>{title}</h3>
          <IconBtn icon="x" label="Close" onClick={onClose} />
        </header>
        <div className="sa-modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, right }) {
  return (
    <label className="sa-field">
      {(label || right) && (
        <span className="sa-field-label">
          {label}
          {right}
        </span>
      )}
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ChipInput({ values = [], onChange, placeholder = "Add…", prefix = "" }) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim().replace(/^#/, "");
    if (!t) return;
    onChange([...values, prefix + t]);
    setV("");
  };
  return (
    <div className="sa-chips-input">
      {values.map((t, i) => (
        <span key={t + i} className="sa-chip-x">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(values.filter((_, j) => j !== i))}><Icon name="x" size={12} stroke={2.4} /></button>
        </span>
      ))}
      <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }} onBlur={add} />
    </div>
  );
}

/* ───────── Toasts ───────── */
const ToastCtx = createContext(() => { });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const idRef = useRef(0);
  const push = useCallback((msg, tone = "default") => {
    const id = ++idRef.current;
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="sa-toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={cx("sa-toast", `tone-${t.tone}`)}>
            <Icon name={t.tone === "error" ? "alert" : t.tone === "success" ? "checkCircle" : "info"} size={18} />
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ───────── Data hook: call backend, fall back to demo data ───────── */
export function useAsync(fn, deps = [], { fallback } = {}) {
  const [state, set] = useState({ loading: true, data: undefined, error: null, demo: false });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fnRef.current();
      set({ loading: false, data, error: null, demo: false });
      return data;
    } catch (error) {
      set({ loading: false, data: fallback, error, demo: fallback !== undefined });
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => set((s) => ({ ...s, data })) };
}

export const fmt = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${+(n / 1e3).toFixed(1)}K`;
  return Number(n).toLocaleString();
};

export function timeAgo(date) {
  if (!date) return "";
  const s = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(date).toLocaleDateString();
}
