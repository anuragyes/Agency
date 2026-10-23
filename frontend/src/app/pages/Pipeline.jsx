// Publishing pipeline — LIVE from GET /api/instagram/posts + /api/facebook/posts (grouped by status); demo board when empty
import { useState } from "react";
import { Link } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Avatar, Btn, DemoTag, LiveTag, PageHeader, Pill, Segmented, gradientFor, timeAgo, useToast } from "../ui/kit";
import { Meter } from "../ui/charts";
import { useWorkspace } from "../store";
import { postApi } from "../api";
import { PLATFORM_META, STATUS_META, TYPE_META, editorPath, formatSchedule, postTitle, publishInfo, scorePost, typeLabel } from "../postUtils";
import { PIPELINE_DEMO } from "../mock";

const LIVE_COLS = [
  { key: "draft", title: "Needs review", icon: "pen", tone: "amber" },
  { key: "approved", title: "Approved", icon: "checkCircle", tone: "violet" },
  { key: "scheduled", title: "Scheduled", icon: "calendar", tone: "violet" },
  { key: "publishing", title: "Publishing", icon: "upload", tone: "blue" },
  { key: "published", title: "Published", icon: "rocket", tone: "green" },
  { key: "failed", title: "Failed", icon: "alert", tone: "red" },
];
const DEMO_COLS = [
  { key: "drafting", title: "AI drafting", icon: "sparkles", tone: "blue" },
  { key: "safety", title: "Brand & safety", icon: "shield", tone: "amber" },
  { key: "approval", title: "Awaiting approval", icon: "userPlus", tone: "red" },
  { key: "scheduled", title: "Scheduled", icon: "calendar", tone: "violet" },
  { key: "published", title: "Published", icon: "checkCircle", tone: "green" },
];
const colColor = { amber: "#f59e0b", violet: "#5b4cf6", blue: "#0ea5e9", green: "#10b981", red: "#ef4444" };

function LiveCard({ p, onApprove, busy }) {
  const s = scorePost(p);
  const pub = publishInfo(p);
  const to = editorPath(p);
  return (
    <div className="sa-kcard">
      <Link to={to} className="cover" style={{ background: gradientFor(p._id), display: "block" }} aria-label="Open post" />
      <div className="row between"><PlatformIcon platform={p.platform || "instagram"} size={24} /><Pill tone="gray" icon={TYPE_META[p.contentType]?.icon}>{typeLabel(p)}</Pill></div>
      <Link to={to}><h5>{postTitle(p)}</h5></Link>
      <div className="row between">
        <Pill tone={STATUS_META[p.status].tone}>{p.status === "published" && pub.publishedAt ? `Live · ${timeAgo(pub.publishedAt)}` : p.status === "scheduled" && p.scheduledAt ? `Goes live ${formatSchedule(p.scheduledAt)}` : `Score ${s.score} · ${timeAgo(p.updatedAt)}`}</Pill>
        <Avatar name="Sarah Johnson" size={28} />
      </div>
      {p.status === "draft" && (
        <div className="sa-grid g-2" style={{ gap: 8 }}>
          <Btn size="sm" to={to}>Edit</Btn>
          <Btn size="sm" variant="primary" loading={busy} onClick={() => onApprove(p)}>Approve</Btn>
        </div>
      )}
      {(p.status === "approved" || p.status === "failed") && <Btn size="sm" variant="primary" icon="upload" to={to}>{p.status === "failed" ? "Retry publish" : "Publish"}</Btn>}
      {p.status === "scheduled" && <Btn size="sm" icon="calendar" to={to}>Change time</Btn>}
      {p.status === "published" && pub.permalink && <a className="sa-link" href={pub.permalink} target="_blank" rel="noreferrer">View on {PLATFORM_META[p.platform]?.label || "Instagram"} <Icon name="arrowUpRight" size={14} /></a>}
    </div>
  );
}

function DemoCard({ c }) {
  return (
    <div className="sa-kcard">
      {c.cover && <div className="cover" style={{ background: gradientFor(c.title) }} />}
      <div className="row between"><PlatformIcon platform={c.ch} size={24} />{c.progress != null && <Pill tone="blue" icon="sparkles">AI</Pill>}</div>
      <h5>{c.title}</h5>
      {c.progress != null && <Meter value={c.progress} color="#0ea5e9" />}
      <div className="row between">
        {c.pill ? <Pill tone={c.pill[0]}>{c.pill[1]}</Pill> : <Pill tone="blue">{c.label}</Pill>}
        <Avatar name={c.who} size={28} />
      </div>
      {c.actions && <div className="sa-grid g-2" style={{ gap: 8 }}><Btn size="sm">Request edit</Btn><Btn size="sm" variant="primary">Approve</Btn></div>}
    </div>
  );
}

export default function Pipeline() {
  const { posts, upsertPost, online, refreshPosts } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const real = posts.data || [];
  const [mode, setMode] = useState(null);
  const view = mode || (real.length ? "live" : "demo");

  const approve = async (p) => {
    setBusy(p._id);
    try {
      const r = await postApi(p.platform).approvePost(p._id);
      upsertPost(r.data);
      toast(r.assistant?.message || "Approved", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  };

  const by = (k) => real.filter((p) => p.status === k);
  const stats = view === "live"
    ? [["bulb", "violet", "Total posts", real.length], ["pen", "amber", "Needs review", by("draft").length], ["checkCircle", "violet", "Approved", by("approved").length], ["rocket", "green", "Published", by("published").length], ["alert", "red", "Failed", by("failed").length]]
    : [["bulb", "violet", "Ideas", 24], ["sparkles", "blue", "AI drafting", 8], ["shield", "amber", "Brand & safety check", 5], ["userPlus", "red", "Awaiting approval", 3], ["rocket", "green", "Scheduled", 41]];

  return (
    <>
      <PageHeader title={<>Publishing pipeline {view === "live" ? <LiveTag>Live · Instagram + Facebook</LiveTag> : <DemoTag />}</>} sub="Every post moves through AI drafting, brand safety and approval before it goes live.">
        <Segmented value={view} onChange={setMode} options={[{ value: "live", label: `My posts (${real.length})` }, { value: "demo", label: "Demo board" }]} />
        <Btn icon="refresh" onClick={refreshPosts} loading={posts.loading}>Refresh</Btn>
        <Btn variant="primary" icon="plus" to="/app/studio">New post</Btn>
      </PageHeader>

      <div className="sa-card" style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        {stats.map(([ic, tone, l, v], i) => (
          <div key={l} className="row" style={{ padding: "20px 22px", borderLeft: i ? "1px solid var(--sa-border)" : 0, gap: 14 }}>
            <span className={`sa-ic lg tone-${tone}`}><Icon name={ic} size={20} /></span>
            <div><div className="small muted">{l}</div><div className="strong" style={{ fontSize: 26, fontFamily: "var(--sa-head)" }}>{v}</div></div>
          </div>
        ))}
        <div style={{ padding: "20px 22px", borderLeft: "1px solid var(--sa-border)", background: "#f7f6ff" }}>
          <div className="small muted">Avg. idea → live</div>
          <div style={{ fontSize: 26, fontFamily: "var(--sa-head)", fontWeight: 700, color: "var(--sa-primary)" }}>2.4 hrs</div>
        </div>
      </div>

      {view === "live" && !real.length && (
        <div className="sa-banner mt">
          <span className="sa-banner-ic"><Icon name="sparkles" size={22} /></span>
          <div className="sa-banner-body"><h4>{online === false ? "Backend offline" : "No posts yet"}</h4><p>{online === false ? "Start the backend to see your real pipeline." : "Generate a post in the AI Content Studio and it will appear here."}</p></div>
          <Btn variant="primary" to="/app/studio">Create post</Btn>
        </div>
      )}

      <div className="sa-kanban mt">
        {(view === "live" ? LIVE_COLS : DEMO_COLS).map((col) => {
          const items = view === "live" ? by(col.key) : PIPELINE_DEMO[col.key] || [];
          if (view === "live" && col.key === "failed" && !items.length) return null;
          return (
            <div key={col.key} className="sa-col">
              <div className="sa-col-head"><Icon name={col.icon} size={18} style={{ color: colColor[col.tone] }} />{col.title}<em>{view === "demo" && col.key === "scheduled" ? 41 : view === "demo" && col.key === "published" ? 126 : items.length}</em></div>
              {items.map((it, i) => (view === "live" ? <LiveCard key={it._id} p={it} busy={busy === it._id} onApprove={approve} /> : <DemoCard key={i} c={it} />))}
              <Link to="/app/studio" className="sa-addcard"><Icon name="plus" size={16} /> Add card</Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
