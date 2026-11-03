// ─────────────────────────────────────────────────────────────
// PhonePreview.jsx — Realistic smartphone mockup for YouTube, Instagram & Facebook
// Supports interactive 16:9 player, Shorts player, Feed, Story, and Grid previews.
// ─────────────────────────────────────────────────────────────
import React, { useState } from "react";
import Icon from "./Icon";
import { Avatar, cx, gradientFor } from "./kit";
import { coverText } from "../postUtils";

/**
 * Realistic Modern Smartphone Frame with Dynamic Island, Status Bar, and Gesture Bar
 */
function PhoneFrame({ children, theme = "light", isShort = false }) {
  const isDark = theme === "dark";
  return (
    <div
      className="sa-phone-wrapper"
      style={{
        width: "100%",
        maxWidth: 395,
        margin: "0 auto",
        position: "relative",
      }}
    >
      {/* Outer Phone Hardware Chassis (Curved Titanium Bezel) */}
      <div
        style={{
          width: "100%",
          borderRadius: 48,
          background: "linear-gradient(145deg, #2b2c31, #151619 45%, #090a0c)",
          padding: "11px",
          boxShadow: "0 28px 70px -15px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.12) inset",
          position: "relative",
        }}
      >
        {/* Subtle Hardware Buttons */}
        <div style={{ position: "absolute", left: -2, top: 100, width: 3, height: 38, background: "#3a3b40", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", left: -2, top: 150, width: 3, height: 38, background: "#3a3b40", borderRadius: "3px 0 0 3px" }} />
        <div style={{ position: "absolute", right: -2, top: 120, width: 3, height: 55, background: "#3a3b40", borderRadius: "0 3px 3px 0" }} />

        {/* Screen Frame */}
        <div
          style={{
            background: isDark ? "#0f0f11" : "#ffffff",
            color: isDark ? "#ffffff" : "#0f0f0f",
            borderRadius: 38,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            minHeight: isShort ? 620 : 520,
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15) inset",
          }}
        >
          {/* Top Status Bar with Dynamic Island */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "11px 22px 6px",
              fontSize: 12,
              fontWeight: 700,
              color: isDark ? "#fff" : "#111",
              zIndex: 30,
              background: isDark ? "#0f0f11" : "#ffffff",
              userSelect: "none",
            }}
          >
            <span style={{ letterSpacing: -0.2 }}>9:41</span>
            {/* Dynamic Island pill */}
            <div
              style={{
                width: 84,
                height: 20,
                background: "#000",
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 8,
                boxShadow: "0 0 0 1px rgba(255,255,255,0.06)",
              }}
            >
              {/* Front Camera Lens */}
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#1a1a24", border: "1px solid #2d2d3a" }} />
            </div>
            <div style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 11 }}>
              <span style={{ fontSize: 10, fontWeight: 700 }}>5G</span>
              <span>📶</span>
              <div style={{ width: 19, height: 10, border: `1.2px solid ${isDark ? "#fff" : "#111"}`, borderRadius: 3, padding: 1, display: "flex" }}>
                <div style={{ width: "85%", height: "100%", background: isDark ? "#fff" : "#111", borderRadius: 1 }} />
              </div>
            </div>
          </div>

          {/* Scrollable / Interactive App Screen */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
            {children}
          </div>

          {/* Bottom Gesture Bar */}
          <div style={{ padding: "8px 0 6px", background: isDark ? "#0f0f11" : "#ffffff", display: "grid", placeItems: "center", zIndex: 30 }}>
            <div
              style={{
                width: 124,
                height: 4.5,
                borderRadius: 4,
                background: isDark ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.3)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PhonePreview({ post, content = {}, view = "feed", media = [], platform = "instagram" }) {
  const [ytActiveTab, setYtActiveTab] = useState("auto"); // "auto" | "thumbnail" | "video"
  const [ytIsPlaying, setYtIsPlaying] = useState(false);

  if (!post) return null;

  const name = (post.productProfile?.name || "sociva.brand").toLowerCase().replace(/\s+/g, "");
  const first = media[0] || (post.video?.url ? { type: "video", url: post.video.url } : null) || (post.thumbnail?.url ? { type: "image", url: post.thumbnail.url } : null);
  const slides = content.carousel?.slides || [];
  const caption = [content.caption, (content.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

  /* ── Dedicated Native YouTube Player Preview ── */
  if (platform === "youtube") {
    const channelName = post.productProfile?.name || "Your Channel";
    const ytTitle = content.title || post.content?.title || "Untitled Video";
    const isShort = post.contentType === "short";

    const videoUrl = post.video?.url || media.find((m) => m.type === "video")?.url || (first?.type === "video" ? first.url : null);
    const thumbUrl = post.thumbnail?.url || media.find((m) => m.type === "image" || m.isThumbnail)?.url || (first?.type === "image" ? first.url : null);

    // Determine whether to display the video player or thumbnail image
    const showVideo = Boolean(videoUrl && (ytActiveTab === "video" || (ytActiveTab === "auto" && !thumbUrl) || ytIsPlaying));
    const showThumbnail = Boolean(thumbUrl && !showVideo);

    if (isShort) {
      return (
        <PhoneFrame theme="dark" isShort>
          {/* Mode Switcher Header if both video and thumbnail exist */}
          {videoUrl && thumbUrl && (
            <div style={{ display: "flex", gap: 6, padding: "8px 12px", background: "#18181b", borderBottom: "1px solid #272727", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => { setYtActiveTab("thumbnail"); setYtIsPlaying(false); }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 14,
                  border: "none",
                  cursor: "pointer",
                  background: !showVideo ? "#ff0000" : "#272727",
                  color: "#fff",
                }}
              >
                🖼️ Thumbnail
              </button>
              <button
                type="button"
                onClick={() => { setYtActiveTab("video"); setYtIsPlaying(true); }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 14,
                  border: "none",
                  cursor: "pointer",
                  background: showVideo ? "#ff0000" : "#272727",
                  color: "#fff",
                }}
              >
                ▶ Play Short
              </button>
            </div>
          )}

          <div style={{ background: "#000", position: "relative", flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            {/* Top Shorts Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", zIndex: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: -0.5, color: "#fff" }}>Shorts</span>
              <div style={{ display: "flex", gap: 14 }}>
                <span style={{ cursor: "pointer", fontSize: 14 }}>🔍</span>
                <span style={{ cursor: "pointer", fontSize: 14 }}>⋮</span>
              </div>
            </div>

            {/* Main Video / Thumbnail Visual */}
            <div style={{ position: "absolute", inset: 0, zIndex: 1, background: "#18181b", display: "grid", placeItems: "center" }}>
              {showVideo ? (
                <video
                  key={videoUrl}
                  src={videoUrl}
                  poster={thumbUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : showThumbnail ? (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <img src={thumbUrl} alt="Short Thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  {videoUrl && (
                    <button
                      type="button"
                      onClick={() => { setYtActiveTab("video"); setYtIsPlaying(true); }}
                      style={{
                        position: "absolute",
                        inset: 0,
                        margin: "auto",
                        width: 62,
                        height: 62,
                        borderRadius: "50%",
                        background: "rgba(255, 0, 0, 0.92)",
                        color: "#fff",
                        border: "none",
                        fontSize: 24,
                        display: "grid",
                        placeItems: "center",
                        cursor: "pointer",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.65)",
                      }}
                      title="Click to play Short video"
                    >
                      ▶
                    </button>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,0,0,0.2)", color: "#ff0000", display: "grid", placeItems: "center", margin: "0 auto 10px", fontSize: 24 }}>▶</div>
                  <span style={{ fontSize: 13, color: "#aaa" }}>Upload video or generate thumbnail to preview</span>
                </div>
              )}
            </div>

            {/* Right Action Bar (Native Shorts Icons) */}
            <div style={{ position: "absolute", right: 12, bottom: 85, zIndex: 10, display: "flex", flexDirection: "column", gap: 16, alignItems: "center", color: "#fff" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", fontSize: 17 }}>👍</div>
                <small style={{ fontSize: 10.5, fontWeight: 600 }}>Like</small>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", fontSize: 17 }}>👎</div>
                <small style={{ fontSize: 10.5, fontWeight: 600 }}>Dislike</small>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", fontSize: 17 }}>💬</div>
                <small style={{ fontSize: 10.5, fontWeight: 600 }}>Comment</small>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", fontSize: 17 }}>↗</div>
                <small style={{ fontSize: 10.5, fontWeight: 600 }}>Share</small>
              </div>
            </div>

            {/* Bottom Shorts Details */}
            <div style={{ zIndex: 10, padding: "16px 14px", background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0) 100%)", marginTop: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
                <Avatar name={channelName} size={30} />
                <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>@{channelName.replace(/\s+/g, "").toLowerCase()}</span>
                <span style={{ background: "#cc0000", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 11px", borderRadius: 16 }}>Subscribe</span>
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
                {ytTitle} <span style={{ color: "#3ea6ff" }}>#Shorts</span>
              </div>
            </div>
          </div>
        </PhoneFrame>
      );
    }

    // Standard 16:9 YouTube Video Preview
    return (
      <PhoneFrame theme="light">
        {/* Toggle Bar if both video and thumbnail are available */}
        {videoUrl && thumbUrl && (
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "#64748b" }}>YouTube View:</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => { setYtActiveTab("thumbnail"); setYtIsPlaying(false); }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 14,
                  border: "1px solid #cbd5e1",
                  cursor: "pointer",
                  background: !showVideo ? "#0f0f0f" : "#fff",
                  color: !showVideo ? "#fff" : "#334155",
                }}
              >
                🖼️ Thumbnail
              </button>
              <button
                type="button"
                onClick={() => { setYtActiveTab("video"); setYtIsPlaying(true); }}
                style={{
                  padding: "5px 12px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  borderRadius: 14,
                  border: "1px solid #cbd5e1",
                  cursor: "pointer",
                  background: showVideo ? "#cc0000" : "#fff",
                  color: showVideo ? "#fff" : "#334155",
                }}
              >
                ▶ Play Video
              </button>
            </div>
          </div>
        )}

        <div style={{ padding: 0 }}>
          {/* 16:9 Video Canvas */}
          <div style={{ width: "100%", aspectRatio: "16/9", background: "#000", position: "relative", overflow: "hidden" }}>
            {showVideo ? (
              <video
                key={videoUrl}
                src={videoUrl}
                poster={thumbUrl}
                controls
                autoPlay={ytIsPlaying}
                playsInline
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              />
            ) : showThumbnail ? (
              <div style={{ position: "relative", width: "100%", height: "100%", cursor: videoUrl ? "pointer" : "default" }}>
                <img src={thumbUrl} alt="YouTube Thumbnail" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {videoUrl ? (
                  <button
                    type="button"
                    onClick={() => { setYtActiveTab("video"); setYtIsPlaying(true); }}
                    style={{
                      position: "absolute",
                      inset: 0,
                      margin: "auto",
                      width: 62,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(255, 0, 0, 0.95)",
                      color: "#fff",
                      border: "none",
                      fontSize: 22,
                      display: "grid",
                      placeItems: "center",
                      cursor: "pointer",
                      boxShadow: "0 4px 18px rgba(0,0,0,0.6)",
                      transition: "transform 0.15s ease",
                    }}
                    title="Click to play video"
                  >
                    ▶
                  </button>
                ) : (
                  <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.75)", color: "#fff", fontSize: 10, padding: "2px 7px", borderRadius: 4 }}>
                    Custom Thumbnail
                  </div>
                )}
              </div>
            ) : (
              <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#fff", textAlign: "center", padding: 16 }}>
                <div>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ff0000", display: "grid", placeItems: "center", fontSize: 22, margin: "0 auto 8px" }}>▶</div>
                  <span style={{ fontSize: 12, color: "#9ca3af" }}>Upload video or generate AI thumbnail</span>
                </div>
              </div>
            )}
            {/* Red Playback Bar (shown when previewing thumbnail) */}
            {showThumbnail && (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.3)" }}>
                <div style={{ width: "0%", height: "100%", background: "#ff0000" }} />
              </div>
            )}
          </div>

          {/* Video Metadata */}
          <div style={{ padding: "14px 16px" }}>
            <h4 style={{ fontSize: 14.5, fontWeight: 700, margin: "0 0 6px", lineHeight: 1.35, color: "#0f0f0f" }}>
              {ytTitle}
            </h4>
            <div style={{ fontSize: 11.5, color: "#606060", marginBottom: 12 }}>
              1.4K views · Just now · {content.tags?.[0] ? `#${content.tags[0]}` : "#YouTube"}
            </div>

            {/* Channel Info & Subscribe Button */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Avatar name={channelName} size={34} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "#0f0f0f" }}>{channelName}</div>
                  <div style={{ fontSize: 11, color: "#606060" }}>18.2K subscribers</div>
                </div>
              </div>
              <button type="button" style={{ background: "#0f0f0f", color: "#fff", border: "none", borderRadius: 18, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Subscribe
              </button>
            </div>

            {/* Action Pills (Like, Share, Download) */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}>
              <span style={{ background: "#f2f2f2", padding: "6px 12px", borderRadius: 16, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                👍 248 | 👎
              </span>
              <span style={{ background: "#f2f2f2", padding: "6px 12px", borderRadius: 16, fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                ↗ Share
              </span>
              <span style={{ background: "#f2f2f2", padding: "6px 12px", borderRadius: 16, fontSize: 11.5, fontWeight: 600 }}>
                💾 Save
              </span>
            </div>

            {/* Description Preview Box */}
            <div style={{ marginTop: 12, background: "#f8f8f8", borderRadius: 10, padding: 10, fontSize: 12, color: "#272727", lineHeight: 1.4 }}>
              <b>Description:</b>
              <div style={{ marginTop: 4, whiteSpace: "pre-wrap", color: "#444" }}>
                {content.description ? content.description.slice(0, 160) + "..." : "No description provided."}
              </div>
            </div>
          </div>
        </div>
      </PhoneFrame>
    );
  }

  if (platform === "facebook" && view !== "story") {
    const pageName = post.productProfile?.name || "Your Page";
    return (
      <PhoneFrame theme="light">
        <div>
          <div className="sa-phone-head">
            <Avatar name={pageName} size={30} />
            <span style={{ lineHeight: 1.25 }}>
              {pageName}
              <br />
              <small className="muted" style={{ fontWeight: 400 }}>Just now · Public</small>
            </span>
            <Icon name="more" size={18} style={{ marginLeft: "auto" }} />
          </div>
          <div className="sa-phone-caption" style={{ paddingTop: 0 }}>{caption}</div>
          {post.contentType === "text" && content.link && (
            <div className="small" style={{ margin: "0 14px 10px", padding: 10, border: "1px solid var(--sa-border)", borderRadius: 10, wordBreak: "break-all" }}>
              {content.link}
            </div>
          )}
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
      </PhoneFrame>
    );
  }

  if (view === "grid") {
    return (
      <PhoneFrame theme="light">
        <div style={{ padding: 10 }}>
          <div className="row" style={{ padding: "8px 4px 12px" }}>
            <Avatar name={name} size={46} />
            <div><b>{name}</b><div className="small muted">Your grid preview</div></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 3 }}>
            {Array.from({ length: 9 }, (_, i) => (
              <span key={i} style={{ aspectRatio: "4/5", background: i === 0 ? gradientFor(post._id) : gradientFor(`g${i}`), opacity: i === 0 ? 1 : 0.55, outline: i === 0 ? "2px solid var(--sa-primary)" : 0, borderRadius: 2 }} />
            ))}
          </div>
        </div>
      </PhoneFrame>
    );
  }

  return (
    <PhoneFrame theme="light">
      <div>
        {view !== "story" && (
          <div className="sa-phone-head">
            <Avatar name={name} size={30} />
            {name}
            <Icon name="more" size={18} style={{ marginLeft: "auto" }} />
          </div>
        )}
        <div className={cx("sa-phone-media", (post.contentType === "reel" || view === "story") && "reel")} style={{ background: gradientFor(post._id) }}>
          {first?.type === "image" && <img src={first.url} alt={content.altText || ""} />}
          {first?.type === "video" && <video src={first.url} muted autoPlay loop playsInline />}
          {post.contentType === "carousel" && <span className="cnt">1/{Math.max(slides.length, media.length, 1)}</span>}
          {!first && <h4>{coverText({ content }).slice(0, 60)}</h4>}
        </div>
        {view !== "story" && (
          <>
            <div className="sa-phone-actions">
              <Icon name="heart" size={21} />
              <Icon name="message" size={21} />
              <Icon name="send" size={21} />
              <Icon name="bookmark" size={21} style={{ marginLeft: "auto" }} />
            </div>
            <div className="sa-phone-caption">
              <b>{name}</b> {caption}
            </div>
          </>
        )}
      </div>
    </PhoneFrame>
  );
}
