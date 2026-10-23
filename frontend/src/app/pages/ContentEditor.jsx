// ─────────────────────────────────────────────────────────────
// ContentEditor.jsx — edit → AI revise → approve → "Can I upload?" → publish now (to Feed or Story) — or schedule it
//   "Schedule for later": pick a date & time -> POST …/posts/:id/schedule -> the backend (services/postScheduler.js)
//   publishes it by itself then. It shows on that day in the Calendar, where the date & time can be changed.
// Works for Instagram AND Facebook posts: /app/editor/:id?platform=facebook (postApi(platform) picks the backend)
// The preview toggle decides where it goes: Feed / Grid -> feed post, Story -> Instagram Story
// LIVE: GET/PATCH /api/instagram/posts/:id, POST …/revise, …/approve, …/publish, POST /api/instagram/media
// Media: the user's own image (upload / URL) OR "Generate with AI" (ui/ImageGenerator.jsx -> /api/image-gen)
// Hashtags: REAL ones — from the Studio's Instagram research (post.instagramResearch, no API call),
//           else the local cache, else GET /api/instagram/instagram/hashtag-search?q=<brand>. The user selects up to 6.
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Avatar, Btn, Card, ChipInput, Empty, Field, IconBtn, LiveTag, Modal, PageHeader, Pill, Segmented, Spinner, cx, gradientFor, timeAgo, useToast } from "../ui/kit";
import { ScoreRing } from "../ui/charts";
import FlowSteps from "../ui/FlowSteps";
import ImageGenerator from "../ui/ImageGenerator";
import ScheduleFields from "../ui/ScheduleFields";
import { useWorkspace } from "../store";
import { postApi, searchHashtags } from "../api";
import { getMediaStorage } from "../../api/imageGenApi";
import { PLATFORM_META, STATUS_META, TYPE_META, coverText, defaultSchedule, editorPath, formatSchedule, fromScheduleInputs, hasUpcomingSchedule, postTitle, predictReach, publishInfo, scheduleError, scorePost, timeUntil, typeLabel } from "../postUtils";

// hashtags per post: PLATFORM_META[platform].maxTags (Instagram 6 real ones, Facebook up to 5 — 0–3 work best)
const tagKey = (t) => String(t || "").trim().replace(/^#+/, "").toLowerCase();
const TAG_CACHE = (q) => `sociva.hashtagSearch.${tagKey(q).replace(/\s+/g, "")}`;
const readTagCache = (q) => { try { return JSON.parse(localStorage.getItem(TAG_CACHE(q))); } catch { return null; } };
const writeTagCache = (q, v) => { try { localStorage.setItem(TAG_CACHE(q), JSON.stringify(v)); } catch { /* storage blocked */ } };

/* Same rules as backend instagramPublishService / facebookPublishService (checkMedia / checkStoryMedia) — shown BEFORE the user clicks */
const LOCAL_URL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/;
function publishBlocker(platform, contentType, placement, media = [], cloud = false) {
  const images = media.filter((m) => m.type === "image").length;
  const videos = media.filter((m) => m.type === "video").length;
  const name = PLATFORM_META[platform]?.label || "Instagram";
  if (placement === "story") {
    if (!media.length) return { fix: "media", text: `Add 1 image (${platform === "facebook" ? "JPEG/PNG" : "JPEG"}) or 1 video for the Story.` };
  } else if (platform === "facebook") {
    if (contentType === "text" && media.length) return { fix: "media", text: "A text post has no photo or video — remove the media, or switch the format to Photo post / Photo album / Reel." };
    if (contentType === "image" && (images !== 1 || videos)) return { fix: "media", text: "A photo post needs exactly 1 image (JPEG or PNG)." };
    if (contentType === "carousel" && (videos || images < 2 || images > 10)) return { fix: "media", text: `A photo album needs 2–10 images, no videos (now ${images} image${images === 1 ? "" : "s"}${videos ? ` + ${videos} video` : ""}).` };
    if (contentType === "reel" && (videos !== 1 || images)) return { fix: "media", text: "A reel needs exactly 1 video (MP4/MOV, vertical 9:16)." };
  } else if (contentType === "image" && images !== 1) return { fix: "media", text: "An image post needs exactly 1 image (JPEG)." };
  else if (contentType === "reel" && videos !== 1) return { fix: "media", text: "A reel needs exactly 1 video (MP4/MOV)." };
  else if (contentType === "carousel" && (media.length < 2 || media.length > 10)) return { fix: "media", text: `A carousel needs 2–10 images/videos (now ${media.length}).` };
  const used = placement === "story" ? media.slice(0, 1) : media;
  // Cloudinary set up -> the server uploads local files when you approve / publish, so they are not a problem
  if (!cloud && used.some((m) => LOCAL_URL.test(m.url))) return { fix: "public_url", text: `Your media is on localhost — ${name} can't download it.` };
  return null;
}

const QUICK = [
  { label: "Shorten", prompt: "Make the caption about 40% shorter. Keep the hook and CTA." },
  { label: "Add hook", prompt: "Rewrite the first line as a stronger scroll-stopping hook that opens with a number." },
  { label: "Translate", prompt: "Translate the caption to Hinglish (Hindi in Latin script), keep hashtags." },
  { label: "More emoji", prompt: "Add a few relevant emojis to the caption, don't overdo it." },
];

function PostPicker() {
  const { posts, online } = useWorkspace();
  const list = posts.data || [];
  return (
    <>
      <PageHeader title="Content editor" sub="Pick a draft to edit, or create a new one in the AI Content Studio.">
        <Btn variant="grad" icon="sparkles" to="/app/studio">Create with AI</Btn>
      </PageHeader>
      <Card>
        {posts.loading ? <div className="row"><Spinner /> Loading posts…</div> : list.length ? (
          <div className="sa-table-wrap">
            <table className="sa-table">
              <thead><tr><th>Post</th><th>Platform</th><th>Format</th><th>Status</th><th>Updated</th><th /></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p._id}>
                    <td><Link to={editorPath(p)} className="row"><span className="sa-thumb" style={{ width: 44, height: 44, borderRadius: 12, background: gradientFor(p._id) }} /><b className="strong">{postTitle(p)}</b></Link></td>
                    <td><span className="row"><PlatformIcon platform={p.platform || "instagram"} size={22} />{PLATFORM_META[p.platform]?.label || "Instagram"}</span></td>
                    <td><span className="row"><Icon name={TYPE_META[p.contentType]?.icon} size={16} />{typeLabel(p)}</span></td>
                    <td><Pill tone={STATUS_META[p.status]?.tone}>{STATUS_META[p.status]?.label}</Pill></td>
                    <td className="muted">{timeAgo(p.updatedAt)}</td>
                    <td><Btn size="sm" to={editorPath(p)} icon="pen">Edit</Btn></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="pen" title={online === false ? "Backend offline" : "No drafts yet"} action={<Btn variant="primary" to="/app/studio" icon="sparkles">Open AI Content Studio</Btn>}>
            {online === false ? "Start the backend to load your drafts." : "Generate your first Instagram or Facebook post — it lands here for editing."}
          </Empty>
        )}
      </Card>
    </>
  );
}

function PhonePreview({ post, content, view, media, platform = "instagram" }) {
  const name = (post.productProfile?.name || "northbeam.studio").toLowerCase().replace(/\s+/g, "");
  const first = media[0];
  const slides = content.carousel?.slides || [];
  const caption = [content.caption, (content.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
  if (platform === "facebook" && view !== "story") {
    const pageName = post.productProfile?.name || "Your Page";
    return (
      <div className="sa-phone">
        <div className="sa-phone-screen">
          <div className="sa-phone-head"><Avatar name={pageName} size={30} /><span style={{ lineHeight: 1.25 }}>{pageName}<br /><small className="muted" style={{ fontWeight: 400 }}>Just now · Public</small></span><Icon name="more" size={18} style={{ marginLeft: "auto" }} /></div>
          <div className="sa-phone-caption" style={{ paddingTop: 0 }}>{caption}</div>
          {post.contentType === "text" && content.link && <div className="small" style={{ margin: "0 14px 10px", padding: 10, border: "1px solid var(--sa-border)", borderRadius: 10, wordBreak: "break-all" }}>{content.link}</div>}
          {post.contentType !== "text" && (
            <div className={cx("sa-phone-media", post.contentType === "reel" && "reel")} style={{ background: gradientFor(post._id) }}>
              {first?.type === "image" && <img src={first.url} alt={content.altText || ""} />}
              {first?.type === "video" && <video src={first.url} muted autoPlay loop playsInline />}
              {post.contentType === "carousel" && <span className="cnt">{Math.max(slides.length, media.length, 1)} photos</span>}
              {!first && <h4>{coverText({ content }).slice(0, 60)}</h4>}
            </div>
          )}
          <div className="sa-phone-actions" style={{ justifyContent: "space-around" }}>
            <span className="row small" style={{ gap: 6 }}><Icon name="heart" size={18} />Like</span>
            <span className="row small" style={{ gap: 6 }}><Icon name="message" size={18} />Comment</span>
            <span className="row small" style={{ gap: 6 }}><Icon name="send" size={18} />Share</span>
          </div>
        </div>
      </div>
    );
  }
  if (view === "grid") {
    return (
      <div className="sa-phone"><div className="sa-phone-screen" style={{ padding: 10 }}>
        <div className="row" style={{ padding: "8px 4px 12px" }}><Avatar name={name} size={46} /><div><b>{name}</b><div className="small muted">Your grid preview</div></div></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 3 }}>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} style={{ aspectRatio: "4/5", background: i === 0 ? gradientFor(post._id) : gradientFor(`g${i}`), opacity: i === 0 ? 1 : 0.55, outline: i === 0 ? "2px solid var(--sa-primary)" : 0, borderRadius: 2 }} />
          ))}
        </div>
      </div></div>
    );
  }
  return (
    <div className="sa-phone">
      <div className="sa-phone-screen">
        {view !== "story" && <div className="sa-phone-head"><Avatar name={name} size={30} />{name}<Icon name="more" size={18} style={{ marginLeft: "auto" }} /></div>}
        <div className={cx("sa-phone-media", (post.contentType === "reel" || view === "story") && "reel")} style={{ background: gradientFor(post._id) }}>
          {first?.type === "image" && <img src={first.url} alt={content.altText || ""} />}
          {first?.type === "video" && <video src={first.url} muted autoPlay loop playsInline />}
          {post.contentType === "carousel" && <span className="cnt">1/{Math.max(slides.length, media.length, 1)}</span>}
          {!first && <h4>{coverText({ content }).slice(0, 60)}</h4>}
        </div>
        {view !== "story" && (
          <>
            <div className="sa-phone-actions"><Icon name="heart" size={21} /><Icon name="message" size={21} /><Icon name="send" size={21} /><Icon name="bookmark" size={21} style={{ marginLeft: "auto" }} /></div>
            <div className="sa-phone-caption"><b>{name}</b> {caption}</div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ContentEditor() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { posts } = useWorkspace();
  if (!id) return <PostPicker />;
  // ?platform=facebook from the link, else what the post list says, else Instagram
  const asked = params.get("platform");
  const known = (posts.data || []).find((p) => p._id === id)?.platform;
  const platform = PLATFORM_META[asked] ? asked : PLATFORM_META[known] ? known : "instagram";
  return <Editor key={`${platform}:${id}`} id={id} platform={platform} />;
}

function Editor({ id, platform }) {
  const api = postApi(platform);
  const pm = PLATFORM_META[platform];
  const MAX_TAGS = pm.maxTags;
  const tagSource = platform === "facebook" ? "facebook_page" : "instagram_api";
  const toast = useToast();
  const navigate = useNavigate();
  const { upsertPost, profile, current } = useWorkspace();
  const [post, setPost] = useState(null);
  const [content, setContent] = useState(null);
  const [media, setMedia] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [view, setView] = useState("feed");
  const [approving, setApproving] = useState(false);
  const [ask, setAsk] = useState(null); // assistant message after approve
  const [publishing, setPublishing] = useState(false);
  const [when, setWhen] = useState({ mode: "now", date: "", time: "" }); // "Publish now" | "Schedule for later" + date & time
  const [scheduling, setScheduling] = useState(false);
  const [poll, setPoll] = useState(0);
  const [mediaUrl, setMediaUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [cloud, setCloud] = useState(false); // media kept on Cloudinary (public links) -> no ngrok needed // "Generate an image of your product" (AI) — the other option is the user's own image
  const fileRef = useRef(null);
  const [tagQuery, setTagQuery] = useState("");
  const [real, setReal] = useState({ loading: false, data: null, error: "" }); // real hashtags from the Instagram API

  const load = (doc) => {
    setPost(doc);
    setContent(doc.content || {});
    setMedia(doc.media || []);
    setDirty(false);
    upsertPost(doc);
  };

  useEffect(() => {
    api.getPost(id).then((r) => load(r.data)).catch((e) => setErr(e.message));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getMediaStorage().then((r) => setCloud(!!r.data?.cloud)).catch(() => {});
  }, []);

  // scheduled post open here -> reload it just after its time, so the page shows "Published" (or why it failed)
  useEffect(() => {
    const st = post?.status;
    if (st !== "publishing" && !(st === "scheduled" && post.scheduledAt)) return;
    const ms = st === "publishing" ? 10_000 : Math.max(5_000, new Date(post.scheduledAt).getTime() - Date.now() + 40_000);
    if (ms > 2 ** 31 - 1) return; // more than ~24 days away (setTimeout limit)
    const t = setTimeout(() => {
      api.getPost(id).then((r) => {
        if (r.data.status === "publishing") setPoll((n) => n + 1);
        if (r.data.status !== st || st === "publishing") load(r.data);
      }).catch(() => {});
    }, ms);
    return () => clearTimeout(t);
  }, [post?.status, post?.scheduledAt, poll]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch) => { setContent((c) => ({ ...c, ...patch })); setDirty(true); };
  /** open the "Can I upload?" box — a scheduled post opens on "Schedule for later" with its date & time */
  const openAsk = (a, doc = post) => {
    setAsk(a);
    if (a?.askToPublish) setWhen({ mode: doc?.status === "scheduled" ? "later" : "now", ...defaultSchedule(doc?.scheduledAt) });
  };
  const placement = view === "story" ? "story" : "feed"; // where Publish will post
  const whereLabel = placement === "story" ? "Story" : "Feed";
  const locked = post && ["publishing", "published"].includes(post.status);
  const score = useMemo(() => (post ? scorePost({ ...post, content, media }) : { score: 0, checks: [] }), [post, content, media]);
  const finalLen = [content?.caption, (content?.hashtags || []).join(" ")].filter(Boolean).join("\n\n").length;

  /* ── Real hashtags: GET /api/instagram/instagram/hashtag-search?q=<brand> ── */
  const findTags = async (q = tagQuery) => {
    const query = String(q || "").trim();
    if (!query) return;
    const cached = readTagCache(query);
    setReal({ loading: true, data: cached, error: "" });
    try {
      const r = await searchHashtags(query);
      const tags = [...new Set((r.hashtags || []).map(tagKey).filter(Boolean))].map((t) => `#${t}`);
      const data = { hashtag: r.hashtag, hashtags: tags, fetchedAt: r.fetchedAt, source: r.source };
      if (tags.length) writeTagCache(query, data);
      setReal({ loading: false, data: tags.length ? data : cached, error: tags.length ? "" : r.message || `No Instagram hashtags found for "${query}". Try another word.` });
    } catch (e) {
      setReal({ loading: false, data: cached, error: e.message });
    }
  };

  // first open: reuse what the Instagram agent already found (Studio flow) -> cache -> live search.
  // Every live search spends 1 of Instagram's 30 hashtag searches / week, so don't search on every open.
  useEffect(() => {
    if (!post?._id) return;
    if (platform === "facebook") {
      // Facebook has no hashtag search -> offer the hashtags this Page already uses (from the Studio research)
      const fr = post.research;
      if (fr?.hashtags?.length) setReal({ loading: false, error: "", data: { hashtag: "", hashtags: fr.hashtags.map((h) => h.hashtag), fetchedAt: fr.fetchedAt, source: "facebook_page" } });
      return;
    }
    const ir = post.instagramResearch;
    const q0 = post.brief?.importantWords?.[0] || post.brief?.hashtagSeeds?.[0] || post.productProfile?.name || profile?.name || "";
    setTagQuery(q0);
    if (ir?.mode === "brief" && ir.hashtags?.length) {
      const seed = (ir.seeds || []).find((x) => x.found)?.hashtag || q0;
      setReal({ loading: false, error: "", data: { hashtag: tagKey(seed), hashtags: ir.hashtags.map((h) => h.hashtag), fetchedAt: ir.fetchedAt, source: "studio_research" } });
      return;
    }
    const cached = q0 ? readTagCache(q0) : null;
    if (cached?.hashtags?.length) { setReal({ loading: false, data: cached, error: "" }); return; }
    if (q0) findTags(q0);
  }, [post?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the AI wrote the hashtags (no hashtagSource yet) -> replace them with the top 6 real ones
  useEffect(() => {
    const list = real.data?.hashtags;
    if (platform !== "instagram") return; // Facebook: the AI's 0–3 hashtags stay; the user can add Page hashtags
    if (!list?.length || !content || !post || ["publishing", "published"].includes(post.status) || content.hashtagSource) return;
    set({ hashtags: list.slice(0, MAX_TAGS), hashtagSource: "instagram_api" });
    toast(`Added ${Math.min(MAX_TAGS, list.length)} real Instagram hashtags — save to keep them`, "success");
  }, [real.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (quiet) => {
    setSaving(true);
    try {
      const r = await api.updatePost(id, { content, media });
      load(r.data);
      setSavedAt(Date.now());
      if (!quiet) toast("Draft saved", "success");
      return r.data;
    } catch (e) {
      toast(e.message, "error");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const revise = async (p, contentType) => {
    if (!p?.trim()) return;
    if (dirty) { const ok = await save(true); if (!ok) return; }
    setAiBusy(true);
    try {
      const r = await api.revisePost(id, p, contentType);
      load(r.data);
      setAiPrompt("");
      toast(r.assistant?.message || "Updated", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setAiBusy(false);
    }
  };

  const approve = async (pl) => {
    const where = typeof pl === "string" ? pl : placement; // onClick passes an event
    if (dirty) { const ok = await save(true); if (!ok) return; }
    setApproving(true);
    try {
      const r = await api.approvePost(id, where);
      load(r.data);
      openAsk({ ...r.assistant, placement: r.assistant?.scheduledAt ? r.assistant.placement : where }, r.data);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setApproving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      const r = await api.publishPost(id, ask?.placement || placement);
      load(r.data);
      setAsk({ message: r.assistant?.message || "Published!", permalink: r.assistant?.permalink, done: true, placement: r.assistant?.placement });
    } catch (e) {
      // media problems come back with a fix hint -> show the same help as after Approve
      if (e.body?.fix) setAsk({ message: e.message, needsMedia: true, fix: e.body.fix, placement: ask?.placement || placement });
      else { toast(e.message, "error"); setAsk(null); }
      api.getPost(id).then((r) => load(r.data)).catch(() => {});
    } finally {
      setPublishing(false);
    }
  };

  /* "Schedule for later" -> POST …/posts/:id/schedule (again = move the date & time) */
  const schedule = async () => {
    const bad = scheduleError(when);
    if (bad) { toast(bad, "error"); return; }
    const at = fromScheduleInputs(when);
    const where = ask?.placement || placement;
    setScheduling(true);
    try {
      const r = await api.schedulePost(id, at.toISOString(), where);
      load(r.data);
      setAsk({
        scheduled: true,
        placement: where,
        message: `Scheduled! Your ${where === "story" ? "story" : typeLabel(post).toLowerCase()} goes live on your ${pm.where[where]} on ${formatSchedule(r.data.scheduledAt)} (${timeUntil(r.data.scheduledAt)}). You'll see it in the Calendar on that day — open it there any time to change the date or time.`,
      });
    } catch (e) {
      if (e.body?.fix) setAsk({ message: e.message, needsMedia: true, fix: e.body.fix, placement: where });
      else toast(e.message, "error");
    } finally {
      setScheduling(false);
    }
  };

  const unschedule = async () => {
    setScheduling(true);
    try {
      const r = await api.unschedulePost(id);
      load(r.data);
      toast("Schedule cancelled — the post is approved and waiting for you", "success");
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setScheduling(false);
    }
  };

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!pm.mimes.includes(f.type)) { toast(pm.badFile, "error"); return; }
    setUploading(true);
    try {
      const r = await api.uploadMedia(f);
      setMedia((m) => [...m, r.data].slice(0, 10));
      setDirty(true);
      if (!r.data.publicReachable && !cloud) toast(`Uploaded. Note: the file is only on your PC — add CLOUDINARY_URL to backend/.env (free) so ${pm.label} can download it.`, "default");
      else toast("Media uploaded", "success");
    } catch (er) {
      toast(er.message, "error");
    } finally {
      setUploading(false);
    }
  };

  /** AI-generated ad image (final JPEG with text + logo) -> add to the post like an upload */
  /** AI images from ImageGenerator: carousel -> add every picked image (in the picked order); image post -> the ONE picked image replaces the media */
  const addGenerated = (picked) => {
    const list = (Array.isArray(picked) ? picked : [picked]).filter((m) => m?.url);
    if (!list.length) return;
    const items = list.map((m) => ({ type: "image", url: m.url, mimeType: m.mimeType || "image/jpeg", source: m.source || "upload" }));
    const carousel = post.contentType === "carousel";
    setMedia((cur) => (carousel ? [...cur, ...items].slice(0, 10) : items.slice(0, 1)));
    setDirty(true);
    const local = list.some((m) => m.publicReachable === false) && !cloud;
    const what = carousel ? `${items.length} AI image${items.length === 1 ? "" : "s"} added` : "AI image added";
    toast(local ? `${what}. Save the draft. Note: the file is only on your PC — add CLOUDINARY_URL to backend/.env (free) so ${pm.label} can download it.` : `${what} — save the draft to keep ${items.length === 1 ? "it" : "them"}`, "success");
  };

  const addUrl = () => {
    const u = mediaUrl.trim();
    if (!/^https?:\/\//.test(u)) return;
    setMedia((m) => [...m, { type: /\.(mp4|mov)(\?|$)/i.test(u) ? "video" : "image", url: u, source: "url" }].slice(0, 10));
    setMediaUrl("");
    setDirty(true);
  };

  if (err) return <Card><Empty icon="alert" title="Couldn't open this post" action={<Btn to="/app/editor">Back to drafts</Btn>}>{err}</Empty></Card>;
  if (!post) return <div className="row"><Spinner /> Loading post…</div>;

  const st = STATUS_META[post.status];
  const pub = publishInfo(post); // post.instagram | post.facebook
  const chosen = content.hashtags || [];
  const chosenKeys = new Set(chosen.map(tagKey));
  const tagsFull = chosen.length >= MAX_TAGS;
  const toggleTag = (t) => {
    if (chosenKeys.has(tagKey(t))) set({ hashtags: chosen.filter((x) => tagKey(x) !== tagKey(t)), hashtagSource: tagSource });
    else if (tagsFull) toast(`Max ${MAX_TAGS} hashtags — remove one first`, "error");
    else set({ hashtags: [...chosen, t], hashtagSource: tagSource });
  };
  const slides = content.carousel?.slides || [];
  const scenes = content.reel?.scenes || [];
  const blocker = locked ? null : publishBlocker(platform, post.contentType, placement, media, cloud);
  const tip = content.engagementTips?.[0];
  const brief = post.brief;
  // Studio is done (prompt -> JSON -> research -> ready to post); here: Review -> Approve -> Publish
  const stepNow = { draft: 2, approved: 3, scheduled: 4, publishing: 4, failed: 4, published: 5 }[post.status] ?? 2;
  const FLOW = [
    { label: "Prompt → JSON", sub: brief ? "From Studio" : "Classic draft" },
    { label: "Research", sub: platform === "facebook" ? (post.research?.mediaAnalyzed ? `${post.research.mediaAnalyzed} Page posts read` : "Facebook") : post.instagramResearch?.mode === "brief" ? `${post.instagramResearch.hashtags?.length || 0} live hashtags` : "Instagram" },
    { label: "Review", sub: dirty ? "Unsaved changes" : media.length || post.contentType === "text" ? "Edit or ask AI" : "Add photo / video" },
    { label: "Approve", sub: post.status === "approved" || post.status === "scheduled" ? "Approved" : "You confirm" },
    { label: "Publish", sub: post.status === "published" ? (pub.placement === "story" ? "Live on Story" : "Live on Feed") : post.status === "failed" ? "Failed — retry" : post.status === "scheduled" ? `Scheduled · ${formatSchedule(post.scheduledAt)}` : `Now or scheduled · ${whereLabel}` },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Content", to: "/app/editor" }, { label: postTitle(post).slice(0, 40), to: undefined }, { label: `${pm.label} · ${typeLabel(post)}` }]}
        title={<>Edit post <Pill tone={st.tone} icon={st.icon}>{st.label}</Pill></>}>
        {post.performanceLearnings?.summary && (
          <span className="small green row" style={{ gap: 6, fontWeight: 500, color: "var(--sa-emerald, #059669)" }}>
            <Icon name="check" size={14} /> {post.performanceLearnings.summary}
          </span>
        )}
        <span className="small muted row" style={{ gap: 6 }}>
          {saving ? <><Spinner size={14} /> Saving…</> : dirty ? <><Icon name="pen" size={15} /> Unsaved changes</> : <><Icon name="checkCircle" size={15} className="green" /> Saved {timeAgo(savedAt || post.updatedAt)}</>}
        </span>
        <Btn onClick={() => save()} disabled={!dirty || locked} loading={saving}>Save draft</Btn>
        <Btn icon="send" onClick={approve} loading={approving} disabled={locked}>{post.status === "approved" || post.status === "scheduled" ? "Approved" : "Approve"}</Btn>
        <Btn variant="primary" icon={post.status === "scheduled" ? "calendar" : "upload"} disabled={locked && post.status !== "failed"} onClick={() => (post.status === "scheduled"
          ? openAsk({ message: `Scheduled for ${formatSchedule(post.scheduledAt)}. Keep it, pick a new date & time, or upload it now.`, askToPublish: true, placement: post.scheduledPlacement || placement })
          : post.status === "approved" || post.status === "failed"
            ? openAsk({ message: placement === "story" ? `Can I upload this to your ${pm.where.story} now — or schedule it for later?` : `Can I post this ${typeLabel(post).toLowerCase()} to your ${pm.where.feed} now — or schedule it for later?`, askToPublish: true, placement })
            : approve())}>
          {post.status === "published" ? (pub.placement === "story" ? "Posted to Story" : "Published") : post.status === "scheduled" ? "Scheduled" : `Publish to ${whereLabel}`}
        </Btn>
      </PageHeader>

      <FlowSteps steps={FLOW} current={stepNow} reached={1} onStep={(i) => i < 2 && navigate("/app/studio")} />

      {post.status === "published" && (
        <div className="sa-banner" style={{ marginBottom: 22 }}>
          <span className="sa-banner-ic"><Icon name="checkCircle" size={22} /></span>
          <div className="sa-banner-body">
            <h4>{pub.placement === "story" ? `Live on your ${pm.where.story}` : `Live on ${pm.where.feed}`}</h4>
            <p>Published {timeAgo(pub.publishedAt)}.{pub.placement === "story" ? " Stories disappear after 24 hours." : ""}{pub.processing ? " Facebook was still processing the reel — it goes live by itself." : ""}</p>
          </div>
          {pub.permalink && <Btn onClick={() => window.open(pub.permalink, "_blank", "noopener")} icon="arrowUpRight">View</Btn>}
        </div>
      )}
      {post.status === "scheduled" && post.scheduledAt && (
        <div className="sa-banner" style={{ marginBottom: 22 }}>
          <span className="sa-banner-ic"><Icon name="calendar" size={22} /></span>
          <div className="sa-banner-body">
            <h4>Scheduled for {formatSchedule(post.scheduledAt)}</h4>
            <p>Goes live on your <b>{pm.where[post.scheduledPlacement || "feed"]}</b> by itself {timeUntil(post.scheduledAt)}. Keep the Sociva backend running at that time. You can also change it from the Calendar.</p>
          </div>
          <div className="sa-banner-actions">
            <Btn variant="ghost" onClick={unschedule} loading={scheduling}>Cancel schedule</Btn>
            <Btn icon="calendar" onClick={() => openAsk({ message: `Scheduled for ${formatSchedule(post.scheduledAt)}. Pick a new date & time — or upload it now.`, askToPublish: true, placement: post.scheduledPlacement || "feed" })}>Change date & time</Btn>
          </div>
        </div>
      )}
      {post.status === "draft" && hasUpcomingSchedule(post) && (
        <div className="sa-banner tone-amber" style={{ marginBottom: 22 }}>
          <span className="sa-banner-ic"><Icon name="calendar" size={22} /></span>
          <div className="sa-banner-body">
            <h4>Planned for {formatSchedule(post.scheduledAt)} — approve again to keep it</h4>
            <p>The post changed after it was scheduled, so it won't go out until you approve it again. Approving puts it back on the schedule.</p>
          </div>
        </div>
      )}
      {post.status === "failed" && pub.error && (
        <div className="sa-banner tone-red" style={{ marginBottom: 22 }}>
          <span className="sa-banner-ic"><Icon name="alert" size={22} /></span>
          <div className="sa-banner-body"><h4>Publishing failed</h4><p>{pub.error}</p></div>
        </div>
      )}

      <div className="sa-grid g-main-r">
        <Card pad={false}>
          <div className="row between" style={{ padding: "16px 22px", borderBottom: "1px solid var(--sa-border)", flexWrap: "wrap" }}>
            <div className="row wrap">
              {Object.entries(PLATFORM_META).map(([k, m]) => (
                <span key={k} className={cx("sa-chip", k === platform && "on")} style={k === platform ? undefined : { opacity: 0.5 }}
                  title={k === platform ? `This post is for ${m.label}` : `Each post is written for one platform — make a ${m.label} version in the AI Studio`}>
                  <PlatformIcon platform={k} size={20} /> {m.label}
                </span>
              ))}
              <span className="sa-chip" style={{ opacity: 0.5 }} title="Coming soon"><PlatformIcon platform="linkedin" size={20} /> LinkedIn</span>
              <span className="sa-chip" style={{ opacity: 0.5 }} title="Coming soon"><PlatformIcon platform="x" size={20} /> X</span>
            </div>
            <div className="row small muted">Format
              <select className="sa-select" style={{ height: 38, width: 170 }} value={post.contentType} disabled={locked || aiBusy}
                onChange={(e) => revise(`Convert this post into a ${e.target.value}. Keep the message.`, e.target.value)}>
                {pm.types.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ padding: 22 }}>
            {/* Media (Facebook text posts: optional link instead) */}
            {post.contentType === "text" ? (
              <Field label="Link (optional)" hint="Facebook shows a preview card for it. Text posts have no photo — switch the format above to add one.">
                <input className="sa-input" value={content.link || ""} disabled={locked} onChange={(e) => set({ link: e.target.value.trim() })} placeholder="https://your-website.com/product" />
              </Field>
            ) : (<>
            <div className="sa-field-label" style={{ marginBottom: 10 }}>Media · {media.length} file{media.length === 1 ? "" : "s"}{post.contentType === "carousel" && slides.length ? ` · ${slides.length} slides planned` : ""}</div>
            <div className="row" style={{ gap: 12, overflowX: "auto", paddingBottom: 4 }}>
              {media.map((m, i) => (
                <div key={m.url + i} className="sa-cover" style={{ width: 150, flexShrink: 0, aspectRatio: "1", background: "#111", padding: 10 }}>
                  {m.type === "image" ? <img src={m.url} alt="" /> : <video src={m.url} muted />}
                  {!locked && <button type="button" onClick={() => { setMedia(media.filter((_, j) => j !== i)); setDirty(true); }} aria-label="Remove media"
                    style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 8, width: 26, height: 26, display: "grid", placeItems: "center" }}><Icon name="x" size={14} /></button>}
                  <small style={{ position: "relative" }}>{m.type}</small>
                </div>
              ))}
              {!media.length && (post.contentType === "carousel" ? slides : [{ headline: content.visual?.onImageText || content.hook }]).slice(0, 4).map((s, i) => (
                <div key={i} className="sa-cover" style={{ width: 160, flexShrink: 0, aspectRatio: "1", background: gradientFor(post._id + i), outline: i === 0 ? "3px solid var(--sa-primary)" : 0, outlineOffset: 2 }}>
                  <h4 style={{ fontSize: 14 }}>{s.headline}</h4>
                </div>
              ))}
              {!locked && (
                <button type="button" onClick={() => fileRef.current?.click()} className="sa-cover"
                  style={{ width: 160, flexShrink: 0, aspectRatio: "1", border: "1.5px dashed #c9bffc", background: "#faf9ff", color: "var(--sa-primary)", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 600 }}>
                  {uploading ? <Spinner /> : <Icon name="imagePlus" size={26} />}<span style={{ marginTop: 8 }}>{uploading ? "Uploading…" : pm.mediaHint}</span>
                </button>
              )}
              {!locked && post.contentType !== "reel" && (
                <button type="button" onClick={() => setGenOpen(true)} className="sa-cover" title="Generate a realistic ad photo of your product with AI"
                  style={{ width: 160, flexShrink: 0, aspectRatio: "1", border: "1.5px dashed #c9bffc", background: "linear-gradient(135deg,#f5f3ff,#fdf2fb)", color: "var(--sa-primary)", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 600 }}>
                  <Icon name="wand" size={26} /><span style={{ marginTop: 8 }}>Generate with AI</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept={pm.accept} hidden onChange={onFile} />
            </div>
            {!locked && (
              <div className="row mt-s">
                <input id="media-url" className="sa-input" style={{ height: 40 }} placeholder="…or paste a public image/video URL" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
                <Btn size="sm" onClick={addUrl} disabled={!mediaUrl.trim()}>Add URL</Btn>
              </div>
            )}
            {content.visual?.brief && <p className="small muted mt-s" style={{ marginBottom: 0 }}><b className="strong">Visual brief:</b> {content.visual.brief} {content.visual.style && `· ${content.visual.style}`} · {content.visual.aspectRatio}</p>}
            </>)}

            {/* Caption */}
            <div className="sa-field-label mt" style={{ marginBottom: 10 }}>Caption</div>
            <div style={{ border: "1px solid var(--sa-border)", borderRadius: 16, overflow: "hidden" }}>
              <div className="row wrap" style={{ padding: "8px 12px", borderBottom: "1px solid var(--sa-border)", gap: 4 }}>
                {["bold", "italic", "smile", "at", "hash"].map((i) => <IconBtn key={i} icon={i} label={i} style={{ width: 34, height: 34, border: 0 }} disabled />)}
                <span style={{ width: 1, height: 22, background: "var(--sa-border)", margin: "0 6px" }} />
                <Btn size="sm" variant="soft" icon="sparkles" onClick={() => document.getElementById("ai-ask")?.focus()} disabled={locked}>Rewrite</Btn>
                {QUICK.map((q) => <Btn key={q.label} size="sm" variant="ghost" onClick={() => revise(q.prompt)} disabled={locked || aiBusy}>{q.label}</Btn>)}
                <span className={cx("small", finalLen > pm.captionLimit ? "red" : "muted")} style={{ marginLeft: "auto" }}>{finalLen} / {pm.captionLimit}</span>
              </div>
              <div style={{ padding: 16 }}>
                <input className="sa-input" style={{ border: 0, padding: 0, height: 32, fontWeight: 700, fontSize: 16 }} value={content.hook || ""} disabled={locked} onChange={(e) => set({ hook: e.target.value })} placeholder="Hook (first line)" aria-label="Hook" />
                <textarea className="sa-textarea" style={{ border: 0, padding: 0, minHeight: 170, boxShadow: "none", fontSize: 15.5 }} value={content.caption || ""} disabled={locked} onChange={(e) => set({ caption: e.target.value })} aria-label="Caption" />
                {tip && !locked && (
                  <div className="sa-banner tone-amber" style={{ padding: "12px 16px", gap: 12 }}>
                    <Icon name="bulb" className="faint" style={{ color: "#f59e0b" }} />
                    <span className="grow small"><b className="strong">AI suggestion:</b> {tip}</span>
                    <button type="button" className="sa-link" style={{ color: "#d97706" }} onClick={() => revise(`Apply this suggestion: ${tip}`)}>Apply</button>
                  </div>
                )}
              </div>
            </div>

            {/* AI revise */}
            {!locked && (
              <div className="row mt" style={{ background: "var(--sa-grad-soft)", borderRadius: 16, padding: 10, border: "1px solid #ebe6fb" }}>
                <span className="sa-ic tone-grad"><Icon name="sparkles" size={18} /></span>
                <input id="ai-ask" className="sa-input" style={{ height: 44, background: "#fff" }} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} disabled={aiBusy}
                  onKeyDown={(e) => e.key === "Enter" && revise(aiPrompt)} placeholder="Tell the AI what to change… e.g. “make it more playful and mention the free trial”" />
                <Btn variant="primary" icon="send" loading={aiBusy} onClick={() => revise(aiPrompt)} disabled={!aiPrompt.trim()}>Ask AI</Btn>
              </div>
            )}

            {/* Hashtags — Instagram: real hashtag search (up to 6) · Facebook: hashtags your Page already uses (0–3 work best) */}
            <div className="mt">
              <div className="row between wrap" style={{ marginBottom: 10 }}>
                <span className="sa-field-label" style={{ margin: 0 }}>Hashtags · {chosen.length}/{MAX_TAGS} selected</span>
                {real.data?.hashtags?.length > 0 && <LiveTag>{platform === "facebook" ? "From your Facebook Page" : "Real Instagram data"}</LiveTag>}
              </div>
              {locked ? (
                <div className="sa-tagrow">{chosen.map((t) => <span key={t} className="sa-igtag on">{t}</span>)}</div>
              ) : (
                <ChipInput values={chosen} prefix="#"
                  onChange={(v) => set({ hashtags: [...new Set(v.map(tagKey).filter(Boolean))].map((t) => `#${t}`).slice(0, MAX_TAGS), hashtagSource: content.hashtagSource || "user" })}
                  placeholder={tagsFull ? "Remove one to add another" : "Add your own hashtag"} />
              )}
              {!chosen.length && !locked && pm.minTags > 0 && <p className="small red" style={{ margin: "6px 0 0" }}>Select at least 1 hashtag — the post can't be saved without one.</p>}

              {!locked && !pm.liveHashtagSearch && (
                <div style={{ border: "1px solid var(--sa-border)", borderRadius: 16, padding: 14, marginTop: 12 }}>
                  <p className="small muted" style={{ margin: 0 }}>Facebook has no public hashtag search, and posts there need few hashtags — 0–3 work best.{real.data?.hashtags?.length ? " These are the hashtags your Page already uses (real data). Click to add / remove:" : " Your Page's posts don't use hashtags yet — type your own above if you want any."}</p>
                  {real.data?.hashtags?.length > 0 && (
                    <div className="sa-tagrow" style={{ marginTop: 10 }}>
                      {real.data.hashtags.map((t) => {
                        const on = chosenKeys.has(tagKey(t));
                        return <button key={t} type="button" className={cx("sa-igtag", on && "on")} onClick={() => toggleTag(t)} aria-pressed={on}>{on ? "✓ " : "+ "}{t}</button>;
                      })}
                    </div>
                  )}
                </div>
              )}

              {!locked && pm.liveHashtagSearch && (
                <div style={{ border: "1px solid var(--sa-border)", borderRadius: 16, padding: 14, marginTop: 12 }}>
                  <div className="row">
                    <Icon name="hash" size={18} style={{ color: "var(--sa-primary)", flexShrink: 0 }} />
                    <input className="sa-input" style={{ height: 40 }} value={tagQuery} onChange={(e) => setTagQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && findTags()} placeholder="Brand or keyword, e.g. snitch brand" aria-label="Search real hashtags" />
                    <Btn size="sm" icon="search" loading={real.loading} onClick={() => findTags()} disabled={!tagQuery.trim()}>Find hashtags</Btn>
                  </div>
                  {real.error && <p className="small red" style={{ margin: "8px 0 0" }}>{real.error}</p>}
                  {real.data?.hashtags?.length > 0 ? (
                    <>
                      <p className="small muted" style={{ margin: "10px 0 8px" }}>
                        {real.data.hashtags.length} hashtags used with <b className="strong">#{real.data.hashtag}</b> on Instagram{real.data.fetchedAt ? ` · ${timeAgo(real.data.fetchedAt)}` : ""}. Click to select / remove (max {MAX_TAGS}).
                      </p>
                      <div className="sa-tagrow">
                        {real.data.hashtags.map((t) => {
                          const on = chosenKeys.has(tagKey(t));
                          return (
                            <button key={t} type="button" className={cx("sa-igtag", on && "on")} onClick={() => toggleTag(t)}
                              disabled={!on && tagsFull} style={!on && tagsFull ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                              aria-pressed={on}>{on ? "✓ " : "+ "}{t}</button>
                          );
                        })}
                      </div>
                    </>
                  ) : !real.loading && !real.error && <p className="small muted" style={{ margin: "8px 0 0" }}>Search your brand or product to load real hashtags from Instagram.</p>}
                  {real.loading && !real.data && <div className="row mt-s small muted"><Spinner size={14} /> Loading real hashtags…</div>}
                </div>
              )}
            </div>

            <div className="sa-grid g-2 mt">
              <Field label="Call to action"><input className="sa-input" value={content.callToAction || ""} disabled={locked} onChange={(e) => set({ callToAction: e.target.value })} /></Field>
              <Field label="Alt text" hint="Describes the image for screen readers"><input className="sa-input" value={content.altText || ""} disabled={locked} onChange={(e) => set({ altText: e.target.value })} placeholder="e.g. Purple slide reading “Client reports in 1 click”" /></Field>
            </div>

            {post.contentType === "carousel" && (
              <div className="mt">
                <div className="sa-field-label" style={{ marginBottom: 10 }}>Slides</div>
                <div className="sa-list">
                  {slides.map((s, i) => (
                    <div key={i} className="sa-li" style={{ alignItems: "flex-start" }}>
                      <span className="sa-ic tone-violet" style={{ fontWeight: 700 }}>{i + 1}</span>
                      <div className="grow" style={{ display: "grid", gap: 6 }}>
                        <input className="sa-input" style={{ height: 40, fontWeight: 600 }} value={s.headline} disabled={locked}
                          onChange={(e) => set({ carousel: { slides: slides.map((x, j) => (j === i ? { ...x, headline: e.target.value } : x)) } })} />
                        <textarea className="sa-textarea" style={{ minHeight: 60 }} value={s.body} disabled={locked}
                          onChange={(e) => set({ carousel: { slides: slides.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)) } })} />
                        {s.visual && <small className="muted">Visual: {s.visual}</small>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {post.contentType === "reel" && (
              <div className="mt">
                <div className="sa-field-label" style={{ marginBottom: 10 }}>Reel script · {content.reel?.durationSec}s {content.reel?.audioSuggestion && <span className="muted small">♪ {content.reel.audioSuggestion}</span>}</div>
                <div className="sa-table-wrap">
                  <table className="sa-table">
                    <thead><tr><th>Time</th><th>Visual</th><th>On-screen text</th><th>Voiceover</th></tr></thead>
                    <tbody>
                      {scenes.map((s, i) => (
                        <tr key={i}><td className="num">{s.start}–{s.end}s</td><td>{s.visual}</td><td><b>{s.onScreenText}</b></td><td className="muted">{s.voiceover}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {blocker && (
            <div className="sa-banner tone-amber" style={{ padding: "14px 16px", gap: 12, alignItems: "flex-start" }}>
              <Icon name="alert" size={20} style={{ color: "#d97706", flexShrink: 0, marginTop: 2 }} />
              <div className="grow small">
                <b className="strong">Before you can publish:</b> {blocker.text}
                {blocker.fix === "public_url" && <PublicUrlHelp />}
              </div>
            </div>
          )}
          <Card title="Preview" action={<Segmented value={view} onChange={setView} options={[{ value: "feed", label: "Feed" }, { value: "story", label: "Story" }, ...(pm.grid ? [{ value: "grid", label: "Grid" }] : [])]} />} style={{ background: "#f3f3f8" }}>
            <PhonePreview post={post} content={content} view={view} media={media} platform={platform} />
            <div className={cx("sa-banner mt", placement === "story" ? "tone-amber" : "")} style={{ padding: "10px 14px", gap: 10 }}>
              <Icon name={placement === "story" ? "clock" : "grid"} size={18} />
              <span className="small grow">
                Publish goes to your <b className="strong">{pm.where[placement]}</b>.
                {placement === "story" ? " Only the first image/video is posted (24 h) — Stories don't show the caption or hashtags." : " Pick “Story” above to post it as a Story instead."}
              </span>
            </div>
          </Card>
          <Card>
            <div className="row" style={{ marginBottom: 14 }}>
              <ScoreRing value={score.score} size={74} stroke={7} />
              <div><h3 style={{ fontSize: 19 }}>Post score: {score.score >= 85 ? "Excellent" : score.score >= 70 ? "Good" : "Needs work"}</h3><span className="small muted">Predicted reach {predictReach(score.score)}</span></div>
            </div>
            {score.checks.map((c) => (
              <div key={c.text} className="row" style={{ padding: "8px 0" }}>
                <Icon name={c.ok ? "checkCircle" : "info"} size={19} style={{ color: c.ok ? "var(--sa-green)" : "var(--sa-amber)" }} />
                <span className="grow">{c.text}</span>
                {!c.ok && c.fix === "altText" && !locked && <button type="button" className="sa-link" onClick={() => set({ altText: content.visual?.brief?.slice(0, 120) || coverText(post) })}>Fix</button>}
                {!c.ok && c.fix === "media" && !locked && <button type="button" className="sa-link" onClick={() => fileRef.current?.click()}>Add</button>}
              </div>
            ))}
            <hr className="sa-hr" style={{ margin: "14px 0" }} />
            <div className="row between"><span className="row"><Icon name="calendar" size={18} className="faint" /> Best time: <b className="strong">Today, 7:15 PM</b></span><Pill tone="green">+2.3× reach</Pill></div>
          </Card>
          {brief && (
            <Card title="From your prompt" sub={`The JSON the ${pm.label} researcher worked from`} action={<Btn size="sm" variant="ghost" to="/app/studio">Studio</Btn>}>
              {brief.optimizedPrompt && <p className="sa-quote hl" style={{ marginTop: 0 }}>{brief.optimizedPrompt}</p>}
              {brief.importantWords?.length > 0 && <div className="sa-words mt-s">{brief.importantWords.map((w) => <span key={w}>{w}</span>)}</div>}
              {[["Audience", brief.audience], ["Goal", brief.goal], ["CTA", brief.cta]].filter(([, v]) => v).map(([k, v]) => (
                <p key={k} style={{ margin: "10px 0 0", lineHeight: 1.55 }}><b className="strong">{k}:</b> <span className="muted">{v}</span></p>
              ))}
            </Card>
          )}
          {platform === "facebook" && post.research?.topPosts?.length > 0 && (
            <Card title="What works on your Page" sub={`Real data from your last ${post.research.mediaAnalyzed} Facebook posts`}>
              <div className="sa-list">
                {post.research.topPosts.slice(0, 3).map((t, i) => (
                  <a key={i} className="sa-li" href={t.permalink || undefined} target="_blank" rel="noreferrer">
                    <span className="sa-ic tone-blue" style={{ fontWeight: 700 }}>{i + 1}</span>
                    <span className="grow"><b className="ellipsis" style={{ fontSize: 14 }}>{t.hook || "(no text)"}</b><small>{t.format} · {t.engagement} reactions + comments + shares</small></span>
                  </a>
                ))}
              </div>
            </Card>
          )}
          {(content.whyThisWorks || content.objective) && (
            <Card title="Why this works">
              {content.objective && <p className="muted" style={{ marginTop: 0 }}><b className="strong">Objective:</b> {content.objective}</p>}
              <p style={{ margin: 0, lineHeight: 1.6 }}>{content.whyThisWorks}</p>
            </Card>
          )}
          <Card title="History" sub={`${post.revisions?.length || 0} revisions`}>
            <div className="sa-list">
              {[...(post.revisions || [])].reverse().slice(0, 6).map((r, i) => (
                <div key={i} className="sa-li">
                  <span className={`sa-ic tone-${r.by === "ai" ? "violet" : "blue"}`}><Icon name={r.by === "ai" ? "sparkles" : "pen"} size={16} /></span>
                  <span className="grow"><b className="ellipsis" style={{ fontSize: 14 }}>{r.prompt}</b><small>{r.by === "ai" ? "AI" : "You"} · {timeAgo(r.at)}</small></span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ImageGenerator open={genOpen} onClose={() => setGenOpen(false)} post={post} platform={platform}
        productId={post.productId || current?._id} productName={post.productProfile?.name || profile?.name} contentType={post.contentType} onUse={addGenerated} />

      <Modal open={!!ask} onClose={() => !publishing && !scheduling && setAsk(null)} title={ask?.done ? "Published 🎉" : ask?.scheduled ? "Post scheduled" : "Sociva Autopilot"}
        footer={ask?.done ? <><Btn onClick={() => navigate("/app/pipeline")}>Pipeline</Btn>{ask.permalink && <Btn variant="primary" icon="arrowUpRight" onClick={() => window.open(ask.permalink, "_blank", "noopener")}>View on {pm.label}</Btn>}</>
          : ask?.scheduled ? <><Btn icon="calendar" onClick={() => navigate("/app/calendar")}>Open calendar</Btn><Btn variant="primary" onClick={() => setAsk(null)}>Done</Btn></>
          : ask?.needsMedia ? (ask.fix === "public_url"
            ? <><Btn onClick={() => { setAsk(null); setTimeout(() => document.getElementById("media-url")?.focus(), 50); }}>Paste a public URL</Btn><Btn variant="primary" onClick={() => setAsk(null)}>Got it</Btn></>
            : <><Btn onClick={() => setAsk(null)}>Later</Btn>
              {ask.canStory && <Btn icon="clock" onClick={() => { setView("story"); approve("story"); }}>Post as Story instead</Btn>}
              <Btn variant="primary" icon="imagePlus" onClick={() => { setAsk(null); fileRef.current?.click(); }}>Add media</Btn></>)
            : ask?.askToPublish && when.mode === "later"
              ? <><Btn onClick={() => setAsk(null)} disabled={scheduling}>Not now</Btn><Btn variant="primary" icon="calendar" loading={scheduling} disabled={!!scheduleError(when)} onClick={schedule}>{post.status === "scheduled" ? "Save schedule" : "Schedule post"}</Btn></>
              : <><Btn onClick={() => setAsk(null)} disabled={publishing}>Not now</Btn><Btn variant="primary" icon="upload" loading={publishing} onClick={publish}>{post.status === "scheduled" ? "Upload now instead" : "Yes, upload"}</Btn></>}>
        <div className="row" style={{ alignItems: "flex-start", gap: 14 }}>
          <span className="sa-ic lg tone-grad"><Icon name={ask?.done ? "checkCircle" : ask?.scheduled ? "calendar" : ask?.needsMedia ? "image" : "bot"} size={22} /></span>
          <p style={{ margin: 0, lineHeight: 1.6, fontSize: 15.5 }}>{ask?.message}</p>
        </div>
        {ask?.askToPublish && (
          <div className="mt" style={{ border: "1px solid var(--sa-border)", borderRadius: 16, padding: 14, display: "grid", gap: 14 }}>
            <Segmented value={when.mode} onChange={(mode) => setWhen((w) => ({ ...w, mode }))}
              options={[{ value: "now", label: "Publish now", icon: "upload" }, { value: "later", label: "Schedule for later", icon: "calendar" }]} />
            {when.mode === "later" && <ScheduleFields value={when} onChange={(v) => setWhen((w) => ({ ...w, ...v }))} disabled={scheduling} />}
          </div>
        )}
        {ask?.needsMedia && ask.fix === "public_url" && <PublicUrlHelp />}
        {ask?.askToPublish && <p className="small muted" style={{ marginBottom: 0 }}>
          {ask.placement === "story" ? "Posts the first image/video to your Story for 24 hours (no caption). " : ""}This posts to the {platform === "facebook" ? "Facebook Page" : "Instagram account"} connected in <span className="sa-code">backend/.env</span>.{" "}
          {when.mode === "later" ? "At the time you pick, Sociva publishes it by itself — keep the backend running then. The post shows in the Calendar on that day." : "Nothing is published until you say yes."}
        </p>}
      </Modal>
    </>
  );
}

/** Instagram / Facebook download the media themselves, so it must be on a public https link */
function PublicUrlHelp() {
  return (
    <div className="small" style={{ marginTop: 10, lineHeight: 1.7 }}>
      <b className="strong">Best fix (free, also works after you deploy to Render):</b>
      <ol style={{ margin: "4px 0 8px", paddingLeft: 18 }}>
        <li>Create a free account at <span className="sa-code">cloudinary.com</span> and copy the <b>API environment variable</b> from its dashboard.</li>
        <li>In <span className="sa-code">backend/.env</span> add <span className="sa-code">CLOUDINARY_URL=cloudinary://…</span></li>
        <li>Restart the backend and click Approve / Publish again — files already on your PC are uploaded automatically.</li>
      </ol>
      <span className="muted">Or: run <span className="sa-code">ngrok http 5000</span> and set <span className="sa-code">PUBLIC_BASE_URL</span> to its https link, or paste a public image/video link under Media.</span>
    </div>
  );
}
