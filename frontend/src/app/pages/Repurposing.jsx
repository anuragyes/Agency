// Content repurposing — demo (repurposing backend not built yet). "Turn into Instagram post" uses the LIVE post generator.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon, { PlatformIcon } from "../ui/Icon";
import { Meter } from "../ui/charts";
import { Btn, Card, DemoTag, Field, Modal, PageHeader, Pill, useToast } from "../ui/kit";

const g = (a, b) => `linear-gradient(160deg, ${a}, ${b})`;

export default function Repurposing() {
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [src, setSrc] = useState("");
  const [text, setText] = useState("");

  const toPost = () => {
    const body = text.trim() || src.trim();
    if (!body) return;
    setOpen(false);
    navigate("/app/studio", { state: { prompt: `Repurpose this long-form content into a carousel. Pull the 3 strongest ideas:\n\n${body.slice(0, 1500)}`, type: "carousel" } });
  };

  return (
    <>
      <PageHeader title={<>Content repurposing <DemoTag /></>} sub="Turn one long-form piece into a week of native content for every channel.">
        <Btn icon="folderOpen">Past projects</Btn>
        <Btn variant="primary" icon="upload" onClick={() => setOpen(true)}>New source</Btn>
      </PageHeader>

      <div className="sa-grid g-analyst">
        <div className="sa-card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ position: "relative", aspectRatio: "16/9", background: "radial-gradient(circle at 40% 40%, #6b4fa8, #1d1440 70%)", display: "grid", placeItems: "center" }}>
            <span style={{ position: "absolute", top: 16, left: 16 }}><PlatformIcon platform="youtube" size={38} /></span>
            <span style={{ width: 74, height: 74, borderRadius: "50%", background: "rgba(255,255,255,.18)", display: "grid", placeItems: "center", color: "#fff" }}><Icon name="play" size={30} /></span>
            <span style={{ position: "absolute", right: 14, bottom: 14, background: "rgba(0,0,0,.6)", color: "#fff", borderRadius: 99, padding: "3px 10px", fontSize: 13, fontWeight: 600 }}>42:18</span>
          </div>
          <div style={{ padding: 22 }}>
            <small className="muted">SOURCE · YouTube video</small>
            <h3 style={{ fontSize: 20, margin: "6px 0" }}>The AI marketing playbook for 2027 — full webinar</h3>
            <p className="muted" style={{ marginTop: 0 }}>Uploaded Sep 24 · 18.2K views · transcript 6,480 words</p>
            <hr className="sa-hr" style={{ margin: "14px 0" }} />
            {[["Transcribed & chaptered", "9 chapters", true], ["Key moments detected", "14 hooks", true], ["Speaker faces tracked for 9:16 crop", "", true], ["Rendering captions for Shorts", "6 / 8", false]].map(([l, r, done]) => (
              <div key={l} className="row" style={{ padding: "7px 0", color: done ? undefined : "var(--sa-primary)", fontWeight: done ? 400 : 600 }}>
                <Icon name={done ? "checkCircle" : "sparkles"} size={18} style={{ color: done ? "var(--sa-green)" : "var(--sa-primary)" }} /><span className="grow">{l}</span><small className="muted">{r}</small>
              </div>
            ))}
            <div className="mt-s"><Meter value={75} color="linear-gradient(90deg,#5b4cf6,#d946ef)" /></div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div className="sa-banner">
            <span className="sa-banner-ic"><Icon name="repeat" size={22} /></span>
            <div className="sa-banner-body"><h4>1 video → 24 assets across 6 channels</h4><p>Estimated 11 hours of editing saved · all assets match Brand Brain</p></div>
            <Btn size="sm">Customize outputs</Btn>
            <Btn size="sm" variant="primary" icon="calendar" onClick={() => { toast("24 assets queued in the calendar (demo)", "success"); navigate("/app/calendar"); }}>Schedule all</Btn>
          </div>
          <div className="sa-grid g-3">
            <Card title="Short-form clips" sub="Reels · TikTok · Shorts" action={<Pill tone="outline">8</Pill>}>
              <div className="row" style={{ gap: 8 }}>{[["\"AI won't replace you…\"", "#fb923c", "#ea580c"], ["3 tools I use daily", "#f472b6", "#9333ea"], ["The 80/20 of content", "#818cf8", "#7c3aed"]].map(([t, a, b]) => <div key={t} className="sa-cover" style={{ flex: 1, aspectRatio: "9/15", background: g(a, b), padding: 10 }}><h4 style={{ fontSize: 12.5 }}>{t}</h4></div>)}</div>
            </Card>
            <Card title="Carousels" sub="Instagram · LinkedIn" action={<Pill tone="outline">3</Pill>}>
              <div style={{ position: "relative", height: 170 }}>
                {[2, 1, 0].map((i) => <div key={i} className="sa-cover" style={{ position: "absolute", left: i * 16, top: i * 8, width: "70%", height: 150, background: g(["#818cf8", "#2dd4bf", "#a5b4fc"][i], ["#6d28d9", "#0891b2", "#818cf8"][i]), transform: `rotate(${i * 3}deg)`, opacity: 1 - i * 0.15 }}>{i === 0 && <h4 style={{ fontSize: 16 }}>7 AI plays for 2027</h4>}</div>)}
              </div>
              <Btn size="sm" icon="sparkles" className="sa-btn-block mt-s" onClick={() => navigate("/app/studio", { state: { prompt: "Carousel: 7 AI marketing plays for 2027 — from our webinar.", type: "carousel" } })}>Generate with AI</Btn>
            </Card>
            <Card title="Quote graphics" sub="All image channels" action={<Pill tone="outline">5</Pill>}>
              <div className="sa-grid g-2" style={{ gap: 8 }}>{[["#fb7185", "#f59e0b", "\"Consistency beats virality\""], ["#22d3ee", "#0ea5e9", ""], ["#f472b6", "#7c3aed", ""], ["#2dd4bf", "#0891b2", ""]].map(([a, b, t], i) => <div key={i} className="sa-cover" style={{ aspectRatio: "1.4", background: g(a, b), padding: 10 }}><h4 style={{ fontSize: 12 }}>{t}</h4></div>)}</div>
            </Card>
            <Card title="Threads" sub="X · Threads" action={<Pill tone="outline">3</Pill>}>
              <div style={{ borderLeft: "3px solid var(--sa-border)", paddingLeft: 14 }}><b className="strong">The AI marketing playbook in 9 tweets 🧵</b><p className="muted" style={{ marginBottom: 0 }}>1/ Most teams use AI to write faster. The winners use it to learn faster. Here's the difference…</p></div>
            </Card>
            <Card title="Blog article" sub="SEO-optimised · 1,850 words" action={<Pill tone="outline">1</Pill>}>
              <b className="strong">The AI Marketing Playbook for 2027</b>
              <p className="small muted">Keyword: ai marketing strategy · SEO score 88</p>
              <Meter value={88} color="#f59e0b" />
            </Card>
            <Card title="Newsletter" sub="Email digest" action={<Pill tone="outline">1</Pill>}>
              <div style={{ border: "1px solid var(--sa-border)", borderRadius: 12, padding: 14 }}><small className="muted">Subject</small><b className="strong" style={{ display: "block" }}>3 AI plays we're betting on in 2027</b><small className="muted">Preview · 52% predicted open rate</small></div>
            </Card>
          </div>
        </div>
      </div>

      <Card className="mt" title="Recent repurposing projects" action={<span className="sa-link">View all</span>}>
        <div className="sa-table-wrap">
          <table className="sa-table">
            <thead><tr><th>Source</th><th>Type</th><th>Assets</th><th>Channels</th><th>Total reach</th><th>Status</th></tr></thead>
            <tbody>
              {[["AI marketing playbook webinar", "Video", 24, ["instagram", "tiktok", "linkedin", "x"], "—", ["violet", "Processing"], "#2a1b55"], ["Podcast ep. 18 — Growth loops", "Audio", 16, ["instagram", "linkedin", "youtube"], "212K", ["green", "Published"], "#22d3ee"]].map(([n, t, a, ch, r, st, c]) => (
                <tr key={n}><td><span className="row"><span className="sa-thumb" style={{ width: 56, height: 40, borderRadius: 10, background: c }} /><b className="strong">{n}</b></span></td><td>{t}</td><td>{a}</td><td><span className="sa-platform-stack">{ch.map((x) => <PlatformIcon key={x} platform={x} size={26} />)}</span></td><td className="num">{r}</td><td><Pill tone={st[0]} icon={st[1] === "Processing" ? "sparkles" : undefined}>{st[1]}</Pill></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New source" footer={<><Btn onClick={() => setOpen(false)}>Cancel</Btn><Btn variant="primary" icon="sparkles" onClick={toPost} disabled={!text.trim() && !src.trim()}>Turn into Instagram carousel</Btn></>}>
        <Field label="Video, podcast or article URL" hint="Video/audio transcription is coming soon — paste text below to repurpose it now."><input className="sa-input" value={src} onChange={(e) => setSrc(e.target.value)} placeholder="https://youtube.com/watch?v=…" /></Field>
        <div className="mt"><Field label="…or paste the transcript / article"><textarea className="sa-textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field></div>
      </Modal>
    </>
  );
}
