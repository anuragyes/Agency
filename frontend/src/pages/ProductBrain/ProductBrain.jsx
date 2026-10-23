// ─────────────────────────────────────────────────────────────
// ProductBrain.jsx — Step 1 of onboarding: the Product AI Agent
// 1. User describes the product (English / Hindi / Hinglish)
// 2. POST /api/products -> Gemini builds the aiProfile -> saved in MongoDB
// 3. User reviews / fine-tunes the profile + post voice
// 4. Live preview builds a post per platform -> share to Instagram, WhatsApp, X, LinkedIn
// Next steps (Market Research, Competitors) use the saved product _id.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { analyzeProduct, getProduct, listProducts } from "../../api/productApi";
import { BUILT_IN_TONES, PLATFORMS, composePost, formatPrice, isEmptyProfile, profileStrength } from "./postComposer";
import * as I from "./icons";
import "./ProductBrain.css";

const MAX_CHARS = 5000;
const STORAGE_KEY = "sociva.currentProductId";

const STEPS = [
  { key: "product", label: "Product Brain" },
  { key: "market", label: "Market Research" },
  { key: "competitors", label: "Competitors" },
  { key: "channels", label: "Channels" },
  { key: "autopilot", label: "Autopilot" },
];

const EXAMPLES = [
  { label: "Organic ghee", text: "Pure A2 desi cow ghee made with the traditional bilona method. 500ml glass jar, ₹899. No preservatives. Good for cooking, sweets and daily health. Made for families who care about clean food." },
  { label: "Running shoes", text: "Lightweight men's running shoes with breathable mesh upper and cushioned EVA sole. Anti-slip grip. Sizes 6 to 11. Price Rs 2,499. For daily runners and gym use." },
  { label: "Hinglish skincare", text: "Vitamin C face serum 30ml, glowing skin ke liye. Dark spots kam karta hai, sabhi skin types ke liye. Daam sirf 599 rupaye." },
  { label: "Smart bottle", text: "Stainless steel smart water bottle with LED temperature display. Keeps drinks hot for 12 hours and cold for 24 hours. 750ml, $29. Great for office, travel and gym." },
];

const LOADING_STEPS = [
  "Reading your description…",
  "Fixing spelling & language…",
  "Extracting features & benefits…",
  "Finding your target audience…",
  "Building search keywords…",
];

const LIST_FIELDS = [
  { key: "features", label: "Features", placeholder: "Add a feature" },
  { key: "benefits", label: "Benefits", placeholder: "Add a benefit" },
  { key: "uses", label: "Use cases", placeholder: "Add a use case" },
  { key: "targetAudience", label: "Target audience", placeholder: "Add an audience" },
  { key: "keywords", label: "Keywords", placeholder: "Add a keyword", lower: true },
];

const DEFAULT_SETTINGS = { tones: ["Confident", "Helpful"], formality: 45, playful: 40, detail: 45, emoji: 35 };

const emojiLabel = (v) => (v < 10 ? "none" : v < 45 ? "a little" : v < 80 ? "some" : "lots");

function timeAgo(date) {
  const s = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

const initials = (name = "") =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "S";

/* ───────────── small building blocks ───────────── */

function Stepper({ current = 0 }) {
  return (
    <ol className="pb-stepper" aria-label="Onboarding progress">
      {STEPS.map((s, i) => (
        <li key={s.key} className={`pb-step ${i < current ? "done" : ""} ${i === current ? "active" : ""}`}>
          {i > 0 && <span className="pb-step-line" aria-hidden />}
          <span className="pb-step-dot">{i < current ? <I.Check size={14} /> : i + 1}</span>
          <span className="pb-step-label">{s.label}</span>
        </li>
      ))}
    </ol>
  );
}

function ChipEditor({ label, items, onChange, placeholder, lower }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    let v = draft.trim().replace(/,$/, "");
    if (lower) v = v.toLowerCase();
    if (v && !items.some((i) => i.toLowerCase() === v.toLowerCase())) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="pb-field">
      <label className="pb-label">
        {label} <span className="pb-count">{items.length}</span>
      </label>
      <div className="pb-chipbox">
        {items.map((it, i) => (
          <span className="pb-tag" key={`${it}-${i}`}>
            {it}
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            } else if (e.key === "Backspace" && !draft && items.length) {
              onChange(items.slice(0, -1));
            }
          }}
        />
      </div>
    </div>
  );
}

function Slider({ left, right, value, onChange }) {
  return (
    <div className="pb-slider">
      <div className="pb-slider-labels">
        <span className="strong">{left}</span>
        <span>{right}</span>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        aria-label={`${left} to ${right}`}
        style={{ "--val": `${value}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ───────────── page ───────────── */

export default function ProductBrain() {
  const navigate = useNavigate();

  // input + request state
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadStep, setLoadStep] = useState(0);
  const [error, setError] = useState(null);

  // result
  const [product, setProduct] = useState(null); // full Mongo doc
  const [profile, setProfile] = useState(null); // editable copy of product.aiProfile
  const [editingInput, setEditingInput] = useState(true);

  // post voice + preview
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [customTone, setCustomTone] = useState(null); // null = hidden, "" = input open
  const [platform, setPlatform] = useState("instagram");
  const [variant, setVariant] = useState(0);
  const [captionOverride, setCaptionOverride] = useState(null);

  // saved products
  const [recent, setRecent] = useState([]);
  const [recentState, setRecentState] = useState("loading"); // loading | ok | offline

  const [toast, setToast] = useState(null);
  const toastTimer = useRef();
  const textareaRef = useRef();
  const captionRef = useRef();

  const showToast = useCallback((text, type = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    document.title = "Product Brain · Sociva";
  }, []);

  /* ---------- data loading ---------- */

  const loadProduct = useCallback((doc) => {
    setProduct(doc);
    setProfile(structuredClone(doc.aiProfile || {}));
    setDescription(doc.rawInput || "");
    setEditingInput(false);
    setCaptionOverride(null);
    setVariant(0);
    setError(null);
    try {
      localStorage.setItem(STORAGE_KEY, doc._id);
    } catch {
      /* storage blocked */
    }
  }, []);

  const refreshRecent = useCallback(async () => {
    setRecentState("loading");
    try {
      const list = await listProducts();
      setRecent(Array.isArray(list) ? list : []);
      setRecentState("ok");
    } catch {
      setRecentState("offline");
    }
  }, []);

  useEffect(() => {
    refreshRecent();
    let id = null;
    try {
      id = localStorage.getItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (id) getProduct(id).then(loadProduct).catch(() => {});
  }, [refreshRecent, loadProduct]);

  // cycle the "AI is thinking" messages
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLoadStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, [loading]);

  /* ---------- actions ---------- */

  const runAgent = async () => {
    const text = description.trim();
    if (text.length < 8) {
      setError({ text: "Tell the AI a little more — what is it, who is it for, and the price if you have one." });
      textareaRef.current?.focus();
      return;
    }
    setLoadStep(0);
    setLoading(true);
    setError(null);
    try {
      const doc = await analyzeProduct(text);
      if (isEmptyProfile(doc?.aiProfile)) {
        setProduct(null);
        setProfile(null);
        setError({
          text: "That doesn't look like a product or service yet. Describe what you sell — e.g. what it is, key features, who it's for and the price.",
          warn: true,
        });
      } else {
        loadProduct(doc);
        showToast("Product profile ready and saved");
        refreshRecent();
      }
    } catch (err) {
      setError({ text: err.message, offline: err.offline });
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = (patch) => {
    setProfile((p) => ({ ...p, ...patch }));
    setCaptionOverride(null);
  };

  const updateSettings = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    setCaptionOverride(null);
  };

  const toggleTone = (tone) =>
    updateSettings({
      tones: settings.tones.includes(tone) ? settings.tones.filter((t) => t !== tone) : [...settings.tones, tone],
    });

  const addCustomTone = () => {
    const v = (customTone || "").trim();
    if (v && !settings.tones.some((t) => t.toLowerCase() === v.toLowerCase())) {
      updateSettings({ tones: [...settings.tones, v] });
    }
    setCustomTone(null);
  };

  const resetEdits = () => {
    if (!product) return;
    setProfile(structuredClone(product.aiProfile || {}));
    setCaptionOverride(null);
    showToast("Restored the AI's original profile", "info");
  };

  const startNew = () => {
    setProduct(null);
    setProfile(null);
    setDescription("");
    setEditingInput(true);
    setError(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  /* ---------- preview + sharing ---------- */

  const generated = useMemo(
    () => (profile ? composePost(profile, settings, platform, variant) : ""),
    [profile, settings, platform, variant]
  );
  const caption = captionOverride ?? generated;
  const limit = PLATFORMS[platform].limit;
  const overLimit = caption.length > limit;
  const strength = profileStrength(profile);

  // grow the caption box to fit the whole post
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [caption, platform]);

  const copyCaption = async (silent) => {
    try {
      await navigator.clipboard.writeText(caption);
      if (!silent) showToast("Caption copied");
      return true;
    } catch {
      if (!silent) showToast("Couldn't copy — select the text and copy it manually", "err");
      return false;
    }
  };

  const shareTo = async (target) => {
    const text = encodeURIComponent(caption);
    switch (target) {
      case "whatsapp":
        window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
        break;
      case "x":
        if (caption.length > 280) {
          setPlatform("x");
          showToast("Switched to the X version (280 characters max)", "info");
          return;
        }
        window.open(`https://twitter.com/intent/tweet?text=${text}`, "_blank", "noopener");
        break;
      case "linkedin":
        window.open(`https://www.linkedin.com/feed/?shareActive=true&text=${text}`, "_blank", "noopener");
        break;
      case "instagram": {
        // Instagram has no web "share text" link: copy the caption, then open Instagram
        const ok = await copyCaption(true);
        window.open("https://www.instagram.com/", "_blank", "noopener");
        showToast(ok ? "Caption copied — paste it into your Instagram post" : "Open Instagram and paste your caption", "info");
        break;
      }
      case "native":
        try {
          await navigator.share({ title: profile?.name, text: caption });
        } catch {
          /* user cancelled */
        }
        break;
      default:
        break;
    }
  };

  const goNext = () => {
    if (!product) return;
    navigate("/onboarding/instagram"); // product id is already in localStorage (sociva.currentProductId)
  };

  /* ---------- render ---------- */

  const hasProfile = !!profile;
  const listCount = (k) => (profile?.[k] || []).length;

  return (
    <div className="pb">
      {/* ───── top bar ───── */}
      <header className="pb-top">
        <Link to="/" className="pb-logo" aria-label="Sociva home">
          <span className="pb-logo-mark"><I.LogoIcon /></span>
          <span className="pb-logo-name">Sociva</span>
          <span className="pb-logo-badge">AI</span>
        </Link>
        <Stepper current={0} />
        <Link to="/" className="pb-exit">Save &amp; exit</Link>
      </header>

      <main className="pb-grid">
        {/* ───── LEFT: agent + profile ───── */}
        <section className="pb-card pb-main">
          <span className="pb-pill"><I.Brain /> Step 1 of 5</span>
          <h1 className="pb-h1">Train your Product Brain</h1>
          <p className="pb-sub">
            Describe your product in your own words — English, Hindi or Hinglish. Our AI turns it into a structured
            profile we use for market research, competitor tracking and your posts.
          </p>

          {/* input */}
          {editingInput ? (
            <div className="pb-input-wrap">
              <label className="pb-label" htmlFor="pb-desc">What are you selling?</label>
              <div className={`pb-textarea ${loading ? "is-busy" : ""}`}>
                <textarea
                  id="pb-desc"
                  ref={textareaRef}
                  value={description}
                  maxLength={MAX_CHARS}
                  disabled={loading}
                  placeholder="e.g. Handmade soy wax candles in 3 scents, 200g jar, burns 40 hours. ₹449. Perfect for gifting and home decor."
                  onChange={(e) => setDescription(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) runAgent();
                  }}
                />
                <div className="pb-textarea-foot">
                  <div className="pb-examples">
                    <span>Try:</span>
                    {EXAMPLES.map((ex) => (
                      <button key={ex.label} type="button" disabled={loading} onClick={() => setDescription(ex.text)}>
                        {ex.label}
                      </button>
                    ))}
                  </div>
                  <span className="pb-charcount">{description.length}/{MAX_CHARS}</span>
                </div>
              </div>
              <div className="pb-input-actions">
                {product && (
                  <button type="button" className="pb-btn ghost" disabled={loading} onClick={() => setEditingInput(false)}>
                    Cancel
                  </button>
                )}
                <span className="pb-hint">Ctrl + Enter</span>
                <button type="button" className="pb-btn primary" disabled={loading || !description.trim()} onClick={runAgent}>
                  {loading ? <span className="pb-spinner" aria-hidden /> : <I.Sparkle />}
                  {loading ? "Analysing…" : product ? "Re-analyse with AI" : "Analyse with AI"}
                </button>
              </div>
            </div>
          ) : null}

          {/* status / scan card */}
          {loading ? (
            <div className="pb-scan busy" role="status" aria-live="polite">
              <span className="pb-scan-icon"><I.Sparkle size={20} /></span>
              <div className="pb-scan-text">
                <strong>{LOADING_STEPS[loadStep]}</strong>
                <div className="pb-progress"><span style={{ width: `${((loadStep + 1) / LOADING_STEPS.length) * 92}%` }} /></div>
              </div>
            </div>
          ) : hasProfile ? (
            <div className="pb-scan">
              <span className="pb-scan-icon"><I.Box /></span>
              <div className="pb-scan-text">
                <strong>{profile.name || "Untitled product"}</strong>
                <span>
                  {[profile.category, `${listCount("features")} features`, `${listCount("keywords")} keywords`, product?.createdAt && `saved ${timeAgo(product.createdAt)}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <div className="pb-scan-actions">
                <span className="pb-badge ok"><I.Check size={13} /> Profile ready</span>
                {!editingInput && (
                  <button type="button" className="pb-link" onClick={() => setEditingInput(true)}>
                    <I.Pencil /> Edit description
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {error && (
            <div className={`pb-alert ${error.warn ? "warn" : "err"}`} role="alert">
              <I.Alert />
              <div>
                <p>{error.text}</p>
                {error.offline && <p className="pb-alert-sub">Start it with <code>node server.js</code> in the backend folder.</p>}
              </div>
              {!error.warn && !error.offline && (
                <button type="button" className="pb-link" onClick={runAgent}>Retry</button>
              )}
            </div>
          )}

          {/* profile editor */}
          {hasProfile && !loading && (
            <div className="pb-profile">
              <div className="pb-section-head">
                <h2>What the AI learned</h2>
                <button type="button" className="pb-link" onClick={resetEdits}><I.Refresh size={15} /> Reset edits</button>
              </div>

              <div className="pb-row">
                <div className="pb-field">
                  <label className="pb-label" htmlFor="pb-name">Product name</label>
                  <input id="pb-name" className="pb-input" value={profile.name || ""} onChange={(e) => updateProfile({ name: e.target.value })} />
                </div>
                <div className="pb-field">
                  <label className="pb-label" htmlFor="pb-cat">Category</label>
                  <input id="pb-cat" className="pb-input" value={profile.category || ""} onChange={(e) => updateProfile({ category: e.target.value })} />
                </div>
              </div>

              <div className="pb-field">
                <label className="pb-label" htmlFor="pb-d">Description</label>
                <textarea id="pb-d" className="pb-input pb-area" rows={3} value={profile.description || ""} onChange={(e) => updateProfile({ description: e.target.value })} />
              </div>

              <div className="pb-row">
                <div className="pb-field">
                  <label className="pb-label" htmlFor="pb-price">Price</label>
                  <div className="pb-price">
                    <select
                      aria-label="Currency"
                      value={profile.price?.currency || "INR"}
                      onChange={(e) => updateProfile({ price: { ...profile.price, currency: e.target.value } })}
                    >
                      {["INR", "USD", "EUR", "GBP", "AED"].map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <input
                      id="pb-price"
                      type="number"
                      min="0"
                      className="pb-input"
                      placeholder="Not stated"
                      value={profile.price?.amount || ""}
                      onChange={(e) => updateProfile({ price: { ...profile.price, amount: Number(e.target.value) || 0 } })}
                    />
                  </div>
                </div>
                <div className="pb-field">
                  <label className="pb-label" htmlFor="pb-pos">Positioning</label>
                  <input id="pb-pos" className="pb-input" placeholder="How you stand out" value={profile.positioning || ""} onChange={(e) => updateProfile({ positioning: e.target.value })} />
                </div>
              </div>

              {LIST_FIELDS.map((f) => (
                <ChipEditor
                  key={f.key}
                  label={f.label}
                  placeholder={f.placeholder}
                  lower={f.lower}
                  items={profile[f.key] || []}
                  onChange={(items) => updateProfile({ [f.key]: items })}
                />
              ))}

              {/* post voice */}
              <div className="pb-section-head spaced">
                <h2>Post voice</h2>
                <span className="pb-muted">Shapes the preview on the right</span>
              </div>
              <div className="pb-tones">
                {[...BUILT_IN_TONES, ...settings.tones.filter((t) => !BUILT_IN_TONES.includes(t))].map((t) => {
                  const on = settings.tones.includes(t);
                  return (
                    <button key={t} type="button" aria-pressed={on} className={`pb-chip ${on ? "on" : ""}`} onClick={() => toggleTone(t)}>
                      {on && <I.Check size={15} />} {t}
                    </button>
                  );
                })}
                {customTone === null ? (
                  <button type="button" className="pb-chip" onClick={() => setCustomTone("")}><I.Plus /> Add</button>
                ) : (
                  <input
                    autoFocus
                    className="pb-chip-input"
                    placeholder="e.g. Warm"
                    value={customTone}
                    onChange={(e) => setCustomTone(e.target.value)}
                    onBlur={addCustomTone}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCustomTone();
                      if (e.key === "Escape") setCustomTone(null);
                    }}
                  />
                )}
              </div>

              <div className="pb-sliders">
                <Slider left="Casual" right="Professional" value={settings.formality} onChange={(v) => updateSettings({ formality: v })} />
                <Slider left="Playful" right="Serious" value={settings.playful} onChange={(v) => updateSettings({ playful: v })} />
                <Slider left="Concise" right="Detailed" value={settings.detail} onChange={(v) => updateSettings({ detail: v })} />
                <Slider left={`Emoji: ${emojiLabel(settings.emoji)}`} right="Lots" value={settings.emoji} onChange={(v) => updateSettings({ emoji: v })} />
              </div>
            </div>
          )}

          {/* footer */}
          <div className="pb-footer">
            <button type="button" className="pb-btn outline" onClick={() => navigate("/")}>
              <I.ArrowLeft /> Back
            </button>
            <div className="pb-footer-right">
              {hasProfile && (
                <button type="button" className="pb-link" onClick={startNew}><I.Plus /> New product</button>
              )}
              <span className="pb-muted">You can change this anytime</span>
              <button type="button" className="pb-btn primary lg" disabled={!product || loading} onClick={goNext}>
                Continue <I.ArrowRight />
              </button>
            </div>
          </div>
        </section>

        {/* ───── RIGHT: preview + share + saved ───── */}
        <aside className="pb-side">
          <section className="pb-card pb-preview">
            <div className="pb-preview-head">
              <span className="pb-preview-icon"><I.Eye /></span>
              <div>
                <h3>Live post preview</h3>
                <p>Built from your product profile</p>
              </div>
            </div>

            <div className="pb-tabs" role="tablist" aria-label="Platform">
              {Object.entries(PLATFORMS).map(([key, cfg]) => {
                const Icon = { instagram: I.InstagramIcon, x: I.XIcon, whatsapp: I.WhatsAppIcon, linkedin: I.LinkedInIcon }[key];
                return (
                  <button
                    key={key}
                    role="tab"
                    type="button"
                    aria-selected={platform === key}
                    className={`pb-tab ${platform === key ? "on" : ""}`}
                    onClick={() => {
                      setPlatform(key);
                      setCaptionOverride(null);
                    }}
                    title={cfg.label}
                  >
                    <Icon size={16} /> <span>{key === "x" ? "X" : cfg.label}</span>
                  </button>
                );
              })}
            </div>

            {hasProfile && !loading ? (
              <>
                <article className={`pb-post p-${platform}`}>
                  <header>
                    <span className="pb-avatar">{initials(profile.name)}</span>
                    <div>
                      <strong>{profile.name || "Your brand"}</strong>
                      <span>Sponsored · now</span>
                    </div>
                    <span className={`pb-plat-badge b-${platform}`}>
                      {{ instagram: <I.InstagramIcon size={14} />, x: <I.XIcon size={12} />, whatsapp: <I.WhatsAppIcon size={14} />, linkedin: <I.LinkedInIcon size={13} /> }[platform]}
                    </span>
                  </header>

                  <textarea
                    ref={captionRef}
                    className="pb-caption"
                    value={caption}
                    aria-label="Post caption (editable)"
                    onChange={(e) => setCaptionOverride(e.target.value)}
                    rows={4}
                  />

                  {platform !== "x" && platform !== "whatsapp" && (
                    <div className="pb-visual">
                      <span className="pb-visual-cat">{profile.category}</span>
                      <span className="pb-visual-title">{profile.name}</span>
                      {formatPrice(profile.price) && <span className="pb-visual-price">{formatPrice(profile.price)}</span>}
                    </div>
                  )}

                  <footer>
                    <span className={overLimit ? "over" : ""}>
                      {caption.length.toLocaleString()} / {limit.toLocaleString()} chars
                      {captionOverride !== null && " · edited"}
                    </span>
                    <span>
                      Profile strength:{" "}
                      <b className={strength >= 80 ? "good" : strength >= 50 ? "mid" : "low"}>{strength}%</b>
                    </span>
                  </footer>
                </article>

                <div className="pb-preview-actions">
                  <button
                    type="button"
                    className="pb-btn outline block"
                    onClick={() => {
                      setVariant((v) => v + 1);
                      setCaptionOverride(null);
                    }}
                  >
                    <I.Refresh /> Regenerate
                  </button>
                  <button type="button" className="pb-btn outline icon" onClick={() => copyCaption()} aria-label="Copy caption" title="Copy caption">
                    <I.Copy size={18} />
                  </button>
                </div>

                <div className="pb-share">
                  <span className="pb-share-label"><I.Share size={14} /> Send this post to</span>
                  <div className="pb-share-grid">
                    <button type="button" className="pb-share-btn s-instagram" onClick={() => shareTo("instagram")}>
                      <I.InstagramIcon /> Instagram
                    </button>
                    <button type="button" className="pb-share-btn s-whatsapp" onClick={() => shareTo("whatsapp")}>
                      <I.WhatsAppIcon /> WhatsApp
                    </button>
                    <button type="button" className="pb-share-btn s-x" onClick={() => shareTo("x")}>
                      <I.XIcon /> X / Twitter
                    </button>
                    <button type="button" className="pb-share-btn s-linkedin" onClick={() => shareTo("linkedin")}>
                      <I.LinkedInIcon /> LinkedIn
                    </button>
                  </div>
                  {typeof navigator !== "undefined" && navigator.share && (
                    <button type="button" className="pb-link center" onClick={() => shareTo("native")}>More apps…</button>
                  )}
                </div>
              </>
            ) : (
              <div className="pb-empty">
                <div className="pb-skel avatar" />
                <div className="pb-skel line w60" />
                <div className="pb-skel line" />
                <div className="pb-skel line w80" />
                <div className={`pb-skel block ${loading ? "shimmer" : ""}`} />
                <p>{loading ? "Writing your first post…" : "Describe your product and your post preview will appear here."}</p>
              </div>
            )}
          </section>

          {/* saved products */}
          <section className="pb-card pb-recent">
            <div className="pb-section-head">
              <h3>Your products</h3>
              <button type="button" className="pb-link" onClick={refreshRecent} aria-label="Refresh list"><I.Refresh size={15} /></button>
            </div>
            {recentState === "loading" && <p className="pb-muted">Loading…</p>}
            {recentState === "offline" && (
              <p className="pb-muted"><span className="pb-dot red" /> Server offline — can't load saved products.</p>
            )}
            {recentState === "ok" && recent.length === 0 && <p className="pb-muted">Nothing saved yet. Your first analysis will show up here.</p>}
            {recentState === "ok" && recent.length > 0 && (
              <ul className="pb-recent-list">
                {recent.filter((r) => !isEmptyProfile(r.aiProfile)).slice(0, 6).map((r) => (
                  <li key={r._id}>
                    <button type="button" className={product?._id === r._id ? "on" : ""} onClick={() => loadProduct(r)}>
                      <span className="pb-avatar sm">{initials(r.aiProfile?.name)}</span>
                      <span className="pb-recent-text">
                        <strong>{r.aiProfile?.name || "Untitled"}</strong>
                        <span>{r.aiProfile?.category || "—"}</span>
                      </span>
                      <span className="pb-recent-time"><I.Clock size={13} /> {timeAgo(r.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pb-card pb-why">
            <h3>Why this matters</h3>
            <ul>
              <li><span className="pb-why-icon violet"><I.Fingerprint /></span><div><strong>On-brand every time</strong><span>Every post uses your real product facts</span></div></li>
              <li><span className="pb-why-icon green"><I.Target /></span><div><strong>Sharper research</strong><span>Market & competitor research start from this profile</span></div></li>
              <li><span className="pb-why-icon amber"><I.Rocket /></span><div><strong>Faster results</strong><span>Autopilot is ready on day one</span></div></li>
            </ul>
          </section>
        </aside>
      </main>

      {toast && (
        <div className={`pb-toast ${toast.type}`} role="status">
          {toast.type === "err" ? <I.Alert size={16} /> : <I.Check size={16} />} {toast.text}
        </div>
      )}
    </div>
  );
}
