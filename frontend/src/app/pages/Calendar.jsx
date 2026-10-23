// Content calendar — project-scoped Instagram + Facebook posts (by publish / scheduled / update date)
// Each project has its own dedicated calendar with its own posts and schedule.
import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon, { PlatformIcon, PLATFORM_LABEL } from "../ui/Icon";
import { Btn, Card, IconBtn, Modal, PageHeader, Pill, Segmented, Toggle, gradientFor, useToast } from "../ui/kit";
import ScheduleFields from "../ui/ScheduleFields";
import ProjectSelectorHub from "../ui/ProjectSelectorHub";
import CreateProjectModal from "../ui/CreateProjectModal";
import BrandKnowledgeModal from "../ui/BrandKnowledgeModal";
import { useWorkspace } from "../store";
import { postApi } from "../api";
import {
  STATUS_META,
  defaultSchedule,
  editorPath,
  formatSchedule,
  fromScheduleInputs,
  platformMeta,
  platformOf,
  postTitle,
  publishInfo,
  scheduleError,
  timeUntil,
  typeLabel,
} from "../postUtils";

const ST_COLOR = {
  pub: "#10b981",
  sch: "#5b4cf6",
  appr: "#f59e0b",
  ai: "#a78bfa",
  draft: "#f59e0b",
  approved: "#5b4cf6",
  scheduled: "#5b4cf6",
  published: "#10b981",
  failed: "#ef4444",
  publishing: "#0ea5e9",
};

/** A post with a date & time that hasn't gone out yet -> clicking it opens "Change date & time" */
const isPlanned = (p) => !!p?.scheduledAt && !["published", "publishing"].includes(p.status);
const TINT = { instagram: "#fdf0f6", linkedin: "#eef5fd", x: "#f3f3f5", tiktok: "#f3f3f5", youtube: "#fdf0f0", facebook: "#eef3fe" };
const DOW = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export default function Calendar() {
  const { posts, current, products, selectProduct } = useWorkspace();
  const navigate = useNavigate();
  const now = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  const [view, setView] = useState("month");
  const [picked, setPicked] = useState(null); // scheduled post being re-timed
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);

  const real = useMemo(() => posts.data || [], [posts.data]);
  const brandName = current?.aiProfile?.name || current?.name || current?.rawInput?.slice(0, 24) || "Your Project";
  const pid = current?._id;

  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const startDow = (new Date(y, m, 1).getDay() + 6) % 7;

  const events = useMemo(() => {
    const map = {};
    for (const p of real) {
      // published -> when it went live · scheduled -> the day it will go live · else -> last edit
      const d = new Date(publishInfo(p).publishedAt || (isPlanned(p) ? p.scheduledAt : null) || p.updatedAt);
      if (d.getFullYear() !== y || d.getMonth() !== m) continue;
      (map[d.getDate()] ||= []).push({
        id: p._id,
        platform: p.platform || "instagram",
        ch: p.platform || "instagram",
        time: d.toTimeString().slice(0, 5),
        title: postTitle(p),
        st: p.status,
        post: p,
      });
    }
    return map;
  }, [real, y, m]);

  const cells = [];
  const prevDays = new Date(y, m, 0).getDate();
  for (let i = 0; i < startDow; i++) cells.push({ n: prevDays - startDow + 1 + i, out: true });
  for (let d = 1; d <= daysIn; d++) cells.push({ n: d });
  while (cells.length % 7) cells.push({ n: cells.length - startDow - daysIn + 1, out: true });

  const isToday = (d) => d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
  let shown = cells;
  if (view === "week") {
    const idx = cells.findIndex((c) => !c.out && (isToday(c.n) || (m !== now.getMonth() && c.n === 1)));
    const start = Math.max(0, idx - (idx % 7));
    shown = cells.slice(start, start + 7);
  }

  const counts = {};
  Object.values(events).flat().forEach((e) => {
    if (e.ch !== "ai") counts[e.ch] = (counts[e.ch] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const drafts = real.filter((p) => p.status === "draft");
  const scheduled = real
    .filter((p) => p.status === "scheduled" && p.scheduledAt)
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  const published = real.filter((p) => p.status === "published");

  const open = (e) =>
    isPlanned(e.post)
      ? setPicked(e.post)
      : e.id
      ? navigate(editorPath(e))
      : navigate(e.st === "ai" ? "/app/studio" : "/app/pipeline");
  const listDays = Object.keys(events).map(Number).sort((a, b) => a - b);

  return (
    <>
      {/* ───── Project Selector Hub ───── */}
      <ProjectSelectorHub
        current={current}
        products={products}
        onSelect={(id) => selectProduct(id)}
        onNewProject={() => setCreateProjectOpen(true)}
        title="Project Calendars"
        subtitle="Select a project below to switch calendar view. Each project maintains its own isolated schedule, published posts, and drafts."
        actionText="+ New Project"
      />

      {/* ───── Page Header for Active Project ───── */}
      <PageHeader
        title={
          <div className="row wrap" style={{ gap: 10, alignItems: "center" }}>
            <span>{brandName}'s Calendar</span>
            {current?.websiteUrl && (
              <a
                href={current.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: "none" }}
              >
                <Pill tone="blue" icon="globe">
                  {current.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
                </Pill>
              </a>
            )}
            {current?.knowledgeMd && (
              <button
                type="button"
                onClick={() => setKnowledgeOpen(true)}
                style={{
                  background: "none",
                  border: 0,
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                <Pill tone="green" icon="sparkles">
                  Brain (RAG) Synced
                </Pill>
              </button>
            )}
          </div>
        }
        sub={`${total} posts this month · ${scheduled.length} scheduled · ${published.length} published live · ${drafts.length} drafts`}
      >
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "list", label: "List" },
          ]}
        />
        <Btn variant="primary" icon="plus" to="/app/studio">
          Create Post in Studio
        </Btn>
      </PageHeader>

      <div className="sa-grid g-cal">
        <Card>
          <div className="row between wrap" style={{ marginBottom: 18 }}>
            <div className="row wrap" style={{ gap: 8, alignItems: "center" }}>
              <IconBtn icon="chevronLeft" label="Previous month" onClick={() => setCursor(new Date(y, m - 1, 1))} />
              <IconBtn icon="chevronRight" label="Next month" onClick={() => setCursor(new Date(y, m + 1, 1))} />
              <h2 className="sa-cal-title" style={{ margin: 0 }}>
                {cursor.toLocaleString("en", { month: "long" })} {y}
              </h2>
              <Btn size="sm" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))}>
                Today
              </Btn>
            </div>

            <div className="sa-legend">
              <span>
                <i style={{ background: ST_COLOR.pub }} />
                Published
              </span>
              <span>
                <i style={{ background: ST_COLOR.sch }} />
                Scheduled
              </span>
              <span>
                <i style={{ background: ST_COLOR.appr }} />
                Approved
              </span>
            </div>
          </div>

          {/* Empty state when project has 0 posts */}
          {real.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "54px 20px",
                background: "linear-gradient(180deg, #fbfbfe 0%, #f7f6fc 100%)",
                borderRadius: 18,
                border: "1px dashed var(--sa-border)",
                margin: "10px 0 20px",
                display: "grid",
                gap: 12,
                justifyItems: "center",
              }}
            >
              <span
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: "50%",
                  background: "var(--sa-primary-50)",
                  color: "var(--sa-primary)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon name="calendar" size={28} />
              </span>
              <div>
                <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700 }}>
                  No posts planned for {brandName} yet
                </h3>
                <p className="muted small" style={{ maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
                  Every project has its own isolated calendar. Schedule a post or generate new on-brand content in AI Content Studio.
                </p>
              </div>
              <div className="row wrap center" style={{ gap: 10, marginTop: 4 }}>
                <Btn variant="primary" icon="plus" to="/app/studio">
                  Create Post for {brandName}
                </Btn>
              </div>
            </div>
          ) : view === "list" ? (
            <div className="sa-list">
              {listDays.length ? (
                listDays.map((d) => (
                  <div key={d} className="sa-li" style={{ alignItems: "flex-start" }}>
                    <span style={{ width: 56, textAlign: "center" }}>
                      <small className="muted">{new Date(y, m, d).toLocaleString("en", { weekday: "short" })}</small>
                      <b style={{ fontSize: 22 }}>{d}</b>
                    </span>
                    <div className="grow" style={{ display: "grid", gap: 6 }}>
                      {events[d].map((e, i) => (
                        <button
                          key={i}
                          type="button"
                          className="sa-ev"
                          style={{ background: TINT[e.ch] || "#f6f7fb", fontSize: 14, padding: "8px 10px" }}
                          onClick={() => open(e)}
                        >
                          <i className="st" style={{ background: ST_COLOR[e.st] }} />
                          {e.ch !== "ai" ? <PlatformIcon platform={e.ch} size={18} /> : <Icon name="sparkles" size={16} />}
                          {e.time && <span className="muted">{e.time}</span>}
                          <b>{e.title}</b>
                          {isPlanned(e.post) && (
                            <span className="small" style={{ marginLeft: "auto", color: ST_COLOR[e.st] }}>
                              <Icon name="clock" size={13} style={{ verticalAlign: "-2px" }} />{" "}
                              {e.st === "scheduled" ? "Scheduled" : STATUS_META[e.st]?.label}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="muted" style={{ padding: "30px 0", textAlign: "center" }}>
                  Nothing scheduled for {brandName} this month.
                </p>
              )}
            </div>
          ) : (
            <div className="sa-cal-wrap">
              <div className="sa-cal">
                {DOW.map((d) => (
                  <div key={d} className="h">
                    {d}
                  </div>
                ))}
                {shown.map((c, i) => (
                  <div
                    key={i}
                    className={`d ${c.out ? "out" : ""} ${!c.out && isToday(c.n) ? "today" : ""}`}
                    style={view === "week" ? { minHeight: 320 } : undefined}
                  >
                    <span className="n">{c.n}</span>
                    {!c.out &&
                      (events[c.n] || [])
                        .slice(0, view === "week" ? 10 : 3)
                        .map((e, k) => (
                          <button
                            key={k}
                            type="button"
                            className={`sa-ev ${e.st === "ai" ? "ai" : ""}`}
                            style={e.st !== "ai" ? { background: TINT[e.ch] } : undefined}
                            onClick={() => open(e)}
                            title={`${PLATFORM_LABEL[e.ch] || "AI"} · ${e.title}${
                              isPlanned(e.post)
                                ? ` · scheduled ${formatSchedule(e.post.scheduledAt)} — click to change`
                                : ""
                            }`}
                          >
                            {e.st !== "ai" && <i className="st" style={{ background: ST_COLOR[e.st] }} />}
                            {e.st === "ai" ? <Icon name="sparkles" size={13} /> : <PlatformIcon platform={e.ch} size={16} radius={4} />}
                            {e.time && <span className="t">{e.time}</span>}
                            <b>{e.title}</b>
                          </button>
                        ))}
                    {!c.out && (events[c.n] || []).length > 3 && view === "month" && (
                      <small className="muted">+{events[c.n].length - 3} more</small>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ───── Project Sidebar ───── */}
        <div className="g-cal-side">
          <div className="sa-card" style={{ background: "var(--sa-grad-soft)" }}>
            <div className="row">
              <span className="sa-ic lg tone-grad">
                <Icon name="wand" size={21} />
              </span>
              <h3 style={{ fontSize: 18 }}>Post Studio for {brandName}</h3>
            </div>
            <p className="muted small" style={{ margin: "6px 0 0" }}>
              Draft on-brand posts grounded in {brandName}'s RAG knowledge base.
            </p>
            <Btn variant="grad" className="sa-btn-block mt-s" icon="sparkles" to="/app/studio">
              Launch Studio for {brandName}
            </Btn>
          </div>

          {/* Project Details Pill Card */}
          <Card title="About This Project">
            <div style={{ display: "grid", gap: 10, fontSize: 13 }}>
              <div>
                <b className="strong" style={{ display: "block" }}>{brandName}</b>
                {current?.aiProfile?.category && (
                  <span className="small muted">{current.aiProfile.category}</span>
                )}
              </div>
              {current?.websiteUrl && (
                <div className="row" style={{ gap: 6, color: "var(--sa-primary)" }}>
                  <Icon name="globe" size={14} />
                  <a
                    href={current.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ellipsis"
                    style={{ color: "var(--sa-primary)", textDecoration: "none", fontWeight: 600 }}
                  >
                    {current.websiteUrl.replace(/^https?:\/\//, "")} ↗
                  </a>
                </div>
              )}
              {current?.knowledgeMd && (
                <Btn size="sm" icon="book" variant="ghost" onClick={() => setKnowledgeOpen(true)}>
                  View Brand Knowledge (.md)
                </Btn>
              )}
            </div>
          </Card>

          {/* Scheduled Posts for this project */}
          {scheduled.length > 0 && (
            <Card title={`Scheduled (${scheduled.length})`}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
                {scheduled.slice(0, 6).map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    className="row"
                    onClick={() => setPicked(p)}
                    title="Change date & time"
                    style={{
                      border: "1px solid var(--sa-border)",
                      borderRadius: 14,
                      padding: 10,
                      textAlign: "left",
                      background: "#fff",
                      width: "100%",
                      cursor: "pointer",
                    }}
                  >
                    <span className="sa-ic tone-violet">
                      <Icon name="calendar" size={17} />
                    </span>
                    <span className="grow" style={{ minWidth: 0 }}>
                      <b className="ellipsis strong" style={{ fontSize: 13.5, display: "block" }}>
                        {postTitle(p)}
                      </b>
                      <small className="muted">
                        {formatSchedule(p.scheduledAt)} · {timeUntil(p.scheduledAt)}
                      </small>
                    </span>
                    <PlatformIcon platform={p.platform || "instagram"} size={22} />
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Drafts for this project */}
          <Card
            title={`Drafts for ${brandName}`}
            action={<span className="sa-pill tone-gray">{drafts.length}</span>}
          >
            {drafts.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
                {drafts.slice(0, 6).map((d) => (
                  <Link
                    key={d._id}
                    to={editorPath(d)}
                    className="row"
                    style={{
                      border: "1px solid var(--sa-border)",
                      borderRadius: 14,
                      padding: 10,
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <Icon name="grip" size={16} className="faint" />
                    <span
                      className="sa-thumb"
                      style={{ width: 40, height: 40, borderRadius: 10, background: gradientFor(postTitle(d)) }}
                    />
                    <b className="grow ellipsis strong" style={{ fontSize: 13.5 }}>
                      {postTitle(d)}
                    </b>
                    <PlatformIcon platform={d.platform || "instagram"} size={22} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="small muted" style={{ margin: 0 }}>
                No drafts yet for {brandName}.
              </p>
            )}
          </Card>

          {/* Monthly distribution */}
          <Card title="This Month's Channels">
            {Object.keys(counts).length ? (
              Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([ch, n]) => (
                  <div key={ch} className="row between" style={{ padding: "7px 0" }}>
                    <span className="row">
                      <PlatformIcon platform={ch} size={22} />
                      {PLATFORM_LABEL[ch]}
                    </span>
                    <b className="strong">{n}</b>
                  </div>
                ))
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No posts this month for {brandName}.
              </p>
            )}
          </Card>
        </div>
      </div>

      {picked && <RescheduleModal key={picked._id} post={picked} onClose={() => setPicked(null)} />}

      <CreateProjectModal
        open={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        onCreated={(p) => selectProduct(p._id)}
      />

      <BrandKnowledgeModal
        open={knowledgeOpen}
        onClose={() => setKnowledgeOpen(false)}
        productId={pid}
        productName={brandName}
      />
    </>
  );
}

/** Calendar -> click a scheduled post: change its date & time, cancel the schedule, or open it in the Editor */
function RescheduleModal({ post, onClose }) {
  const { upsertPost } = useWorkspace();
  const toast = useToast();
  const navigate = useNavigate();
  const platform = platformOf(post);
  const pm = platformMeta(post);
  const api = postApi(platform);
  const [when, setWhen] = useState(() => defaultSchedule(post.scheduledAt));
  const [busy, setBusy] = useState("");
  const canTime = ["scheduled", "approved", "failed"].includes(post.status);
  const placement = post.scheduledPlacement || "feed";
  const err = scheduleError(when);

  const save = async () => {
    if (err) return;
    setBusy("save");
    try {
      const r = await api.schedulePost(post._id, fromScheduleInputs(when).toISOString(), placement);
      upsertPost({ ...r.data, platform });
      toast(`Moved to ${formatSchedule(r.data.scheduledAt)}`, "success");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    setBusy("cancel");
    try {
      const r = await api.unschedulePost(post._id);
      upsertPost({ ...r.data, platform });
      toast("Schedule cancelled — the post is approved and waiting in the Editor", "success");
      onClose();
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={post.status === "scheduled" ? "Scheduled Post" : "Planned Post"}
      footer={
        <>
          <Btn icon="pen" onClick={() => navigate(editorPath(post))} disabled={!!busy}>
            Open Post
          </Btn>
          {post.status === "scheduled" && (
            <Btn variant="ghost" onClick={cancel} loading={busy === "cancel"} disabled={!!busy}>
              Cancel Schedule
            </Btn>
          )}
          {canTime && (
            <Btn variant="primary" icon="calendar" onClick={save} loading={busy === "save"} disabled={!!err || !!busy}>
              Save New Time
            </Btn>
          )}
        </>
      }
    >
      <div className="row" style={{ gap: 12, marginBottom: 14 }}>
        <span
          className="sa-thumb"
          style={{ width: 52, height: 52, borderRadius: 13, background: gradientFor(post._id), flexShrink: 0 }}
        />
        <div style={{ minWidth: 0 }}>
          <b className="strong ellipsis" style={{ display: "block" }}>
            {postTitle(post)}
          </b>
          <span className="row small muted" style={{ gap: 6 }}>
            <PlatformIcon platform={platform} size={18} />
            {pm.label} · {typeLabel(post)} · {pm.where[placement]}
          </span>
        </div>
        <Pill tone={STATUS_META[post.status]?.tone} icon={STATUS_META[post.status]?.icon}>
          {STATUS_META[post.status]?.label}
        </Pill>
      </div>
      <p className="small" style={{ margin: "0 0 14px" }}>
        {post.status === "scheduled" ? (
          <>
            Goes live <b className="strong">{formatSchedule(post.scheduledAt)}</b> ({timeUntil(post.scheduledAt)}). Pick a
            new date & time to move it.
          </>
        ) : post.status === "failed" ? (
          <>
            The scheduled publish failed
            {publishInfo(post).error ? `: ${publishInfo(post).error}` : "."} Fix it in the Editor, or pick a new time to
            try again.
          </>
        ) : post.status === "approved" ? (
          <>
            Was planned for <b className="strong">{formatSchedule(post.scheduledAt)}</b>. Pick a new date & time to
            schedule it again.
          </>
        ) : (
          <>
            Planned for <b className="strong">{formatSchedule(post.scheduledAt)}</b>, but the post was edited after it
            was scheduled — open it and approve it again to keep it on the schedule.
          </>
        )}
      </p>
      {canTime && <ScheduleFields value={when} onChange={setWhen} disabled={!!busy} />}
    </Modal>
  );
}
