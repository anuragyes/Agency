// IgPostCard.jsx — one REAL post from a platform API (Instagram / Facebook): image, likes (FB: reactions), comments, shares, hashtags, link
import { useState } from "react";
import Icon from "./Icon";
import { Pill, cx, fmt, timeAgo } from "./kit";

const TYPE = { IMAGE: ["image", "Photo"], VIDEO: ["video", "Video / Reel"], CAROUSEL_ALBUM: ["carousel", "Carousel"] };

export default function IgPostCard({ post, selected, onTagClick, highlight, platformName = "Instagram" }) {
  const [imgOk, setImgOk] = useState(true);
  const [icon, label] = TYPE[post.mediaType] || ["image", post.mediaType || "Post"];
  const caption = post.caption.replace(/#[\p{L}\p{N}_]+/gu, "").trim();

  return (
    <article className="sa-igpost">
      <div className="sa-igpost-media">
        {post.imageUrl && imgOk ? (
          <img src={post.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgOk(false)} />
        ) : (
          <span className="sa-igpost-ph"><Icon name={icon} size={30} /></span>
        )}
        <span className="sa-igpost-type"><Icon name={icon} size={13} />{label}</span>
      </div>
      <div className="sa-igpost-body">
        <div className="row between">
          <span className="row" style={{ gap: 14 }}>
            <span className="row" style={{ gap: 5 }} title={platformName === "Facebook" ? "Reactions" : "Likes"}><Icon name="heart" size={16} className="red" /><b className="strong">{post.likes == null ? "hidden" : fmt(post.likes)}</b></span>
            <span className="row" style={{ gap: 5 }} title="Comments"><Icon name="message" size={16} style={{ color: "var(--sa-primary)" }} /><b className="strong">{fmt(post.comments)}</b></span>
            {post.shares != null && <span className="row" style={{ gap: 5 }} title="Shares"><Icon name="send" size={16} className="faint" /><b className="strong">{fmt(post.shares)}</b></span>}
          </span>
          <span className="small faint">{timeAgo(post.timestamp)}</span>
        </div>
        {post.username && <div className="small strong mt-s">@{post.username}</div>}
        {caption && <p className="sa-igpost-cap small muted">{caption}</p>}
        <div className="sa-igpost-tags">
          {post.hashtags.slice(0, 14).map((t) => (
            <button key={t} type="button" onClick={() => onTagClick?.(t)}
              className={cx("sa-igtag", selected?.has(t) && "on", highlight === t && "hl")} title="Add to my selection">{t}</button>
          ))}
          {post.hashtags.length > 14 && <Pill tone="gray">+{post.hashtags.length - 14}</Pill>}
          {!post.hashtags.length && <span className="small faint">No hashtags in caption</span>}
        </div>
        {post.permalink && (
          <a className="sa-link mt-s" href={post.permalink} target="_blank" rel="noreferrer">Open on {platformName} <Icon name="arrowUpRight" size={14} /></a>
        )}
      </div>
    </article>
  );
}
