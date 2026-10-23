// ─────────────────────────────────────────────────────────────
// charts.jsx — lightweight SVG charts (no chart library needed)
// Sparkline · AreaChart (hover tooltip) · BarChart · Donut · Heatmap · ScoreRing
// ─────────────────────────────────────────────────────────────
import { useId, useMemo, useRef, useState } from "react";

const smoothPath = (pts) => {
  if (pts.length < 2) return "";
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
  }
  return d;
};

export function Sparkline({ data = [], color = "var(--sa-primary)", width = 120, height = 36, fill = true }) {
  const id = useId().replace(/:/g, "");
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)]);
  const line = smoothPath(pts);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sa-spark" aria-hidden>
      <defs>
        <linearGradient id={`sg${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#sg${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const fmtTick = (v) => (v >= 1000000 ? `${+(v / 1e6).toFixed(1)}M` : v >= 1000 ? `${+(v / 1000).toFixed(1)}K` : `${+v.toFixed(1)}`);

/**
 * series: [{ name, color, data:[numbers], dashed?, fill? }]
 * labels: x labels (same length as data)
 */
export function AreaChart({ series = [], labels = [], height = 300, yTicks = 4, format = fmtTick, tooltipLabel, unit = "" }) {
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const W = 800;
  const H = height;
  const pad = { l: 44, r: 12, t: 14, b: 28 };
  const all = series.flatMap((s) => s.data);
  const rawMax = Math.max(1, ...all);
  const step = niceStep(rawMax / yTicks);
  const max = step * Math.ceil(rawMax / step);
  const n = Math.max(...series.map((s) => s.data.length), 1);
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const id = useId().replace(/:/g, "");

  const onMove = (e) => {
    const r = wrap.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const labelEvery = Math.ceil(n / 7);

  return (
    <div className="sa-chart" ref={wrap} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={si} id={`ag${id}${si}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0.01" />
            </linearGradient>
          ))}
        </defs>
        {Array.from({ length: max / step + 1 }, (_, i) => i * step).map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--sa-grid)" strokeDasharray="4 5" />
            <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" className="sa-axis">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) =>
          (i % labelEvery === 0 && n - 1 - i >= labelEvery / 2) || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="sa-axis">{l}</text>
          ) : null
        )}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => [x(i), y(v)]);
          const d = smoothPath(pts);
          return (
            <g key={si}>
              {s.fill !== false && !s.dashed && (
                <path d={`${d} L${x(s.data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#ag${id}${si})`} />
              )}
              <path d={d} fill="none" stroke={s.color} strokeWidth={s.dashed ? 2 : 2.6} strokeDasharray={s.dashed ? "7 6" : undefined} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--sa-primary)" strokeDasharray="3 4" opacity="0.6" />
        )}
      </svg>
      {hover != null &&
        series.map((s, si) =>
          s.dashed ? null : (
            <span key={si} className="sa-chart-dot" style={{ left: `${(x(hover) / W) * 100}%`, top: y(s.data[hover] ?? 0), borderColor: s.color }} />
          )
        )}
      {hover != null && (
        <div className="sa-tooltip" style={{ left: `${(x(hover) / W) * 100}%`, top: Math.max(0, y(series[0]?.data[hover] ?? 0) - 70) }}>
          <b>{tooltipLabel ? tooltipLabel(hover) : labels[hover]}</b>
          {series.map((s, si) => (
            <div key={si}><i style={{ background: s.color }} />{s.name} {format(s.data[hover] ?? 0)}{unit}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** groups: [{ label, values:[n,n] }], colors: per value index */
export function BarChart({ groups = [], colors = ["var(--sa-primary)", "var(--sa-pink-soft)"], height = 240, format = (v) => v, names = [] }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  const step = niceStep(max / 4);
  const top = step * Math.ceil(max / step);
  return (
    <div className="sa-bars" style={{ height }}>
      <div className="sa-bars-axis">
        {Array.from({ length: top / step + 1 }, (_, i) => top - i * step).map((t) => (
          <span key={t}>{format(t)}</span>
        ))}
      </div>
      <div className="sa-bars-plot">
        {Array.from({ length: top / step + 1 }, (_, i) => (
          <i key={i} className="sa-bars-grid" style={{ top: `${(i / (top / step)) * 100}%` }} />
        ))}
        {groups.map((g, gi) => (
          <div key={gi} className="sa-bars-group" onMouseEnter={() => setHover(gi)} onMouseLeave={() => setHover(null)}>
            <div className="sa-bars-cols">
              {g.values.map((v, vi) => (
                <span key={vi} className="sa-bar" style={{ height: `${(v / top) * 100}%`, background: colors[vi % colors.length] }} />
              ))}
            </div>
            {g.label ? <em>{g.label}</em> : null}
            {hover === gi && (
              <div className="sa-tooltip sa-tooltip-bar">
                <b>{g.tooltipLabel || g.label}</b>
                {g.values.map((v, vi) => (
                  <div key={vi}><i style={{ background: colors[vi % colors.length] }} />{names[vi] || ""} {format(v)}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** items: [{ label, value, color }] */
export function Donut({ items = [], size = 200, thickness = 26, center, sub }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = items.length > 1 ? 4 : 0;
  let acc = 0;
  return (
    <div className="sa-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {items.map((it, i) => {
            const len = (it.value / total) * c;
            const el = (
              <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color} strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-acc} />
            );
            acc += len;
            return el;
          })}
        </g>
      </svg>
      <div className="sa-donut-center">
        <b>{center}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  );
}

/** rows: [{ label, values:[0..1] }], cols: labels */
export function Heatmap({ rows = [], cols = [], highlight }) {
  return (
    <div className="sa-heat" style={{ gridTemplateColumns: `40px repeat(${cols.length}, 1fr)` }}>
      <span />
      {cols.map((c) => <em key={c}>{c}</em>)}
      {rows.map((r, ri) => (
        <FragmentRow key={r.label} r={r} ri={ri} highlight={highlight} />
      ))}
    </div>
  );
}
function FragmentRow({ r, ri, highlight }) {
  return (
    <>
      <em className="sa-heat-row">{r.label}</em>
      {r.values.map((v, ci) => (
        <span
          key={ci}
          className="sa-heat-cell"
          title={`${r.label} · ${Math.round(v * 100)}% activity`}
          style={{ background: `color-mix(in srgb, var(--sa-primary) ${Math.round(8 + v * 82)}%, #f3f1ff)`, outline: highlight && highlight[0] === ri && highlight[1] === ci ? "2px solid var(--sa-primary-ink)" : undefined }}
        />
      ))}
    </>
  );
}

export function ScoreRing({ value = 0, size = 64, stroke = 6, color, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const col = color || (value >= 80 ? "var(--sa-green)" : value >= 60 ? "var(--sa-amber)" : "var(--sa-gray-400)");
  return (
    <div className="sa-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--sa-gray-100)" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b style={{ fontSize: size * 0.3 }}>{label ?? value}</b>
    </div>
  );
}

export function Meter({ value = 0, max = 100, color = "var(--sa-primary)", height = 6 }) {
  const pct = useMemo(() => Math.max(0, Math.min(100, (value / max) * 100)), [value, max]);
  return (
    <div className="sa-meter" style={{ height }}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
