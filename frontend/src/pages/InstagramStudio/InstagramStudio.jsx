// ─────────────────────────────────────────────────────────────
// InstagramStudio.jsx — Step after the Instagram Research Agent (instargramAgent)
// 1. Research   -> hashtags, keywords, audience (POST /api/instagram/instargramAgent/research)
// 2. Pick format like Instagram's "+" menu: Post (image) · Reel · Carousel
// 3. AI writes it -> user reviews in an Instagram-style preview
// 4. User edits by hand OR asks the AI to change it with a prompt (repeat as needed)
// 5. Approve -> AI asks "Can I upload this to Instagram?" -> Yes -> published
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getProduct } from "../../api/productApi";
import {
  approvePost,
  generatePost,
  listPosts,
  publishPost,
  revisePost,
  runInstagramResearch,
  updatePost,
  uploadMedia,
} from "../../api/instagramApi";
import * as I from "../ProductBrain/icons";
import "../ProductBrain/ProductBrain.css";
import "./InstagramStudio.css";

const PRODUCT_KEY = "sociva.currentProductId";
const researchKey = (id) => `sociva.igResearch.${id}`;
const MAX_TAGS = 5;
const CAPTION_LIMIT = 2200;

const FORMATS = [
  { key: "image", label: "Post", sub: "Single image + caption", ratio: "4:5" },
  { key: "reel", label: "Reel", sub: "Vertical video + caption", ratio: "9:16" },
  { key: "carousel", label: "Carousel", sub: "2–10 slides + caption", ratio: "4:5" },
];

const QUICK_EDITS = [
  "Make the hook stronger",
  "Shorter caption",
  "More fun and casual",
  "Write it in Hinglish",
  "Focus on gifting",
  "Add a question to get comments",
];

const STATUS_LABEL = { draft: "Draft", approved: "Approved", publishing: "Uploading…", published: "Published", failed: "Upload failed" };

/* small extra icons (Instagram UI) */
const svg = (size) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true });
const Heart = ({ s = 22 }) => <svg {...svg(s)}><path d="M12 20s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 5c-2.2 4.6-9.2 9-9.2 9z" /></svg>;
const Bubble = ({ s = 22 }) => <svg {...svg(s)}><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z" /></svg>;
const Send = ({ s = 22 }) => <svg {...svg(s)}><path d="M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z" /></svg>;
const Bookmark = ({ s = 22 }) => <svg {...svg(s)}><path d="M6 3h12v18l-6-4.5L6 21V3z" /></svg>;
const ImageIc = ({ s = 22 }) => <svg {...svg(s)}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="M21 16l-5-5L5 21" /></svg>;
const ReelIc = ({ s = 22 }) => <svg {...svg(s)}><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M3 8h18M8 3l3 5M14 3l3 5M10 12.5v5l4.5-2.5-4.5-2.5z" /></svg>;
const LayersIc = ({ s = 22 }) => <svg {...svg(s)}><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M4 16V6a2 2 0 0 1 2-2h10" /></svg>;
const UploadIc = ({ s = 18 }) => <svg {...svg(s)}><path d="M12 16V4M7 9l5-5 5 5M4 20h16" /></svg>;
const Music = ({ s = 14 }) => <svg {...svg(s)}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>;
const FORMAT_ICON = { image: ImageIc, reel: ReelIc, carousel: LayersIc };

const handleOf = (name = "") => (name.toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand").slice(0, 24);
const toTag = (t) => "#" + String(t).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]+/gu, "");
const finalCaptionOf = (c) => [c?.caption?.trim(), (c?.hashtags || []).join(" ")].filter(Boolean).join("\n\n");
const guessType = (url) => (/\.(mp4|mov|m4v)(\?|$)/i.test(url) ? "video" : "image");
const readStore = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked */ } };

/* ───────────── Instagram-style preview ───────────── */

function CaptionText({ text }) {
  return text.split(/(#[\p{L}\p{N}_]+)/gu).map((part, i) =>
    part.startsWith("#") ? <span key={i} className="ig-tag">{part}</span> : <span key={i}>{part}</span>
  );
}

function IgPreview({ type, content, media, name }) {
  const [slide, setSlide] = useState(0);
  const [more, setMore] = useState(false);
  const handle = handleOf(name);
  const caption = finalCaptionOf(content);
  const slides = content?.carousel?.slides || [];
  const total = type === "carousel" ? Math.max(media.length, slides.length, 1) : 1;
  const idx = Math.min(slide, total - 1);
  const m = type === "carousel" ? media[idx] : media[0];

  useEffect(() => setSlide(0), [type]);

  const placeholder = () => {
    if (type === "reel") return <><span className="ig-ph-big">{content?.reel?.coverText || content?.hook}</span><span className="ig-ph-play">▶</span></>;
    if (type === "carousel") {
      const s = slides[idx] || {};
      return <><span className="ig-ph-big">{s.headline}</span><span className="ig-ph-small">{s.body}</span></>;
    }
    return <span className="ig-ph-big">{content?.visual?.onImageText || content?.hook}</span>;
  };

  const mediaEl = m ? (
    m.type === "video"
      ? <video src={m.url} muted loop autoPlay playsInline />
      : <img src={m.url} alt={content?.altText || ""} />
  ) : <div className={`ig-ph ig-ph-${type}`}>{placeholder()}<em>Your {type === "reel" ? "video" : "image"} goes here</em></div>;

  if (type === "reel") {
    return (
      <div className="ig-phone reel">
        <div className="ig-reel">
          {mediaEl}
          <div className="ig-reel-side"><Heart /><Bubble /><Send /><Bookmark /></div>
          <div className="ig-reel-bottom">
            <div className="ig-user"><span className="ig-av">{name?.[0] || "S"}</span><b>{handle}</b><span className="ig-follow">Follow</span></div>
            <p className={`ig-reel-cap ${more ? "open" : ""}`} onClick={() => setMore(!more)}><CaptionText text={caption} /></p>
            <span className="ig-audio"><Music /> {content?.reel?.audioSuggestion || "Original audio"}</span>
          </div>
        </div>
      </div>
    );
  }

  const short = caption.length > 125 && !more;
  return (
    <div className="ig-phone">
      <header className="ig-head"><span className="ig-av">{name?.[0] || "S"}</span><b>{handle}</b><span className="ig-dots">•••</span></header>
      <div className="ig-media">
        {mediaEl}
        {total > 1 && (
          <>
            <span className="ig-count">{idx + 1}/{total}</span>
            {idx > 0 && <button type="button" className="ig-nav l" onClick={() => setSlide(idx - 1)} aria-label="Previous slide">‹</button>}
            {idx < total - 1 && <button type="button" className="ig-nav r" onClick={() => setSlide(idx + 1)} aria-label="Next slide">›</button>}
          </>
        )}
      </div>
      <div className="ig-actions">
        <Heart /><Bubble /><Send />
        {total > 1 && <span className="ig-pager">{Array.from({ length: total }, (_, i) => <i key={i} className={i === idx ? "on" : ""} />)}</span>}
        <span className="ig-save"><Bookmark /></span>
      </div>
      <p className="ig-cap">
        <b>{handle}</b>{" "}
        <CaptionText text={short ? caption.slice(0, 125).trimEnd() + "… " : caption} />
        {short && <button type="button" className="ig-more" onClick={() => setMore(true)}>more</button>}
      </p>
    </div>
  );
}

/* ───────────── editors ───────────── */

function HashtagEditor({ tags, onChange, suggestions }) {
  const [draft, setDraft] = useState("");
  const full = tags.length >= MAX_TAGS;
  const add = (t) => {
    const tag = toTag(t || draft);
    setDraft("");
    if (tag.length < 3 || full || tags.some((x) => x.toLowerCase() === tag.toLowerCase())) return;
    onChange([...tags, tag]);
  };
  const unused = suggestions.filter((s) => !tags.some((t) => t.toLowerCase() === toTag(s).toLowerCase())).slice(0, 12);
  return (
    <div className="pb-field">
      <label className="pb-label">Hashtags <span className="pb-count">{tags.length}/{MAX_TAGS}</span></label>
      <div className="pb-chipbox">
        {tags.map((t, i) => (
          <span className="pb-tag" key={t}>{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(tags.filter((_, j) => j !== i))}>×</button></span>
        ))}
        {!full && (
          <input value={draft} placeholder="#addhashtag" onChange={(e) => setDraft(e.target.value)} onBlur={() => draft && add()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " " || e.key === ",") { e.preventDefault(); add(); } }} />
        )}
      </div>
      <p className="igs-help">Instagram allows up to {MAX_TAGS} hashtags per post — pick the most relevant ones.</p>
      {unused.length > 0 && (
        <div className="igs-suggest">
          <span>From research:</span>
          {unused.map((s) => <button type="button" key={s} disabled={full} onClick={() => add(s)}>{toTag(s)}</button>)}
        </div>
      )}
    </div>
  );
}

const Field = ({ label, value, onChange, area, rows = 2, placeholder, hint }) => (
  <div className="pb-field">
    <label className="pb-label">{label}{hint && <span className="pb-count">{hint}</span>}</label>
    {area
      ? <textarea className="pb-input pb-area" rows={rows} value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      : <input className="pb-input" value={value || ""} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />}
  </div>
);

/* ───────────── page ───────────── */

export default function InstagramStudio() {
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [productState, setProductState] = useState("loading"); // loading | ok | none

  const [research, setResearch] = useState(null);
  const [researchBusy, setResearchBusy] = useState(false);

  const [format, setFormat] = useState("image");
  const [brief, setBrief] = useState("");

  const [post, setPost] = useState(null);      // server copy
  const [draft, setDraft] = useState(null);    // editable content
  const [media, setMedia] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);      // generate | revise | save | approve | publish | upload
  const [chat, setChat] = useState([]);
  const [askPrompt, setAskPrompt] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [error, setError] = useState(null);
  const [history, setHistory] = useState([]);

  const fileRef = useRef();
  const chatEnd = useRef();
  const profile = product?.aiProfile;

  useEffect(() => { document.title = "Instagram Studio · Sociva"; }, []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [chat]);

  const say = (from, text, extra = {}) => setChat((c) => [...c, { from, text, at: Date.now(), ...extra }]);

  const refreshHistory = useCallback((id) => {
    listPosts(id).then((r) => setHistory(r.data || [])).catch(() => {});
  }, []);

  /* load product + cached research */
  useEffect(() => {
    let id = null;
    try { id = localStorage.getItem(PRODUCT_KEY); } catch { /* ignore */ }
    if (!id) { setProductState("none"); return; }
    getProduct(id)
      .then((doc) => {
        setProduct(doc);
        setProductState("ok");
        const cached = readStore(researchKey(id));
        if (cached) setResearch(cached);
        refreshHistory(id);
      })
      .catch(() => setProductState("none"));
  }, [refreshHistory]);

  const suggestions = useMemo(() => {
    const h = research?.hashtagResearch || {};
    return [...(h.primary || []), ...(h.niche || []), ...(h.related || [])];
  }, [research]);

  const applyPost = (data) => {
    setPost(data);
    setDraft(structuredClone(data.content));
    setMedia(data.media || []);
    setDirty(false);
    setFormat(data.contentType);
  };

  const run = async (kind, fn) => {
    setBusy(kind);
    setError(null);
    try {
      return await fn();
    } catch (err) {
      setError(err.message);
      if (err.body?.data) applyPost(err.body.data);
      return null;
    } finally {
      setBusy(null);
    }
  };

  /* ---------- actions ---------- */

  const doResearch = () => {
    setResearchBusy(true);
    setError(null);
    runInstagramResearch(profile)
      .then((r) => {
        setResearch(r.research);
        writeStore(researchKey(product._id), r.research);
      })
      .catch((e) => setError(e.message))
      .finally(() => setResearchBusy(false));
  };

  const doGenerate = () =>
    run("generate", async () => {
      const r = await generatePost({ productId: product._id, instagramResearch: research, contentType: format, userPrompt: brief.trim() });
      applyPost(r.data);
      setChat([]);
      if (brief.trim()) say("user", brief.trim());
      say("ai", r.assistant?.message || "Your draft is ready for review.");
      refreshHistory(product._id);
    });

  const saveEdits = async (silent) => {
    const r = await updatePost(post._id, { content: draft, media });
    applyPost(r.data);
    if (!silent) say("ai", "Saved your edits.");
    return r.data;
  };

  const doSave = () => run("save", () => saveEdits(false));

  const doRevise = (text, contentType) => {
    const prompt = (text ?? askPrompt).trim();
    if (!prompt) return;
    setAskPrompt("");
    say("user", prompt);
    return run("revise", async () => {
      if (dirty) await saveEdits(true); // AI should see the user's manual edits
      const r = await revisePost(post._id, prompt, contentType);
      applyPost(r.data);
      say("ai", r.assistant?.message || "Updated.");
    });
  };

  const doApprove = () =>
    run("approve", async () => {
      if (dirty) await saveEdits(true);
      const r = await approvePost(post._id);
      applyPost(r.data);
      say("ai", r.assistant.message, { ask: !!r.assistant.askToPublish, needsMedia: !!r.assistant.needsMedia });
    });

  const doPublish = () => {
    say("user", "Yes, upload it.");
    return run("publish", async () => {
      say("ai", "Uploading to Instagram… videos can take a minute while Instagram processes them.");
      const r = await publishPost(post._id);
      applyPost(r.data);
      say("ai", r.assistant.message, { link: r.assistant.permalink });
      refreshHistory(product._id);
    }).then((ok) => { if (ok === null) say("ai", "The upload didn't go through — see the message above. Fix it and approve again.", { error: true }); });
  };

  const notNow = () => {
    say("user", "Not now.");
    say("ai", "No problem — it's saved as approved. Come back anytime and I'll upload it when you say so.");
  };

  const persistMedia = async (next) => {
    setMedia(next);
    const r = await updatePost(post._id, { media: next });
    applyPost(r.data);
  };

  const onFiles = (files) =>
    run("upload", async () => {
      const list = Array.from(files || []);
      const added = [];
      for (const f of list) {
        const r = await uploadMedia(f);
        added.push(r.data);
        if (!r.data.publicReachable) {
          say("ai", "Heads up: this file is on localhost, so Instagram can't download it. Set PUBLIC_BASE_URL in backend/.env (e.g. an ngrok URL) before uploading, or paste a public media URL.", { warn: true });
        }
      }
      const next = post.contentType === "carousel" ? [...media, ...added].slice(0, 10) : added.slice(-1);
      await persistMedia(next);
      if (fileRef.current) fileRef.current.value = "";
    });

  const addUrl = () => {
    const url = mediaUrl.trim();
    if (!/^https?:\/\//i.test(url)) { setError("Paste a full media URL starting with https://"); return; }
    setMediaUrl("");
    const item = { type: guessType(url), url, source: "url" };
    const next = post.contentType === "carousel" ? [...media, item].slice(0, 10) : [item];
    run("upload", () => persistMedia(next));
  };

  /* ---------- draft editing helpers ---------- */

  const edit = (patch) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const editVisual = (patch) => edit({ visual: { ...draft.visual, ...patch } });
  const editScene = (i, patch) => edit({ reel: { ...draft.reel, scenes: draft.reel.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });
  const editSlide = (i, patch) => edit({ carousel: { slides: draft.carousel.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) } });

  const finalCaption = finalCaptionOf(draft);
  const locked = post && ["publishing", "published"].includes(post.status);
  const lastAsk = [...chat].reverse().find((m) => m.from === "ai");
  const showAsk = post?.status === "approved" && lastAsk?.ask && !busy;
  const accept = post?.contentType === "image" ? "image/jpeg" : post?.contentType === "reel" ? "video/mp4,video/quicktime" : "image/jpeg,video/mp4,video/quicktime";

  /* ---------- render ---------- */

  if (productState !== "ok") {
    return (
      <div className="pb igs">
        <TopBar />
        <main className="igs-empty pb-card">
          {productState === "loading" ? <p className="pb-muted">Loading your product…</p> : (
            <>
              <h1 className="pb-h1">Create for Instagram</h1>
              <p className="pb-sub">First train your Product Brain so the AI knows what you sell.</p>
              <Link className="pb-btn primary" to="/onboarding/product"><I.ArrowLeft /> Go to Product Brain</Link>
            </>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="pb igs">
      <TopBar />
      <main className="pb-grid igs-grid">
        {/* ───── LEFT: research -> format -> review ───── */}
        <section className="pb-card pb-main">
          <span className="pb-pill"><I.InstagramIcon size={15} /> Instagram Studio</span>
          <h1 className="pb-h1">Create a post for {profile?.name || "your product"}</h1>
          <p className="pb-sub">The AI uses your Instagram research — audience, keywords and hashtags — to write a post that fits how people search and engage on Instagram.</p>

          {/* 1. research */}
          <div className="igs-step">
            <div className="igs-step-head"><span className="igs-num">1</span><h2>Instagram research</h2>
              <button type="button" className="pb-link" disabled={researchBusy} onClick={doResearch}>
                {researchBusy ? <span className="pb-spinner dark" /> : <I.Refresh size={15} />} {research ? "Run again" : "Run research"}
              </button>
            </div>
            {research ? (
              <div className="igs-research">
                <div><b>Audience</b><span>{(research.targetAudience?.segments || []).slice(0, 3).join(" · ") || "—"}</span></div>
                <div><b>Hashtags</b><span className="igs-tags">{suggestions.slice(0, 8).map((t) => <i key={t}>{toTag(t)}</i>)}</span></div>
                <div><b>Ideas</b><span>{(research.contentResearch?.reelIdeas || []).length} reel · {(research.contentResearch?.carouselIdeas || []).length} carousel · {(research.contentResearch?.postIdeas || []).length} post</span></div>
              </div>
            ) : (
              <p className="pb-muted">{researchBusy ? "Researching hashtags, keywords and audience…" : "Not run yet — run it now, or the AI will run it automatically when you create."}</p>
            )}
          </div>

          {/* 2. format */}
          <div className="igs-step">
            <div className="igs-step-head"><span className="igs-num">2</span><h2>What do you want to create?</h2></div>
            <div className="igs-formats" role="radiogroup" aria-label="Format">
              {FORMATS.map((f) => {
                const Icon = FORMAT_ICON[f.key];
                return (
                  <button key={f.key} type="button" role="radio" aria-checked={format === f.key} className={`igs-format ${format === f.key ? "on" : ""}`} onClick={() => setFormat(f.key)}>
                    <Icon s={26} /><strong>{f.label}</strong><span>{f.sub}</span><em>{f.ratio}</em>
                  </button>
                );
              })}
            </div>
            <div className="pb-field">
              <label className="pb-label" htmlFor="igs-brief">Anything specific? <span className="pb-count">optional</span></label>
              <textarea id="igs-brief" className="pb-input pb-area" rows={2} value={brief} onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. Diwali gifting angle, show the price, talk to working moms" />
            </div>
            <div className="igs-row-end">
              <button type="button" className="pb-btn primary" disabled={!!busy} onClick={doGenerate}>
                {busy === "generate" ? <span className="pb-spinner" /> : <I.Sparkle />}
                {busy === "generate" ? "Creating…" : post ? `Create a new ${FORMATS.find((f) => f.key === format).label.toLowerCase()}` : `Create ${FORMATS.find((f) => f.key === format).label.toLowerCase()} with AI`}
              </button>
            </div>
          </div>

          {error && (
            <div className="pb-alert err" role="alert"><I.Alert /><div><p>{error}</p></div>
              <button type="button" className="pb-link" onClick={() => setError(null)}>Dismiss</button></div>
          )}

          {/* 3. review */}
          {post && draft && (
            <div className="igs-step">
              <div className="igs-step-head"><span className="igs-num">3</span><h2>Review &amp; edit</h2>
                <span className={`igs-status s-${post.status}`}>{STATUS_LABEL[post.status]}</span>
              </div>

              {draft.contentAngle && <p className="igs-angle"><b>Angle:</b> {draft.contentAngle}{draft.targetAudience && <> · <b>For:</b> {draft.targetAudience}</>}</p>}

              <fieldset disabled={locked || !!busy} className="igs-fields">
                <Field label="Hook (first line people see)" value={draft.hook} onChange={(v) => edit({ hook: v })} hint={`${(draft.hook || "").length}/125`} />
                <Field label="Caption" area rows={8} value={draft.caption} onChange={(v) => edit({ caption: v })}
                  hint={`${finalCaption.length.toLocaleString()} / ${CAPTION_LIMIT.toLocaleString()} incl. hashtags`} />
                <HashtagEditor tags={draft.hashtags || []} onChange={(t) => edit({ hashtags: t })} suggestions={suggestions} />
                <Field label="Call to action" value={draft.callToAction} onChange={(v) => edit({ callToAction: v })} />

                {post.contentType === "image" && (
                  <>
                    <Field label="Text on image" value={draft.visual?.onImageText} onChange={(v) => editVisual({ onImageText: v })} />
                    <Field label="Photo / design brief" area value={draft.visual?.brief} onChange={(v) => editVisual({ brief: v })} />
                  </>
                )}

                {post.contentType === "reel" && draft.reel && (
                  <>
                    <div className="pb-row">
                      <Field label="Cover text" value={draft.reel.coverText} onChange={(v) => edit({ reel: { ...draft.reel, coverText: v } })} />
                      <Field label="Audio mood" value={draft.reel.audioSuggestion} onChange={(v) => edit({ reel: { ...draft.reel, audioSuggestion: v } })} />
                    </div>
                    <label className="pb-label">Reel script <span className="pb-count">{draft.reel.durationSec}s</span></label>
                    <ol className="igs-scenes">
                      {draft.reel.scenes.map((s, i) => (
                        <li key={i}>
                          <span className="igs-time">{s.start}–{s.end}s</span>
                          <input className="pb-input" value={s.visual} placeholder="What to film" onChange={(e) => editScene(i, { visual: e.target.value })} />
                          <input className="pb-input" value={s.onScreenText} placeholder="On-screen text" onChange={(e) => editScene(i, { onScreenText: e.target.value })} />
                          <input className="pb-input" value={s.voiceover} placeholder="Voiceover" onChange={(e) => editScene(i, { voiceover: e.target.value })} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}

                {post.contentType === "carousel" && draft.carousel && (
                  <>
                    <label className="pb-label">Slides <span className="pb-count">{draft.carousel.slides.length}</span></label>
                    <ol className="igs-slides">
                      {draft.carousel.slides.map((s, i) => (
                        <li key={i}>
                          <span className="igs-time">{i + 1}</span>
                          <input className="pb-input" value={s.headline} placeholder="Headline" onChange={(e) => editSlide(i, { headline: e.target.value })} />
                          <textarea className="pb-input pb-area" rows={2} value={s.body} placeholder="Slide text" onChange={(e) => editSlide(i, { body: e.target.value })} />
                          <input className="pb-input" value={s.visual} placeholder="Visual" onChange={(e) => editSlide(i, { visual: e.target.value })} />
                        </li>
                      ))}
                    </ol>
                  </>
                )}
                <Field label="Alt text (accessibility)" area value={draft.altText} onChange={(v) => edit({ altText: v })} />
              </fieldset>

              {/* media */}
              <div className="igs-media">
                <label className="pb-label">
                  {post.contentType === "image" ? "Your image (JPEG)" : post.contentType === "reel" ? "Your video (MP4/MOV, 9:16)" : "Your slides (2–10 JPEG/MP4)"}
                  <span className="pb-count">{media.length}</span>
                </label>
                {media.length > 0 && (
                  <ul className="igs-thumbs">
                    {media.map((m, i) => (
                      <li key={m.url + i}>
                        {m.type === "video" ? <video src={m.url} muted /> : <img src={m.url} alt="" />}
                        {!locked && <button type="button" aria-label="Remove" onClick={() => run("upload", () => persistMedia(media.filter((_, j) => j !== i)))}>×</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {!locked && (
                  <div className="igs-media-add">
                    <input ref={fileRef} type="file" hidden accept={accept} multiple={post.contentType === "carousel"} onChange={(e) => onFiles(e.target.files)} />
                    <button type="button" className="pb-btn outline" disabled={!!busy} onClick={() => fileRef.current?.click()}>
                      {busy === "upload" ? <span className="pb-spinner dark" /> : <UploadIc />} Upload
                    </button>
                    <input className="pb-input" value={mediaUrl} placeholder="…or paste a public https:// media URL" onChange={(e) => setMediaUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
                    <button type="button" className="pb-btn outline" disabled={!mediaUrl.trim() || !!busy} onClick={addUrl}>Add</button>
                  </div>
                )}
              </div>

              {/* assistant */}
              <div className="igs-chat">
                <div className="igs-chat-head"><I.Sparkle size={16} /> Sociva AI</div>
                <ul>
                  {chat.map((m, i) => (
                    <li key={m.at + "-" + i} className={`igs-msg ${m.from} ${m.warn ? "warn" : ""} ${m.error ? "err" : ""}`}>
                      <p>{m.text}</p>
                      {m.link && <a href={m.link} target="_blank" rel="noreferrer">View on Instagram ↗</a>}
                    </li>
                  ))}
                  {busy === "revise" && <li className="igs-msg ai typing"><span /><span /><span /></li>}
                  <li ref={chatEnd} aria-hidden />
                </ul>

                {showAsk && (
                  <div className="igs-ask">
                    <button type="button" className="pb-btn primary" onClick={doPublish}><I.InstagramIcon size={16} /> Yes, upload it</button>
                    <button type="button" className="pb-btn outline" onClick={notNow}>Not now</button>
                  </div>
                )}

                {!locked && (
                  <>
                    <div className="igs-quick">
                      {QUICK_EDITS.map((q) => <button type="button" key={q} disabled={!!busy} onClick={() => doRevise(q)}>{q}</button>)}
                      {FORMATS.filter((f) => f.key !== post.contentType).map((f) => (
                        <button type="button" key={f.key} disabled={!!busy} onClick={() => doRevise(`Turn this into a ${f.label.toLowerCase()}`, f.key)}>Turn into {f.label.toLowerCase()}</button>
                      ))}
                    </div>
                    <div className="igs-ask-input">
                      <input className="pb-input" value={askPrompt} disabled={!!busy} placeholder="Tell the AI what to change…" onChange={(e) => setAskPrompt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doRevise()} />
                      <button type="button" className="pb-btn primary" disabled={!askPrompt.trim() || !!busy} onClick={() => doRevise()}>
                        {busy === "revise" ? <span className="pb-spinner" /> : <I.Sparkle />} Change
                      </button>
                    </div>
                  </>
                )}
              </div>

              {!locked && (
                <div className="pb-footer">
                  <button type="button" className="pb-btn outline" disabled={!dirty || !!busy} onClick={doSave}>
                    {busy === "save" ? <span className="pb-spinner dark" /> : <I.Check />} {dirty ? "Save edits" : "Saved"}
                  </button>
                  <button type="button" className="pb-btn primary lg" disabled={!!busy || (post.status === "approved" && !dirty)} onClick={doApprove}>
                    {busy === "approve" ? <span className="pb-spinner" /> : <I.Check />} {post.status === "approved" && !dirty ? "Approved" : "Looks good — approve"}
                  </button>
                </div>
              )}
              {post.status === "published" && post.instagram?.permalink && (
                <a className="pb-btn primary lg igs-done" href={post.instagram.permalink} target="_blank" rel="noreferrer"><I.InstagramIcon /> Open on Instagram</a>
              )}
            </div>
          )}

          {!post && (
            <div className="pb-footer">
              <button type="button" className="pb-btn outline" onClick={() => navigate("/onboarding/product")}><I.ArrowLeft /> Back</button>
            </div>
          )}
        </section>

        {/* ───── RIGHT: phone preview + tips + history ───── */}
        <aside className="pb-side">
          <section className="pb-card igs-preview">
            <div className="pb-preview-head">
              <span className="pb-preview-icon"><I.Eye /></span>
              <div><h3>Instagram preview</h3><p>{post ? "Updates as you edit" : "Your post will appear here"}</p></div>
            </div>
            {post && draft ? (
              <IgPreview type={post.contentType} content={draft} media={media} name={profile?.name} />
            ) : (
              <div className="pb-empty">
                <div className={`pb-skel block ${busy === "generate" ? "shimmer" : ""}`} />
                <p>{busy === "generate" ? "Writing your post…" : "Pick a format and create with AI."}</p>
              </div>
            )}
          </section>

          {post && (draft?.whyThisWorks || draft?.engagementTips?.length > 0) && (
            <section className="pb-card pb-why">
              <h3>Why this works</h3>
              {draft.whyThisWorks && <p className="pb-muted">{draft.whyThisWorks}</p>}
              {draft.engagementTips?.length > 0 && <ul className="igs-tips">{draft.engagementTips.map((t) => <li key={t}>{t}</li>)}</ul>}
            </section>
          )}

          <section className="pb-card pb-recent">
            <div className="pb-section-head"><h3>Your Instagram posts</h3></div>
            {history.length === 0 ? <p className="pb-muted">Nothing yet.</p> : (
              <ul className="pb-recent-list">
                {history.slice(0, 8).map((h) => {
                  const Icon = FORMAT_ICON[h.contentType];
                  return (
                    <li key={h._id}>
                      <button type="button" className={post?._id === h._id ? "on" : ""} onClick={() => { applyPost(h); setChat([]); }}>
                        <span className="pb-avatar sm"><Icon s={16} /></span>
                        <span className="pb-recent-text"><strong>{h.content?.title || h.content?.hook || "Untitled"}</strong><span>{STATUS_LABEL[h.status]}</span></span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <header className="pb-top">
      <Link to="/" className="pb-logo" aria-label="Sociva home">
        <span className="pb-logo-mark"><I.LogoIcon /></span>
        <span className="pb-logo-name">Sociva</span>
        <span className="pb-logo-badge">AI</span>
      </Link>
      <Link to="/onboarding/product" className="pb-exit">← Product Brain</Link>
    </header>
  );
}
