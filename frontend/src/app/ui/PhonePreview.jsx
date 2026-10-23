// ─────────────────────────────────────────────────────────────
// PhonePreview.jsx — interactive smartphone mockup for Instagram / Facebook posts
// Supports Feed preview, Story preview, Grid preview, and Carousel indicators.
// ─────────────────────────────────────────────────────────────
import React from "react";
import Icon from "./Icon";
import { Avatar, cx, gradientFor } from "./kit";
import { coverText } from "../postUtils";

export default function PhonePreview({ post, content = {}, view = "feed", media = [], platform = "instagram" }) {
  if (!post) return null;

  const name = (post.productProfile?.name || "sociva.brand").toLowerCase().replace(/\s+/g, "");
  const first = media[0];
  const slides = content.carousel?.slides || [];
  const caption = [content.caption, (content.hashtags || []).join(" ")].filter(Boolean).join("\n\n");

  if (platform === "facebook" && view !== "story") {
    const pageName = post.productProfile?.name || "Your Page";
    return (
      <div className="sa-phone">
        <div className="sa-phone-screen">
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
      </div>
    );
  }

  if (view === "grid") {
    return (
      <div className="sa-phone">
        <div className="sa-phone-screen" style={{ padding: 10 }}>
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
      </div>
    );
  }

  return (
    <div className="sa-phone">
      <div className="sa-phone-screen">
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
    </div>
  );
}
