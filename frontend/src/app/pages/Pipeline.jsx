// Publishing pipeline — 100% Real data from Instagram, Facebook, and YouTube APIs
// Filterable by Project workspace and Social Media platform (All, Instagram, Facebook, YouTube)
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon, { PlatformIcon, PLATFORM_LABEL } from "../ui/Icon";
import { Avatar, Btn, LiveTag, PageHeader, Pill, cx, gradientFor, timeAgo, useToast } from "../ui/kit";
import ProjectSelectorHub from "../ui/ProjectSelectorHub";
import CreateProjectModal from "../ui/CreateProjectModal";
import { useWorkspace } from "../store";
import { postApi } from "../api";
import { PLATFORM_META, STATUS_META, TYPE_META, editorPath, formatSchedule, postTitle, publishInfo, scorePost, typeLabel } from "../postUtils";

const LIVE_COLS = [
  { key: "draft", title: "Needs review", icon: "pen", tone: "amber" },
  { key: "approved", title: "Approved", icon: "checkCircle", tone: "violet" },
  { key: "scheduled", title: "Scheduled", icon: "calendar", tone: "violet" },
  { key: "publishing", title: "Publishing", icon: "upload", tone: "blue" },
  { key: "published", title: "Published", icon: "rocket", tone: "green" },
  { key: "failed", title: "Failed", icon: "alert", tone: "red" },
];
const colColor = { amber: "#f59e0b", violet: "#5b4cf6", blue: "#0ea5e9", green: "#10b981", red: "#ef4444" };

function LiveCard({ p, onApprove, busy }) {
  const s = scorePost(p);
  const pub = publishInfo(p);
  const to = editorPath(p);
  const thumbUrl = p.thumbnail?.url || p.media?.[0]?.url || (p.video?.url ? null : null);

  return (
    <div className="sa-kcard">
      <Link
        to={to}
        className="cover"
        style={{
          background: gradientFor(p._id),
          display: "block",
          position: "relative",
          overflow: "hidden",
        }}
        aria-label="Open post"
      >
        {thumbUrl && (
          <img
            src={thumbUrl}
            alt={postTitle(p)}
            style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
          />
        )}
      </Link>
      <div className="row between">
        <PlatformIcon platform={p.platform || "instagram"} size={24} />
        <Pill tone="gray" icon={TYPE_META[p.contentType]?.icon}>
          {typeLabel(p)}
        </Pill>
      </div>
      <Link to={to}>
        <h5>{postTitle(p)}</h5>
      </Link>
      <div className="row between">
        <Pill tone={STATUS_META[p.status]?.tone || "gray"}>
          {p.status === "published" && pub.publishedAt
            ? `Live · ${timeAgo(pub.publishedAt)}`
            : p.status === "scheduled" && p.scheduledAt
            ? `Goes live ${formatSchedule(p.scheduledAt)}`
            : `Score ${s.score} · ${timeAgo(p.updatedAt)}`}
        </Pill>
        <Avatar name={p.productProfile?.name || "Sociva"} size={28} />
      </div>
      {p.status === "draft" && (
        <div className="sa-grid g-2" style={{ gap: 8 }}>
          <Btn size="sm" to={to}>
            Edit
          </Btn>
          <Btn size="sm" variant="primary" loading={busy} onClick={() => onApprove(p)}>
            Approve
          </Btn>
        </div>
      )}
      {(p.status === "approved" || p.status === "failed") && (
        <Btn size="sm" variant="primary" icon="upload" to={to}>
          {p.status === "failed" ? "Retry publish" : "Publish"}
        </Btn>
      )}
      {p.status === "scheduled" && (
        <Btn size="sm" icon="calendar" to={to}>
          Change time
        </Btn>
      )}
      {p.status === "published" && pub.permalink && (
        <a className="sa-link" href={pub.permalink} target="_blank" rel="noreferrer">
          View on {PLATFORM_META[p.platform]?.label || "Platform"} <Icon name="arrowUpRight" size={14} />
        </a>
      )}
    </div>
  );
}

export default function Pipeline() {
  const { posts, upsertPost, online, refreshPosts, current, products, selectProduct } = useWorkspace();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState("all"); // "all" | "instagram" | "facebook" | "youtube"

  const real = useMemo(() => posts.data || [], [posts.data]);
  const brandName = current?.aiProfile?.name || current?.name || current?.rawInput?.slice(0, 24) || "Your Project";

  // Filter posts by selected social platform
  const filtered = useMemo(() => {
    if (platformFilter === "all") return real;
    return real.filter((p) => (p.platform || "instagram") === platformFilter);
  }, [real, platformFilter]);

  const igCount = useMemo(() => real.filter((p) => (p.platform || "instagram") === "instagram").length, [real]);
  const fbCount = useMemo(() => real.filter((p) => p.platform === "facebook").length, [real]);
  const ytCount = useMemo(() => real.filter((p) => p.platform === "youtube").length, [real]);

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

  const by = (k) => filtered.filter((p) => p.status === k);

  const stats = [
    ["bulb", "violet", "Total posts", filtered.length],
    ["pen", "amber", "Needs review", by("draft").length],
    ["checkCircle", "violet", "Approved", by("approved").length],
    ["calendar", "blue", "Scheduled", by("scheduled").length],
    ["rocket", "green", "Published", by("published").length],
    ["alert", "red", "Failed", by("failed").length],
  ];

  return (
    <>
      {/* ───── Project Selector Hub ───── */}
      <ProjectSelectorHub
        current={current}
        products={products}
        onSelect={(id) => selectProduct(id)}
        onNewProject={() => setCreateProjectOpen(true)}
        title="Project Publishing Pipelines"
        subtitle="Select a project below to switch publishing pipeline. Each project maintains its own isolated pipeline stages, drafts, and live schedules."
        actionText="+ New Project"
      />

      {/* ───── Page Header ───── */}
      <PageHeader
        title={
          <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            <span>{brandName}'s Pipeline</span>
            <LiveTag>Real Data · {platformFilter === "all" ? "All Channels" : PLATFORM_LABEL[platformFilter] || platformFilter}</LiveTag>
          </div>
        }
        sub={`Track ${filtered.length} live posts for ${brandName} across drafting, review, scheduling, and auto-publishing.`}
      >
        <Btn icon="refresh" onClick={refreshPosts} loading={posts.loading}>
          Refresh
        </Btn>
        <Btn variant="primary" icon="plus" to="/app/studio">
          New post in Studio
        </Btn>
      </PageHeader>

      {/* ───── Social Media Filter Chips ───── */}
      <div className="row wrap between" style={{ alignItems: "center", gap: 12, margin: "6px 0 16px" }}>
        <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
          <span className="small strong muted" style={{ marginRight: 4 }}>Filter by Channel:</span>
          <button
            type="button"
            className={cx("sa-chip", platformFilter === "all" && "on")}
            onClick={() => setPlatformFilter("all")}
            style={{ cursor: "pointer", height: 36, padding: "0 14px", fontSize: 13 }}
          >
            <Icon name="globe" size={15} /> All Social Media ({real.length})
          </button>
          <button
            type="button"
            className={cx("sa-chip", platformFilter === "instagram" && "on")}
            onClick={() => setPlatformFilter("instagram")}
            style={{ cursor: "pointer", height: 36, padding: "0 14px", fontSize: 13 }}
          >
            <PlatformIcon platform="instagram" size={17} /> Instagram ({igCount})
          </button>
          <button
            type="button"
            className={cx("sa-chip", platformFilter === "facebook" && "on")}
            onClick={() => setPlatformFilter("facebook")}
            style={{ cursor: "pointer", height: 36, padding: "0 14px", fontSize: 13 }}
          >
            <PlatformIcon platform="facebook" size={17} /> Facebook ({fbCount})
          </button>
          <button
            type="button"
            className={cx("sa-chip", platformFilter === "youtube" && "on")}
            onClick={() => setPlatformFilter("youtube")}
            style={{ cursor: "pointer", height: 36, padding: "0 14px", fontSize: 13 }}
          >
            <PlatformIcon platform="youtube" size={17} /> YouTube ({ytCount})
          </button>
        </div>
      </div>

      {/* ───── Pipeline Stage Statistics ───── */}
      <div className="sa-card" style={{ padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        {stats.map(([ic, tone, l, v], i) => (
          <div key={l} className="row" style={{ padding: "18px 20px", borderLeft: i ? "1px solid var(--sa-border)" : 0, gap: 12 }}>
            <span className={`sa-ic lg tone-${tone}`}>
              <Icon name={ic} size={20} />
            </span>
            <div>
              <div className="small muted">{l}</div>
              <div className="strong" style={{ fontSize: 24, fontFamily: "var(--sa-head)" }}>
                {v}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ───── Empty State Banner ───── */}
      {!filtered.length && (
        <div className="sa-banner mt">
          <span className="sa-banner-ic">
            <Icon name="sparkles" size={22} />
          </span>
          <div className="sa-banner-body">
            <h4>
              {online === false
                ? "Backend offline"
                : real.length === 0
                ? `No posts in ${brandName}'s pipeline yet`
                : `No ${PLATFORM_LABEL[platformFilter] || platformFilter} posts in pipeline`}
            </h4>
            <p>
              {online === false
                ? "Start the backend to connect your live database."
                : real.length === 0
                ? "Generate a post in the AI Content Studio and it will appear here moving through review, approval, and publishing."
                : `You currently have 0 posts for ${PLATFORM_LABEL[platformFilter] || platformFilter}. Switch to 'All Social Media' or create a new post in Studio.`}
            </p>
          </div>
          {platformFilter !== "all" && real.length > 0 && (
            <Btn variant="outline" onClick={() => setPlatformFilter("all")}>
              Show All Channels
            </Btn>
          )}
          <Btn variant="primary" to="/app/studio">
            Create post in Studio
          </Btn>
        </div>
      )}

      {/* ───── Live Kanban Board Columns ───── */}
      <div className="sa-kanban mt">
        {LIVE_COLS.map((col) => {
          const items = by(col.key);
          if (col.key === "failed" && !items.length) return null;
          return (
            <div key={col.key} className="sa-col">
              <div className="sa-col-head">
                <Icon name={col.icon} size={18} style={{ color: colColor[col.tone] }} />
                {col.title}
                <em>{items.length}</em>
              </div>
              {items.map((it) => (
                <LiveCard key={it._id} p={it} busy={busy === it._id} onApprove={approve} />
              ))}
              <Link to="/app/studio" className="sa-addcard">
                <Icon name="plus" size={16} /> Add card
              </Link>
            </div>
          );
        })}
      </div>

      {/* ───── Project Modal ───── */}
      <CreateProjectModal open={createProjectOpen} onClose={() => setCreateProjectOpen(false)} />
    </>
  );
}
