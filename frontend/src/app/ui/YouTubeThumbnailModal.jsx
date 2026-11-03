// ─────────────────────────────────────────────────────────────
// YouTubeThumbnailModal.jsx — Dedicated YouTube Thumbnail Generator
// Completely distinct from Instagram ad image generator:
// High-CTR 16:9 canvas, bold 2-4 word stroke+shadow typography,
// viral archetypes, and timestamp safe-zone preview.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import Icon, { PlatformIcon } from "./Icon";
import { Btn, Modal, Pill, Segmented, Spinner, cx, useToast } from "./kit";
import { generateYouTubeThumbnail } from "../../api/youtubeApi";

const ARCHETYPES = [
  {
    key: "viral-shock",
    icon: "zap",
    title: "Viral Shock & Reaction",
    desc: "Exaggerated emotion, intense lighting & neon glow",
    color: "#FFE600",
  },
  {
    key: "versus-comparison",
    icon: "columns",
    title: "Versus / Comparison",
    desc: "Split-screen before/after or contrast battle",
    color: "#FF2B00",
  },
  {
    key: "secret-reveal",
    icon: "sparkles",
    title: "Curiosity & Secret Reveal",
    desc: "Glowing mystery focal point & dramatic spotlight",
    color: "#00F0FF",
  },
  {
    key: "cinematic-epic",
    icon: "video",
    title: "Cinematic 3D & Tech",
    desc: "3D render style, glossy reflections & laser lines",
    color: "#FFFFFF",
  },
];

const COLORS = [
  { key: "#FFE600", label: "Viral Yellow", bg: "#FFE600", text: "#000" },
  { key: "#FF2B00", label: "Fire Red", bg: "#FF2B00", text: "#fff" },
  { key: "#00F0FF", label: "Neon Cyan", bg: "#00F0FF", text: "#000" },
  { key: "#FFFFFF", label: "Pure White", bg: "#FFFFFF", text: "#000" },
];

export default function YouTubeThumbnailModal({
  open,
  onClose,
  post,
  productId,
  videoTitle = "",
  contentType = "video",
  onUse,
}) {
  const toast = useToast();
  const isShort = (post?.contentType || contentType) === "short";
  const defaultTitle = videoTitle || post?.content?.title || "My YouTube Video";

  const [archetype, setArchetype] = useState("viral-shock");
  const [overlayText, setOverlayText] = useState(() => {
    const suggested = post?.content?.visual?.onImageText;
    if (suggested) return suggested.toUpperCase();
    const words = defaultTitle.split(/\s+/).slice(0, 3).join(" ");
    return words ? words.toUpperCase() : "DON'T MISS THIS";
  });
  const [textColor, setTextColor] = useState("#FFE600");
  const [prompt, setPrompt] = useState(() => post?.content?.visual?.brief || defaultTitle);
  const [position, setPosition] = useState("left");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);

  if (!open) return null;

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);
    try {
      const res = await generateYouTubeThumbnail({
        postId: post?._id,
        productId: productId || post?.productId,
        prompt,
        videoTitle: defaultTitle,
        archetype,
        overlayText,
        textColor,
        aspectRatio: isShort ? "9:16" : "16:9",
        position,
      });

      if (res.data) {
        setResult(res.data);
        toast("YouTube thumbnail generated!", "success");
      }
    } catch (err) {
      toast(err.message, "error");
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = () => {
    if (result?.url && onUse) {
      onUse({
        type: "image",
        url: result.url,
        source: "ai",
        overlayText: result.overlayText,
      });
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          <PlatformIcon platform="youtube" size={24} />
          <span>YouTube AI Thumbnail Studio</span>
          <Pill tone="red">{isShort ? "9:16 Short" : "16:9 Standard"}</Pill>
        </div>
      }
      footer={
        <div className="row between" style={{ width: "100%", alignItems: "center" }}>
          <span className="small muted">High-CTR YouTube styling (No Instagram ad clutter)</span>
          <div className="row" style={{ gap: 10 }}>
            <Btn variant="ghost" onClick={onClose} disabled={generating}>
              Cancel
            </Btn>
            {result ? (
              <Btn variant="primary" icon="check" onClick={handleApply}>
                Attach Thumbnail
              </Btn>
            ) : (
              <Btn
                variant="primary"
                icon="sparkles"
                loading={generating}
                onClick={handleGenerate}
                disabled={!prompt.trim()}
              >
                Generate Thumbnail
              </Btn>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
        {/* Left Column: Settings */}
        <div style={{ display: "grid", gap: 16 }}>
          {/* Archetypes Selector */}
          <div>
            <label className="strong" style={{ fontSize: 13, marginBottom: 8, display: "block" }}>
              1. Choose Thumbnail Archetype
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ARCHETYPES.map((arch) => {
                const active = archetype === arch.key;
                return (
                  <button
                    key={arch.key}
                    type="button"
                    onClick={() => {
                      setArchetype(arch.key);
                      setTextColor(arch.color);
                    }}
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: active ? "2px solid #ef4444" : "1px solid var(--sa-border)",
                      background: active ? "rgba(239, 68, 68, 0.06)" : "#fff",
                      cursor: "pointer",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <div className="row" style={{ gap: 6, alignItems: "center" }}>
                      <Icon name={arch.icon} size={15} style={{ color: active ? "#ef4444" : "var(--sa-muted)" }} />
                      <span style={{ fontSize: 12.5, fontWeight: active ? 700 : 600, color: active ? "#0f0f0f" : "#444" }}>
                        {arch.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 10.5, color: "#666", lineHeight: 1.25 }}>
                      {arch.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Big Bold Overlay Text */}
          <div style={{ display: "grid", gap: 6 }}>
            <div className="row between">
              <label className="strong" style={{ fontSize: 13 }}>
                2. Punchy Text Overlay (2–4 Words Max)
              </label>
              <span className="small muted">{(overlayText || "").split(/\s+/).filter(Boolean).length} / 4 words</span>
            </div>
            <input
              className="sa-input"
              style={{ height: 42, fontWeight: 900, fontSize: 15, textTransform: "uppercase", letterSpacing: 0.5 }}
              value={overlayText}
              onChange={(e) => setOverlayText(e.target.value.toUpperCase())}
              placeholder="e.g. STOP DOING THIS!"
            />
          </div>

          {/* Color & Position */}
          <div className="row between wrap" style={{ gap: 12 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <label className="strong" style={{ fontSize: 12.5 }}>Text Accent Color</label>
              <div className="row" style={{ gap: 8 }}>
                {COLORS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setTextColor(c.key)}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: c.bg,
                      border: textColor === c.key ? "3px solid #0f0f0f" : "1.5px solid #ccc",
                      boxShadow: textColor === c.key ? "0 0 0 2px #ef4444" : "none",
                      cursor: "pointer",
                    }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <label className="strong" style={{ fontSize: 12.5 }}>Text Position</label>
              <Segmented
                value={position}
                onChange={setPosition}
                options={[
                  { value: "left", label: "Left" },
                  { value: "center", label: "Center" },
                  { value: "right", label: "Right" },
                ]}
              />
            </div>
          </div>

          {/* Visual Concept */}
          <div style={{ display: "grid", gap: 6 }}>
            <label className="strong" style={{ fontSize: 13 }}>
              3. Visual Prompt & Subject
            </label>
            <textarea
              className="sa-textarea"
              style={{ minHeight: 65, fontSize: 12.5 }}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the subject, lighting, and action..."
            />
          </div>
        </div>

        {/* Right Column: Live Widescreen Canvas Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label className="strong" style={{ fontSize: 13 }}>
            Live YouTube Canvas Preview
          </label>
          <div
            style={{
              width: "100%",
              aspectRatio: isShort ? "9/16" : "16/9",
              background: result?.url ? `url("${result.url}") center/cover no-repeat` : "#0a0a0f",
              borderRadius: 14,
              overflow: "hidden",
              position: "relative",
              border: "1px solid #272727",
              boxShadow: "0 10px 25px -5px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: isShort ? "20px 16px" : "16px 20px",
            }}
          >
            {/* Dark contrast scrim if no image generated yet */}
            {!result?.url && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(circle at 70% 30%, #2e1065 0%, #090314 100%)",
                  zIndex: 1,
                }}
              />
            )}

            {/* Live Stroke Text Preview Overlay */}
            <div
              style={{
                position: "relative",
                zIndex: 3,
                textAlign: position === "right" ? "right" : position === "center" ? "center" : "left",
                marginTop: isShort ? "40%" : "12%",
              }}
            >
              <span
                style={{
                  fontFamily: "Impact, 'Arial Black', sans-serif",
                  fontSize: isShort ? 28 : 34,
                  fontWeight: 900,
                  color: textColor,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  lineHeight: 1.15,
                  display: "inline-block",
                  textShadow:
                    "-2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 10px rgba(0,0,0,0.85)",
                  wordBreak: "break-word",
                  maxWidth: "85%",
                }}
              >
                {overlayText || "YOUR TITLE HERE"}
              </span>
            </div>

            {/* Bottom YouTube Player Badges (Timestamp safe-zone preview) */}
            <div
              style={{
                position: "relative",
                zIndex: 3,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-end",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "rgba(0,0,0,0.75)",
                  padding: "4px 8px",
                  borderRadius: 6,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
                <span>1080p HD</span>
              </div>

              {!isShort && (
                <span
                  style={{
                    background: "rgba(0,0,0,0.85)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 6px",
                    borderRadius: 4,
                    letterSpacing: 0.5,
                  }}
                >
                  14:20
                </span>
              )}
            </div>

            {/* Center Loading Spinner */}
            {generating && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.75)",
                  backdropFilter: "blur(4px)",
                  zIndex: 10,
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  textAlign: "center",
                  padding: 20,
                }}
              >
                <div>
                  <Spinner size={32} />
                  <p style={{ marginTop: 12, fontWeight: 700, fontSize: 13.5 }}>
                    Creating YouTube AI Thumbnail…
                  </p>
                  <p className="small muted" style={{ margin: 0 }}>
                    Crafting viral lighting & typography
                  </p>
                </div>
              </div>
            )}
          </div>

          {result && (
            <div className="row between" style={{ padding: "8px 12px", background: "#f8f9fa", borderRadius: 10 }}>
              <span className="small green row" style={{ gap: 6, fontWeight: 600 }}>
                <Icon name="checkCircle" size={15} /> Thumbnail ready!
              </span>
              <Btn size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
                Regenerate
              </Btn>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

