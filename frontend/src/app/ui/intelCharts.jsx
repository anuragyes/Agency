// ─────────────────────────────────────────────────────────────
// intelCharts.jsx — charts for the Competitor Intelligence agents (no chart library)
//   HBarList       ranked horizontal bars (one series; "you" highlighted)
//   StackedBars    100% horizontal stacked bars (format mix per account) + legend
//   ScatterPlot    followers (log) vs engagement rate, hover tooltip
//   DayHourHeat    day × 3-hour slot heatmap (sequential, one hue)
//   AgentProgress  every agent's progress % with its status
//   AgentTimeline  Gantt: when each agent ran (live)
//   StatusPill     agent status = icon + label (never color alone)
// Color rules: one hue for magnitude, categorical slots in fixed order, status colors only for status.
// ─────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { cx, fmt } from "./kit";

import { FORMAT_COLORS, FORMAT_LABEL, STATUS_META, msLabel } from "./intelTheme";

export function StatusPill({ status, small }) {
  const m = STATUS_META[status] || STATUS_META.queued;
  return (
    <span className={cx("sa-pill", `tone-${m.tone}`, "sa-status", status === "running" && "is-running")} style={small ? { height: 22, fontSize: 11.5, padding: "0 8px" } : undefined}>
      <Icon name={m.icon} size={small ? 12 : 13} />{m.label}
    </span>
  );
}

/** rows: [{ key, label, value, display?, sub?, highlight? }] */
export function HBarList({ rows = [], format = (v) => fmt(v), max, highlightColor = "var(--sa-pink)", color = "var(--sa-primary)", empty = "No data yet", labelWidth = 150 }) {
  const top = max ?? Math.max(0, ...rows.map((r) => r.value ?? 0));
  if (!rows.length) return <p className="small muted" style={{ margin: 0 }}>{empty}</p>;
  return (
    <div className="sa-hbars" role="list">
      {rows.map((r) => (
        <div key={r.key ?? r.label} className="sa-hbar" role="listitem" title={`${r.label}: ${r.display ?? format(r.value)}${r.sub ? ` · ${r.sub}` : ""}`}
          style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr) auto` }}>
          <span className="sa-hbar-label ellipsis">{r.label}</span>
          <span className="sa-hbar-track">
            <span className="sa-hbar-fill" style={{ width: `${top ? Math.max(1.5, ((r.value ?? 0) / top) * 100) : 0}%`, background: r.highlight ? highlightColor : r.color || color }} />
          </span>
          <span className="sa-hbar-value">{r.display ?? format(r.value)}{r.sub && <small> {r.sub}</small>}</span>
        </div>
      ))}
    </div>
  );
}

/** rows: [{ label, parts: { reel: 40, carousel: 30 } }] keys in fixed order */
export function StackedBars({ rows = [], keys = ["reel", "carousel", "image", "video"], colors = FORMAT_COLORS, labels = FORMAT_LABEL, labelWidth = 150 }) {
  const [hover, setHover] = useState(null);
  const used = keys.filter((k) => rows.some((r) => (r.parts?.[k] || 0) > 0));
  return (
    <div>
      <div className="sa-legend" style={{ marginBottom: 12, fontSize: 13 }}>
        {used.map((k) => <span key={k}><i style={{ background: colors[k], borderRadius: 3 }} />{labels[k] || k}</span>)}
      </div>
      <div className="sa-hbars">
        {rows.map((r, ri) => (
          <div key={r.label} className="sa-hbar" style={{ gridTemplateColumns: `${labelWidth}px minmax(0,1fr)` }}>
            <span className="sa-hbar-label ellipsis">{r.label}</span>
            <span className="sa-stack" onMouseLeave={() => setHover(null)}>
              {used.map((k) => (r.parts?.[k] ? (
                <span key={k} className="sa-stack-seg" style={{ width: `${r.parts[k]}%`, background: colors[k] }}
                  onMouseEnter={() => setHover(`${ri}:${k}`)}>
                  {r.parts[k] >= 14 && <em>{r.parts[k]}%</em>}
                  {hover === `${ri}:${k}` && <span className="sa-tooltip sa-tooltip-bar"><b>{r.label}</b>{labels[k] || k}: {r.parts[k]}%</span>}
                </span>
              ) : null))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** points: [{ key, label, x, y, you? }] — x on a log scale */
export function ScatterPlot({ points = [], xLabel = "Followers", yLabel = "Engagement rate %", height = 280, formatY = (v) => `${v}%` }) {
  const wrap = useRef(null);
  const [hover, setHover] = useState(null);
  const pts = points.filter((p) => p.x > 0 && p.y != null);
  const W = 640, H = height, pad = { l: 48, r: 18, t: 14, b: 40 };
  const xs = pts.map((p) => Math.log10(p.x));
  const xmin = Math.floor(Math.min(...xs, 3)), xmax = Math.ceil(Math.max(...xs, 4));
  const ymax = Math.max(0.5, ...pts.map((p) => p.y)) * 1.15;
  const X = (v) => pad.l + ((Math.log10(v) - xmin) / Math.max(0.01, xmax - xmin)) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v / ymax) * (H - pad.t - pad.b);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => +(ymax * f).toFixed(ymax < 2 ? 2 : 1));
  if (!pts.length) return <p className="small muted">No data yet</p>;
  return (
    <div className="sa-chart" ref={wrap}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label={`${yLabel} by ${xLabel}`}>
        {yTicks.map((t) => (
          <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--sa-grid)" strokeDasharray="4 5" />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" className="sa-axis">{formatY(t)}</text></g>
        ))}
        {Array.from({ length: xmax - xmin + 1 }, (_, i) => 10 ** (xmin + i)).map((v) => (
          <text key={v} x={X(v)} y={H - pad.b + 18} textAnchor="middle" className="sa-axis">{fmt(v)}</text>
        ))}
        <text x={(W + pad.l) / 2} y={H - 4} textAnchor="middle" className="sa-axis">{xLabel} (log scale)</text>
        {pts.map((p) => (
          <g key={p.key ?? p.label} onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} style={{ cursor: "default" }}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={14} fill="transparent" />
            <circle cx={X(p.x)} cy={Y(p.y)} r={p.you ? 8 : 6.5} fill={p.you ? "var(--sa-pink)" : "var(--sa-primary)"} stroke="#fff" strokeWidth="2" />
            {(p.you || p.label === hover?.label || pts.length <= 8) && (
              <text x={X(p.x) + 10} y={Y(p.y) - 8} className="sa-axis" style={{ fill: "var(--sa-text)", fontWeight: p.you ? 700 : 500 }}>{p.you ? `${p.label} (you)` : p.label}</text>
            )}
          </g>
        ))}
      </svg>
      {hover && (
        <div className="sa-tooltip" style={{ left: `${(X(hover.x) / W) * 100}%`, top: Math.max(0, Y(hover.y) - 64) }}>
          <b>{hover.label}{hover.you ? " (you)" : ""}</b>
          <div>{fmt(hover.x)} followers</div>
          <div>{formatY(hover.y)} engagement</div>
        </div>
      )}
      <div className="sa-legend" style={{ fontSize: 13 }}><span><i style={{ background: "var(--sa-primary)" }} />Competitors</span><span><i style={{ background: "var(--sa-pink)" }} />You</span></div>
    </div>
  );
}

/** heatmap = { days, slots, cells[d][s] = { posts, performanceIndex }, timezone } */
export function DayHourHeat({ heatmap }) {
  const [hover, setHover] = useState(null);
  const max = useMemo(() => Math.max(1.5, ...(heatmap?.cells || []).flat().map((c) => c.performanceIndex || 0)), [heatmap]);
  if (!heatmap?.cells?.length) return null;
  return (
    <div>
      <div className="sa-dhh" style={{ gridTemplateColumns: `44px repeat(${heatmap.slots.length}, minmax(0,1fr))` }}>
        <span />
        {heatmap.slots.map((s) => <em key={s}>{s}</em>)}
        {heatmap.days.map((d, di) => (
          <FragmentRow key={d} day={d}>
            {heatmap.cells[di].map((c, si) => {
              const v = c.performanceIndex;
              const pct = v == null ? 0 : Math.min(1, v / max);
              return (
                <span key={si} className={cx("sa-dhh-cell", !c.posts && "empty")} onMouseEnter={() => setHover({ d, s: heatmap.slots[si], c })} onMouseLeave={() => setHover(null)}
                  style={{ background: c.posts ? `color-mix(in srgb, var(--sa-primary) ${Math.round(10 + pct * 80)}%, #f3f1ff)` : undefined }}>
                  {c.posts > 0 && <i>{c.posts}</i>}
                </span>
              );
            })}
          </FragmentRow>
        ))}
      </div>
      <div className="row between mt-s small faint">
        <span>{hover ? <><b className="strong">{hover.d} {hover.s}</b> · {hover.c.posts} posts · performance index {hover.c.performanceIndex ?? "—"}</> : `Numbers = competitor posts in the slot (${heatmap.timezone}). Darker = better performance.`}</span>
        <span className="row" style={{ gap: 6 }}>low<span className="sa-dhh-scale" />high</span>
      </div>
    </div>
  );
}
function FragmentRow({ day, children }) {
  return <><em className="sa-dhh-row">{day}</em>{children}</>;
}

/** agents: pipeline.agents */
export function AgentProgress({ agents = [], onPick }) {
  return (
    <div className="sa-hbars">
      {agents.map((a) => {
        const m = STATUS_META[a.status] || STATUS_META.queued;
        return (
          <button type="button" key={a.id} className="sa-hbar sa-hbar-btn" onClick={() => onPick?.(a.id)} title={`${a.name}: ${m.label} ${a.progress || 0}%${a.message ? ` — ${a.message}` : ""}`}
            style={{ gridTemplateColumns: "170px minmax(0,1fr) 92px" }}>
            <span className="sa-hbar-label ellipsis">{a.name}</span>
            <span className="sa-hbar-track"><span className={cx("sa-hbar-fill", a.status === "running" && "is-running")} style={{ width: `${a.status === "done" ? 100 : Math.max(a.status === "queued" ? 0 : 2, a.progress || 0)}%`, background: m.color }} /></span>
            <span className="row" style={{ gap: 6, justifyContent: "flex-end" }}><Icon name={m.icon} size={13} style={{ color: m.color }} /><span className="sa-hbar-value">{a.status === "waiting" ? "waiting" : `${a.status === "done" ? 100 : a.progress || 0}%`}</span></span>
          </button>
        );
      })}
    </div>
  );
}


/** Gantt of the agents that ran; live bars grow to "now" */
export function AgentTimeline({ pipeline, now }) {
  const start = new Date(pipeline?.startedAt || now).getTime();
  const ran = (pipeline?.agents || []).filter((a) => a.startedAt);
  const end = Math.max(start + 1000, pipeline?.finishedAt ? new Date(pipeline.finishedAt).getTime() : now, ...ran.map((a) => (a.finishedAt ? new Date(a.finishedAt).getTime() : now)));
  const span = end - start;
  if (!ran.length) return <p className="small muted" style={{ margin: 0 }}>Agents appear here as they start.</p>;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="sa-gantt">
      <div className="sa-gantt-axis" style={{ gridTemplateColumns: "170px minmax(0,1fr)" }}>
        <span />
        <span className="sa-gantt-ticks">{ticks.map((t) => <em key={t} style={{ left: `${t * 100}%` }}>{msLabel(Math.round(span * t))}</em>)}</span>
      </div>
      {ran.map((a) => {
        const s = new Date(a.startedAt).getTime() - start;
        const e = (a.finishedAt ? new Date(a.finishedAt).getTime() : now) - start;
        const m = STATUS_META[a.status] || STATUS_META.queued;
        return (
          <div key={a.id} className="sa-gantt-row" style={{ gridTemplateColumns: "170px minmax(0,1fr)" }} title={`${a.name}: ${msLabel(a.durationMs ?? e - s)}`}>
            <span className="sa-hbar-label ellipsis">{a.name}</span>
            <span className="sa-gantt-track">
              {ticks.slice(1, -1).map((t) => <i key={t} style={{ left: `${t * 100}%` }} />)}
              <span className={cx("sa-gantt-bar", a.status === "running" && "is-running")} style={{ left: `${(s / span) * 100}%`, width: `${Math.max(0.8, ((e - s) / span) * 100)}%`, background: m.color }} />
              <em style={{ left: `calc(${Math.min(88, ((e) / span) * 100)}% + 6px)` }}>{msLabel(a.durationMs ?? e - s)}</em>
            </span>
          </div>
        );
      })}
    </div>
  );
}
