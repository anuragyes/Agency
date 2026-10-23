// ─────────────────────────────────────────────────────────────
// Onboarding.jsx — 5-step setup wizard (Figma: "Train your Brand Brain")
//  1 Business   -> POST /api/products  (Product AI Agent builds the profile)   [LIVE]
//  2 Brand Brain-> review AI profile + tune the voice (voice saved locally)
//  3 Goals      -> local
//  4 Channels   -> GET /api/instagram/test                                     [LIVE]
//  5 Autopilot  -> POST /api/market-research/:productId                        [LIVE]
// ─────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon, { PlatformIcon, PLATFORM_LABEL } from "../ui/Icon";
import { Avatar, Btn, Card, ChipInput, Field, Pill, Spinner, cx, gradientFor, timeAgo, useToast } from "../ui/kit";
import { LogoMark } from "../layout/AppLayout";
import { useWorkspace } from "../store";
import { MARKET_PLATFORMS, analyzeProduct, startMarketResearch, testInstagram } from "../api";
import { DEFAULT_BRAND, emojiLabel, readBrand, saveBrand } from "../brand";

const STEPS = ["Business", "Brand Brain", "Goals", "Channels", "Autopilot"];
const VOICES = ["Confident", "Helpful", "Witty", "Formal", "Bold", "Inspirational", "Data-driven", "Friendly", "Premium"];
const EXAMPLES = [
  { label: "Marketing agency", text: "Northbeam Studio is a social media marketing agency for B2B SaaS companies. We plan, write and design LinkedIn and Instagram content, and send monthly performance reports. Retainers start at $2,500/month. For founders and marketing leads who want predictable growth without hiring a big in-house team." },
  { label: "Organic ghee", text: "Pure A2 desi cow ghee made with the traditional bilona method. 500ml glass jar, ₹899. No preservatives. Good for cooking, sweets and daily health. Made for families who care about clean food." },
  { label: "Running shoes", text: "Lightweight men's running shoes with breathable mesh upper and cushioned EVA sole. Anti-slip grip. Sizes 6 to 11. Price Rs 2,499. For daily runners and gym use." },
  { label: "Hinglish skincare", text: "Vitamin C face serum 30ml, glowing skin ke liye. Dark spots kam karta hai, sabhi skin types ke liye. Daam sirf 599 rupaye." },
];
const LOADING = ["Reading your description…", "Fixing spelling & language…", "Extracting features & benefits…", "Finding your target audience…", "Building search keywords…"];
const GOALS = [
  { key: "leads", icon: "magnet", title: "Generate leads", sub: "Turn comments and DMs into pipeline" },
  { key: "awareness", icon: "eye", title: "Grow brand awareness", sub: "Reach new people in your niche" },
  { key: "community", icon: "users", title: "Build community", sub: "More conversations and loyal fans" },
  { key: "sales", icon: "dollar", title: "Drive sales", sub: "Push product launches and offers" },
  { key: "time", icon: "clock", title: "Save team time", sub: "Let AI handle the busywork" },
  { key: "clients", icon: "building", title: "Manage clients", sub: "Approvals and white-label reports" },
];
const CHANNELS = ["instagram", "linkedin", "tiktok", "x", "youtube", "facebook", "pinterest", "threads", "whatsapp"];

function Stepper({ step, setStep, maxStep }) {
  return (
    <ol className="sa-steps" style={{ margin: 0, padding: 0 }}>
      {STEPS.map((s, i) => (
        <li key={s} className={cx(i < step && "done", i === step && "active")}>
          {i > 0 && <i className={cx("line", i <= step && "done")} />}
          <button type="button" className="row" disabled={i > maxStep} onClick={() => setStep(i)} style={{ gap: 10, color: "inherit", fontWeight: "inherit" }}>
            <span className="dot">{i < step ? <Icon name="check" size={15} stroke={3} /> : i + 1}</span>
            <span>{s}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Slider({ left, right, value, onChange, labelLeft }) {
  return (
    <div className="sa-range-wrap">
      <div className="row"><label>{labelLeft || left}</label><span>{right}</span></div>
      <input type="range" min="0" max="100" value={value} className="sa-slider" style={{ "--v": `${value}%` }} onChange={(e) => onChange(+e.target.value)} aria-label={`${left} to ${right}`} />
    </div>
  );
}

function VoicePreview({ profile, brand, name }) {
  const benefit = profile?.benefits?.[0] || "a consistency problem";
  const feature = profile?.features?.[0] || "a 3-step system";
  const emoji = brand.emoji > 40 ? " 🚀" : "";
  const hook = brand.playful < 40 ? `Real talk: ${benefit.toLowerCase()} shouldn't be this hard.${emoji}` : `Most ${profile?.category || "B2B"} brands don't have a content problem. They have a **consistency** problem.`;
  const body = brand.detail > 55
    ? `Here's exactly how ${name} solves it — ${feature.toLowerCase()}, built for ${(profile?.targetAudience?.[0] || "busy teams").toLowerCase()}. Save this for later ↓`
    : `Here's how ${name} fixes it ↓`;
  return (
    <div className="sa-card" style={{ padding: 18, boxShadow: "none" }}>
      <div className="row between">
        <div className="row"><Avatar name={name} size={40} /><div><b className="strong">{name}</b><div className="small muted">Promoted · 1m</div></div></div>
        <PlatformIcon platform="linkedin" size={26} />
      </div>
      <p style={{ margin: "14px 0", lineHeight: 1.6 }}>
        {hook.split("**").map((part, i) => (i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>))}
        <br /><br />{body}
      </p>
      <div className="sa-cover" style={{ background: gradientFor(name), aspectRatio: "16/8" }}>
        <h4>{profile?.positioning ? profile.positioning.split(/[.!?]/)[0].slice(0, 60) : "The 3-step content system"}</h4>
      </div>
      <div className="row between small muted mt-s"><span>1.2K reactions · 84 comments</span><span>Predicted: <b className="green">High</b></span></div>
    </div>
  );
}

export default function Onboarding() {
  const { products, current, addProduct, selectProduct, online } = useWorkspace();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(() => Math.min(4, Number(params.get("step")) || 0));
  const [maxStep, setMaxStep] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState(0);
  const [err, setErr] = useState("");
  const [brand, setBrand] = useState(DEFAULT_BRAND);
  const [profile, setProfile] = useState(null);
  const [ig, setIg] = useState({ state: "idle" });
  const [platforms, setPlatforms] = useState(["instagram", "youtube", "facebook"]);
  const [starting, setStarting] = useState(false);

  // When a product exists (e.g. ?step=1), load its profile + saved voice
  useEffect(() => {
    if (current && step > 0 && !profile) {
      setProfile(current.aiProfile);
      setBrand(readBrand(current._id));
      setMaxStep((m) => Math.max(m, 4));
    }
  }, [current, step, profile]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setPhase((p) => Math.min(LOADING.length - 1, p + 1)), 2200);
    return () => clearInterval(t);
  }, [busy]);

  const go = (n) => { setStep(n); setMaxStep((m) => Math.max(m, n)); window.scrollTo(0, 0); };
  const name = profile?.name || "Your brand";
  const setB = (patch) => setBrand((b) => ({ ...b, ...patch }));

  const analyze = async () => {
    if (text.trim().length < 15) { setErr("Tell the AI a bit more — at least one full sentence about what you sell."); return; }
    setErr(""); setBusy(true); setPhase(0);
    try {
      const doc = await analyzeProduct(text.trim());
      addProduct(doc);
      setProfile(doc.aiProfile);
      setBrand(readBrand(doc._id));
      toast("Brand Brain trained — review what the AI learned.", "success");
      go(1);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const useExisting = (p) => {
    selectProduct(p._id);
    setProfile(p.aiProfile);
    setBrand(readBrand(p._id));
    go(1);
  };

  const persistBrand = () => current && saveBrand(current._id, brand);

  const checkIg = async () => {
    setIg({ state: "loading" });
    try {
      const d = await testInstagram();
      setIg({ state: "ok", user: d?.username });
      setB({ channels: [...new Set([...brand.channels, "instagram"])] });
    } catch (e) {
      setIg({ state: "error", msg: e.message });
    }
  };

  const finish = async () => {
    persistBrand();
    if (!current) { navigate("/app"); return; }
    setStarting(true);
    try {
      const doc = await startMarketResearch(current._id, platforms);
      toast("Market research started — results will stream in.", "success");
      navigate("/app");
    } catch (e) {
      toast(e.message, "error");
      setStarting(false);
    }
  };

  const strength = useMemo(() => {
    if (!profile) return 0;
    const f = ["name", "category", "description", "positioning"].filter((k) => profile[k]).length;
    const l = ["features", "benefits", "uses", "targetAudience", "keywords"].reduce((s, k) => s + Math.min(3, profile[k]?.length || 0), 0);
    return Math.round(((f / 4) * 0.4 + (l / 15) * 0.6) * 100);
  }, [profile]);

  return (
    <div className="sa-root sa-onb">
      <header className="sa-onb-top">
        <Link to="/" className="sa-logo" style={{ padding: 0 }}><LogoMark size={44} /> Sociva <span className="sa-ai-tag">AI</span></Link>
        <Stepper step={step} setStep={(i) => i <= maxStep && go(i)} maxStep={maxStep} />
        <Link to="/app" className="strong" onClick={persistBrand}>Save &amp; exit</Link>
      </header>

      <div className="sa-onb-body">
        <Card className="sa-onb-card">
          <Pill icon={["building", "brain", "target", "link", "rocket"][step]}>Step {step + 1} of 5</Pill>

          {/* ── STEP 1: Business ── */}
          {step === 0 && (
            <>
              <h2>Tell us about your business</h2>
              <p>Describe what you sell in your own words — English, Hindi or Hinglish. Our Product AI Agent builds your Brand Brain from it.</p>
              <div className="mt">
                <Field label="Your product or service" right={<small className="faint">{text.length}/5000</small>}>
                  <textarea className="sa-textarea" rows={6} maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
                    placeholder="e.g. We're a social media agency for B2B SaaS. We write LinkedIn + Instagram content and send monthly reports. From $2,500/month…" />
                </Field>
                <div className="row wrap mt-s">
                  <span className="small muted">Try an example:</span>
                  {EXAMPLES.map((e) => <button key={e.label} type="button" className="sa-chip" style={{ height: 32 }} onClick={() => setText(e.text)} disabled={busy}>{e.label}</button>)}
                </div>
                {err && <div className="sa-banner tone-red mt" style={{ padding: 14 }}><Icon name="alert" className="red" /><span>{err}</span></div>}
                {online === false && <div className="sa-banner tone-amber mt" style={{ padding: 14 }}><Icon name="wifiOff" /><span>The backend isn't reachable. Start it with <span className="sa-code">npm run dev</span> in <span className="sa-code">backend/</span> to train the Brand Brain.</span></div>}
                {busy && (
                  <div className="sa-scan mt">
                    <Spinner size={22} />
                    <ul className="sa-loading-steps grow">
                      {LOADING.map((l, i) => <li key={l} className={cx(i < phase && "done", i === phase && "now")}><Icon name={i < phase ? "checkCircle" : "clock"} size={16} />{l}</li>)}
                    </ul>
                  </div>
                )}
              </div>
              {products.length > 0 && !busy && (
                <div className="mt">
                  <div className="sa-section-label">Or continue with an existing brand</div>
                  <div className="sa-grid g-2 mt-s">
                    {products.slice(0, 4).map((p) => (
                      <button key={p._id} type="button" className="sa-goal" onClick={() => useExisting(p)}>
                        <Avatar name={p.aiProfile?.name} size={38} square />
                        <span className="grow"><b className="ellipsis">{p.aiProfile?.name || "Untitled"}</b><small>{p.aiProfile?.category} · {timeAgo(p.createdAt)}</small></span>
                        <Icon name="arrowRight" size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="sa-onb-foot">
                <Btn icon="arrowLeft" to="/">Back</Btn>
                <div className="row"><span className="small muted">Takes ~10 seconds</span>
                  <Btn variant="primary" size="lg" iconRight="arrowRight" onClick={analyze} loading={busy} disabled={!online}>Train Brand Brain</Btn></div>
              </div>
            </>
          )}

          {/* ── STEP 2: Brand Brain ── */}
          {step === 1 && (
            <>
              <h2>Train your Brand Brain</h2>
              <p>We analysed your description. Review what the AI learned and fine-tune it.</p>
              <div className="sa-scan mt">
                <span className="sa-ic" style={{ background: "#fff" }}><Icon name="globe" size={20} className="faint" /></span>
                <div className="grow">
                  <b className="strong">{name}</b>
                  <div className="small muted">{profile?.features?.length || 0} features · {profile?.targetAudience?.length || 0} audiences · {profile?.keywords?.length || 0} keywords detected</div>
                </div>
                <Pill tone="green" icon="check">Scan complete</Pill>
              </div>
              <div className="sa-grid g-2 mt">
                <Field label="Brand name"><input className="sa-input" value={profile?.name || ""} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></Field>
                <Field label="Industry"><input className="sa-input" value={profile?.category || ""} onChange={(e) => setProfile((p) => ({ ...p, category: e.target.value }))} /></Field>
              </div>
              <div className="mt">
                <div className="sa-field-label" style={{ marginBottom: 10 }}><span>Brand voice <span className="faint" style={{ fontWeight: 500 }}>— detected by AI</span></span></div>
                <div className="sa-chipset">
                  {VOICES.map((v) => {
                    const on = brand.voice.includes(v);
                    return <button key={v} type="button" className={cx("sa-chip", on && "on")} onClick={() => setB({ voice: on ? brand.voice.filter((x) => x !== v) : [...brand.voice, v] })}>{on && <Icon name="check" size={15} stroke={2.6} />}{v}</button>;
                  })}
                </div>
              </div>
              <div className="sa-grid g-2 mt" style={{ rowGap: 28 }}>
                <Slider left="Casual" right="Professional" value={brand.formality} onChange={(v) => setB({ formality: v })} />
                <Slider left="Playful" right="Serious" value={brand.playful} onChange={(v) => setB({ playful: v })} />
                <Slider left="Concise" right="Detailed" value={brand.detail} onChange={(v) => setB({ detail: v })} />
                <Slider left="Emoji" labelLeft={`Emoji: ${emojiLabel(brand.emoji)}`} right="Lots" value={brand.emoji} onChange={(v) => setB({ emoji: v })} />
              </div>
              <div className="mt">
                <Field label="Target audience">
                  <ChipInput values={profile?.targetAudience || []} onChange={(v) => setProfile((p) => ({ ...p, targetAudience: v }))} placeholder="Add an audience" />
                </Field>
              </div>
              <div className="sa-grid g-2 mt">
                <Field label="Key benefits"><ChipInput values={profile?.benefits || []} onChange={(v) => setProfile((p) => ({ ...p, benefits: v }))} placeholder="Add a benefit" /></Field>
                <Field label="Keywords"><ChipInput values={profile?.keywords || []} onChange={(v) => setProfile((p) => ({ ...p, keywords: v }))} placeholder="Add a keyword" /></Field>
              </div>
              {profile?.positioning && <p className="small muted" style={{ marginTop: 18 }}><b className="strong">Positioning:</b> {profile.positioning}</p>}
              <div className="sa-onb-foot">
                <Btn icon="arrowLeft" onClick={() => go(0)}>Back</Btn>
                <div className="row"><span className="small muted">You can change this anytime</span>
                  <Btn variant="primary" size="lg" iconRight="arrowRight" onClick={() => { persistBrand(); go(2); }}>Continue</Btn></div>
              </div>
            </>
          )}

          {/* ── STEP 3: Goals ── */}
          {step === 2 && (
            <>
              <h2>What should Sociva optimise for?</h2>
              <p>Pick up to 3 goals. Autopilot uses them to plan formats, timing and calls-to-action.</p>
              <div className="sa-grid g-2 mt">
                {GOALS.map((g) => {
                  const on = brand.goals.includes(g.key);
                  return (
                    <button key={g.key} type="button" className={cx("sa-goal", on && "on")}
                      onClick={() => setB({ goals: on ? brand.goals.filter((x) => x !== g.key) : [...brand.goals, g.key].slice(-3) })}>
                      <span className={cx("sa-ic", on ? "tone-grad" : "tone-violet")}><Icon name={g.icon} size={19} /></span>
                      <span className="grow"><b>{g.title}</b><small>{g.sub}</small></span>
                      <span className={cx("sa-check", on && "on")}>{on && <Icon name="check" size={14} stroke={3} />}</span>
                    </button>
                  );
                })}
              </div>
              <div className="sa-onb-foot">
                <Btn icon="arrowLeft" onClick={() => go(1)}>Back</Btn>
                <Btn variant="primary" size="lg" iconRight="arrowRight" onClick={() => { persistBrand(); go(3); }}>Continue</Btn>
              </div>
            </>
          )}

          {/* ── STEP 4: Channels ── */}
          {step === 3 && (
            <>
              <h2>Connect your channels</h2>
              <p>Instagram publishing is live. The other channels are coming soon — pick them now so Autopilot can plan for them.</p>
              <div className="sa-grid g-3 mt">
                {CHANNELS.map((c) => {
                  const on = brand.channels.includes(c);
                  const isIg = c === "instagram";
                  return (
                    <div key={c} className={cx("sa-goal", on && "on")} style={{ flexDirection: "column", gap: 12 }}>
                      <div className="row" style={{ width: "100%" }}>
                        <PlatformIcon platform={c} size={40} />
                        <b className="grow">{PLATFORM_LABEL[c]}</b>
                        {isIg && ig.state === "ok" && <Pill tone="green" icon="check">Live</Pill>}
                      </div>
                      {isIg ? (
                        <>
                          <Btn size="sm" className="sa-btn-block" variant={ig.state === "ok" ? "soft" : "primary"} loading={ig.state === "loading"} onClick={checkIg} icon={ig.state === "ok" ? "checkCircle" : "plug"}>
                            {ig.state === "ok" ? `@${ig.user || "connected"}` : "Test connection"}
                          </Btn>
                          {ig.state === "error" && <small className="red">{ig.msg} — check INSTAGRAM_ACCESS_TOKEN in backend/.env</small>}
                        </>
                      ) : (
                        <Btn size="sm" className="sa-btn-block" variant={on ? "soft" : "default"} icon={on ? "check" : "plus"}
                          onClick={() => setB({ channels: on ? brand.channels.filter((x) => x !== c) : [...brand.channels, c] })}>{on ? "Planned" : "Plan for later"}</Btn>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="sa-onb-foot">
                <Btn icon="arrowLeft" onClick={() => go(2)}>Back</Btn>
                <Btn variant="primary" size="lg" iconRight="arrowRight" onClick={() => { persistBrand(); go(4); }}>Continue</Btn>
              </div>
            </>
          )}

          {/* ── STEP 5: Autopilot ── */}
          {step === 4 && (
            <>
              <h2>Turn on Autopilot</h2>
              <p>First, our research agents study each platform for {name}. Pick where to research — the aggregator ranks them and picks your focus channels.</p>
              <div className="sa-grid g-3 mt">
                {MARKET_PLATFORMS.map((p) => {
                  const on = platforms.includes(p);
                  return (
                    <button key={p} type="button" className={cx("sa-goal", on && "on")} onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}>
                      <PlatformIcon platform={p} size={34} />
                      <span className="grow"><b>{PLATFORM_LABEL[p]}</b><small>Research agent</small></span>
                      <span className={cx("sa-check", on && "on")}>{on && <Icon name="check" size={14} stroke={3} />}</span>
                    </button>
                  );
                })}
              </div>
              <div className="sa-banner mt">
                <span className="sa-banner-ic"><Icon name="shieldCheck" size={22} /></span>
                <div className="sa-banner-body"><h4>You stay in control</h4><p>Nothing is published without your approval. Posts go draft → approved → "Can I upload?" → published.</p></div>
              </div>
              <div className="sa-onb-foot">
                <Btn icon="arrowLeft" onClick={() => go(3)}>Back</Btn>
                <div className="row">
                  <Btn variant="ghost" to="/app" onClick={persistBrand}>Skip for now</Btn>
                  <Btn variant="grad" size="lg" icon="rocket" onClick={finish} loading={starting} disabled={!platforms.length || !current}>Start market research</Btn>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* ── right column ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <Card>
            <div className="row" style={{ marginBottom: 16 }}>
              <span className="sa-ic lg tone-grad"><Icon name="eye" size={22} /></span>
              <div><h3 style={{ fontSize: 19 }}>Live voice preview</h3><span className="small muted">How the AI will write for you</span></div>
            </div>
            {profile ? <VoicePreview profile={profile} brand={brand} name={name} /> : (
              <div className="sa-empty" style={{ padding: 24 }}>
                <span className="sa-empty-ic"><Icon name="brain" size={22} /></span>
                <h4>Waiting for your description</h4>
                <p>Your preview appears as soon as the Brand Brain is trained.</p>
              </div>
            )}
            {profile && (
              <div className="mt-s">
                <div className="row between small"><span className="muted">Profile strength</span><b className="strong">{strength}%</b></div>
                <div className="sa-meter mt-s" style={{ height: 6 }}><span style={{ width: `${strength}%`, background: "var(--sa-grad)" }} /></div>
              </div>
            )}
          </Card>
          <Card title="Why this matters">
            {[["fingerprint", "violet", "On-brand every time", "All content matches your voice"], ["target", "green", "Better recommendations", "Topics tailored to your audience"], ["rocket", "amber", "Faster results", "Autopilot is ready on day one"]].map(([ic, t, a, b]) => (
              <div key={a} className="sa-feature-li"><span className={`sa-ic lg tone-${t}`}><Icon name={ic} size={21} /></span><div><b>{a}</b><small>{b}</small></div></div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
