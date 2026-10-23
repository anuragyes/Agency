// ─────────────────────────────────────────────────────────────
// AgentPipeline.jsx — the multi-agent pipeline, live
//   agent graph (4 phases, parallel branches side by side) · progress chart per agent · timeline (Gantt)
//   live competitor data as each Competitor Research Agent finishes · activity log · agent skill file
// Data: pipeline = GET /api/competitor-research/:id/progress (polled while running)
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import Icon from "../../ui/Icon";
import { Card, Modal, Pill, cx, fmt } from "../../ui/kit";
import { ScoreRing } from "../../ui/charts";
import { AgentProgress, AgentTimeline, HBarList, StatusPill } from "../../ui/intelCharts";
import { FORMAT_LABEL, STATUS_META, msLabel } from "../../ui/intelTheme";

const PHASES = [
  { title: "Research", rows: [["orchestrator"], ["competitor_research"], ["data_collection"]] },
  { title: "Analyse & intelligence", rows: [["post_analysis", "comment_analysis"], ["competitor_performance"], ["content_gap"], ["content_opportunity"]] },
  { title: "Strategy & creation", rows: [["content_strategy"], ["content_ideation"], ["content_brief"], ["quality_check"]] },
  { title: "Approve, publish & learn", rows: [["customer_approval"], ["image_agent", "video_agent"], ["publish_schedule"], ["performance_analysis"], ["strategy_improvement"]] },
];
const AUTO = ["orchestrator", "competitor_research", "data_collection", "post_analysis", "comment_analysis", "competitor_performance", "content_gap", "content_opportunity", "content_strategy", "content_ideation", "content_brief", "quality_check"];

const engineLabel = (engine, useAI) => ({
  api: ["Instagram API", "api"], code: ["Code · no LLM", ""], "code+llm": useAI ? ["Code + 1 AI call", "llm"] : ["Code · no LLM", ""],
  human: ["You", ""], studio: ["Studio", ""],
}[engine] || [engine, ""]);

const hhmmss = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

function AgentNode({ a, useAI, onPick }) {
  const m = STATUS_META[a.status] || STATUS_META.queued;
  const [eng, engCls] = engineLabel(a.engine, useAI);
  return (
    <button type="button" className={cx("sa-anode", a.status === "running" && "is-running")} style={{ "--node-c": m.color }} onClick={() => onPick(a.id)}
      aria-label={`${a.name}: ${m.label}`}>
      <span className="sa-anode-top">
        <span className="sa-anode-ic"><Icon name={a.icon || "bot"} size={15} /></span>
        <b>{a.name}</b>
      </span>
      <span className="row between" style={{ gap: 6 }}>
        <StatusPill status={a.status} small />
        <span className={cx("sa-engine", engCls)}>{eng}</span>
      </span>
      {a.status !== "queued" && a.status !== "waiting" && (
        <span className="sa-meter" style={{ height: 5 }}><span style={{ width: `${a.status === "done" ? 100 : a.progress || 0}%`, background: m.color }} /></span>
      )}
      {a.message && <small>{a.message}</small>}
      {a.fanOut && a.children?.length > 0 && (
        <span className="sa-kids">
          {a.children.slice(0, 10).map((c) => (
            <span key={c.key} className={cx("sa-kid", c.status)} title={c.error || (c.engagementRate != null ? `${c.engagementRate}% ER · ${c.posts} posts` : c.status)}>
              {c.status === "done" ? "✓" : c.status === "failed" ? "✕" : c.status === "running" ? "…" : "·"} @{c.key}
            </span>
          ))}
          {a.children.length > 10 && <span className="sa-kid">+{a.children.length - 10}</span>}
        </span>
      )}
      {a.durationMs != null && <span className="sa-anode-meta"><span>{msLabel(a.durationMs)}</span>{a.finishedAt && <span>{hhmmss(a.finishedAt)}</span>}</span>}
    </button>
  );
}

export default function AgentPipeline({ pipeline, agentsMeta = [], useAI = true, running = false, title = "Agent pipeline" }) {
  const [now, setNow] = useState(() => Date.now());
  const [pick, setPick] = useState(null);
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  const agents = useMemo(() => pipeline?.agents || [], [pipeline]);
  const byId = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  if (!pipeline) return null;
  const c = pipeline.counters || {};
  const auto = agents.filter((a) => AUTO.includes(a.id));
  const doneAuto = auto.filter((a) => ["done", "failed", "skipped"].includes(a.status)).length;
  const overall = auto.length ? Math.round(auto.reduce((n, a) => n + (a.status === "done" ? 100 : a.progress || 0), 0) / auto.length) : 0;
  const elapsed = (pipeline.finishedAt ? new Date(pipeline.finishedAt).getTime() : now) - new Date(pipeline.startedAt).getTime();
  const picked = pick && byId.get(pick);
  const meta = pick && agentsMeta.find((x) => x.id === pick);
  const liveAcc = pipeline.live?.accounts || [];

  return (
    <div className="mt">
      {/* headline numbers */}
      <Card title={<>{title} {running ? <Pill tone="blue" icon="refresh">Live</Pill> : <StatusPill status={pipeline.status === "failed" ? "failed" : "done"} />}</>}
        sub={running ? `Now: ${byId.get(pipeline.current)?.name || "starting"} — updates every second.` : `Finished in ${msLabel(elapsed)}. Click any agent to see its skill file, numbers and log.`}>
        <div className="row wrap" style={{ gap: 18, alignItems: "center" }}>
          <ScoreRing value={overall} size={84} stroke={8} color={pipeline.status === "failed" ? "var(--sa-red)" : overall >= 100 ? "var(--sa-green)" : "var(--sa-blue)"} label={`${overall}%`} />
          <div className="sa-kpis grow">
            <div className="sa-kpi"><span>Agents finished</span><b>{doneAuto}/{auto.length}</b><small>+{agents.length - auto.length} wait for you</small></div>
            <div className="sa-kpi"><span>Competitors researched</span><b>{c.competitorsDone || 0}/{c.competitors || 0}</b><small>Business Discovery API</small></div>
            <div className="sa-kpi"><span>Posts analysed</span><b>{fmt(c.posts || 0)}</b><small>real posts</small></div>
            <div className="sa-kpi"><span>Your comments read</span><b>{fmt(c.comments || 0)}</b><small>Graph API</small></div>
            <div className="sa-kpi"><span>API calls · LLM calls</span><b>{c.apiCalls || 0} · {c.llmCalls || 0}</b><small>{c.llmTokens ? `${fmt(c.llmTokens)} tokens` : useAI ? "max 1 LLM call" : "AI writing off"}</small></div>
            <div className="sa-kpi"><span>Elapsed</span><b>{msLabel(elapsed)}</b><small>{hhmmss(pipeline.startedAt)} start</small></div>
          </div>
        </div>
      </Card>

      {/* graph */}
      <Card className="mt" title="Agent graph" sub="Each agent has one job and its own skill file. Brand context decides what they analyse. Arrows = data flow; side-by-side = run in parallel.">
        <div className="sa-agraph">
          {PHASES.map((ph, pi) => {
            const ids = ph.rows.flat();
            const fin = ids.filter((id) => byId.get(id)?.status === "done").length;
            return (
              <section key={ph.title} className="sa-aphase" aria-label={ph.title}>
                <header><b>{pi + 1} · {ph.title}</b><span>{fin}/{ids.length}</span></header>
                <div className="sa-astack">
                  {ph.rows.map((row) => (row.length > 1 ? (
                    <div key={row.join()} className="sa-apar">{row.map((id) => byId.get(id) && <AgentNode key={id} a={byId.get(id)} useAI={useAI} onPick={setPick} />)}</div>
                  ) : byId.get(row[0]) && <AgentNode key={row[0]} a={byId.get(row[0])} useAI={useAI} onPick={setPick} />))}
                </div>
              </section>
            );
          })}
        </div>
      </Card>

      {/* progress + timeline */}
      <div className="sa-grid g-2 mt">
        <Card title="Agent progress" sub="Every agent, live. Click a bar for details.">
          <AgentProgress agents={agents} onPick={setPick} />
          <div className="sa-legend mt-s" style={{ fontSize: 12.5 }}>
            {["done", "running", "waiting", "queued", "failed"].map((s) => <span key={s}><Icon name={STATUS_META[s].icon} size={13} style={{ color: STATUS_META[s].color }} />{STATUS_META[s].label}</span>)}
          </div>
        </Card>
        <Card title="Timeline" sub="When each agent ran and how long it took.">
          <AgentTimeline pipeline={pipeline} now={now} />
        </Card>
      </div>

      {/* live data + log */}
      <div className="sa-grid g-2 mt">
        <Card title="Live competitor data" sub="Engagement rate of each competitor as its research agent finishes (real API numbers).">
          <HBarList labelWidth={130} format={(v) => `${v}%`} empty="Waiting for the first competitor…"
            rows={[...liveAcc].sort((a, b) => (b.engagementRate ?? -1) - (a.engagementRate ?? -1)).map((a) => ({
              key: a.username, label: `@${a.username}`, value: a.engagementRate ?? 0, display: a.engagementRate != null ? `${a.engagementRate}%` : "—",
              sub: `${fmt(a.followers)} · ${FORMAT_LABEL[a.bestFormat] || "—"}`,
            }))} />
          {liveAcc.length > 0 && <p className="small faint" style={{ marginBottom: 0 }}>Sub-label = followers · best format. {liveAcc.reduce((n, a) => n + (a.postsAnalyzed || 0), 0)} posts collected.</p>}
        </Card>
        <Card title="Activity log" sub="What the agents are doing.">
          <div className="sa-log" aria-live="polite">
            {[...(pipeline.log || [])].reverse().slice(0, 40).map((l, i) => (
              <div key={`${l.at}${i}`}><time>{hhmmss(l.at)}</time><b>{byId.get(l.agent)?.name || l.agent}</b><span>{l.message}</span></div>
            ))}
            {!pipeline.log?.length && <p className="small muted" style={{ margin: 0 }}>Starting…</p>}
          </div>
        </Card>
      </div>

      <Modal open={!!picked} onClose={() => setPick(null)} title={picked ? `${picked.name} agent` : ""} width={760}>
        {picked && (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <StatusPill status={picked.status} />
              <span className={cx("sa-engine", engineLabel(picked.engine, useAI)[1])}>{engineLabel(picked.engine, useAI)[0]}</span>
              {picked.durationMs != null && <Pill tone="gray" icon="timer">{msLabel(picked.durationMs)}</Pill>}
              {meta?.skill && <Pill tone="outline" icon="file">skills/{meta.skill}</Pill>}
            </div>
            {picked.message && <p className="small" style={{ margin: "12px 0 0" }}>{picked.message}</p>}
            {meta?.role && <p className="small muted" style={{ margin: "10px 0 0", lineHeight: 1.6 }}>{meta.role}</p>}
            {Object.keys(picked.metrics || {}).length > 0 && (
              <div className="sa-kpis mt-s">
                {Object.entries(picked.metrics).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => (
                  <div key={k} className="sa-kpi"><span>{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span><b style={{ fontSize: 17 }}>{typeof v === "boolean" ? (v ? "yes" : "no") : typeof v === "number" ? fmt(v) : String(v)}</b></div>
                ))}
              </div>
            )}
            {picked.children?.length > 0 && (
              <div className="mt-s sa-list">
                {picked.children.map((ch) => (
                  <div key={ch.key} className="sa-li small"><StatusPill status={ch.status} small /><span className="grow"><b style={{ display: "inline" }}>@{ch.key}</b> {ch.error ? <span className="red">— {ch.error}</span> : ch.engagementRate != null && <span className="muted">— {fmt(ch.followers)} followers · {ch.engagementRate}% ER · {ch.posts} posts</span>}</span></div>
                ))}
              </div>
            )}
            {meta?.markdown && <>
              <div className="sa-section-label mt" style={{ marginBottom: 8 }}>Skill file (instructions + config the agent reads)</div>
              <pre className="sa-md">{meta.markdown}</pre>
            </>}
            {(pipeline.log || []).some((l) => l.agent === picked.id) && <>
              <div className="sa-section-label mt" style={{ marginBottom: 8 }}>Log</div>
              <div className="sa-log">{pipeline.log.filter((l) => l.agent === picked.id).map((l, i) => <div key={i}><time>{hhmmss(l.at)}</time><b>{picked.name}</b><span>{l.message}</span></div>)}</div>
            </>}
          </>
        )}
      </Modal>
    </div>
  );
}
