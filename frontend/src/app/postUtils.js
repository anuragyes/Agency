// postUtils.js — helpers for post documents (backend/models/InstagramPost.js + FacebookPost.js)
// Every post from the API carries `platform` ("instagram" | "facebook").

export const STATUS_META = {
  draft: { label: "Needs review", tone: "amber", icon: "pen" },
  approved: { label: "Approved", tone: "violet", icon: "checkCircle" },
  scheduled: { label: "Scheduled", tone: "violet", icon: "calendar" },
  publishing: { label: "Publishing…", tone: "blue", icon: "upload" },
  published: { label: "Published", tone: "green", icon: "checkCircle" },
  failed: { label: "Failed", tone: "red", icon: "alert" },
};

export const TYPE_META = {
  text: { label: "Text post", icon: "pen" },
  image: { label: "Image post", icon: "image" },
  reel: { label: "Reel", icon: "video" },
  carousel: { label: "Carousel", icon: "carousel" },
};

/* Per-platform names + rules used by the Studio, Editor and Pipeline */
export const PLATFORM_META = {
  instagram: {
    label: "Instagram",
    types: [["image", "Image post"], ["carousel", "Carousel"], ["reel", "Reel"]],
    maxTags: 6, minTags: 1, captionLimit: 2200, liveHashtagSearch: true, grid: true,
    accept: "image/jpeg,video/mp4,video/quicktime", mimes: ["image/jpeg", "video/mp4", "video/quicktime"],
    mediaHint: "Add JPEG / MP4", badFile: "Use a JPEG image or an MP4/MOV video — Instagram's API doesn't accept PNG/WebP.",
    where: { feed: "Instagram feed", story: "Instagram Story" },
  },
  facebook: {
    label: "Facebook",
    types: [["text", "Text post"], ["image", "Photo post"], ["carousel", "Photo album"], ["reel", "Reel"]],
    maxTags: 5, minTags: 0, captionLimit: 5000, liveHashtagSearch: false, grid: false,
    accept: "image/jpeg,image/png,video/mp4,video/quicktime", mimes: ["image/jpeg", "image/png", "video/mp4", "video/quicktime"],
    mediaHint: "Add JPEG / PNG / MP4", badFile: "Use a JPEG or PNG image, or an MP4/MOV video.",
    where: { feed: "Facebook Page", story: "Facebook Page Story" },
  },
};
export const platformOf = (p) => (p?.platform && PLATFORM_META[p.platform] ? p.platform : "instagram");
export const platformMeta = (p) => PLATFORM_META[platformOf(p)];

/** "Photo album" on Facebook, "Carousel" on Instagram ... */
export const typeLabel = (p) => {
  const t = (platformMeta(p).types.find(([k]) => k === p?.contentType) || [])[1];
  return t || TYPE_META[p?.contentType]?.label || p?.contentType || "";
};

/** Link to the Content Editor — Facebook posts carry ?platform=facebook */
export const editorPath = (p) => {
  const id = p?._id || p?.id;
  const platform = p?.platform;
  return `/app/editor/${id}${platform && platform !== "instagram" ? `?platform=${platform}` : ""}`;
};

/** Where the published result lives: post.instagram or post.facebook */
export const publishInfo = (p) => (platformOf(p) === "facebook" ? p?.facebook : p?.instagram) || {};

/* ── "Schedule for later" — date + time inputs use the browser's local time zone ── */
const pad2 = (n) => String(n).padStart(2, "0");
export const toDateInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const toTimeInput = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
/** { date: "2026-10-18", time: "19:15" } -> Date | null */
export const fromScheduleInputs = ({ date, time } = {}) => {
  if (!date || !time) return null;
  const d = new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime()) ? null : d;
};
/** Inputs for the post's current schedule, or tomorrow 7:15 PM */
export const defaultSchedule = (at) => {
  let d = at ? new Date(at) : null;
  if (!d || Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) {
    d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 15, 0, 0);
  }
  return { date: toDateInput(d), time: toTimeInput(d) };
};
/** null when OK, else what's wrong (same rules as the backend: 1 min – 12 months ahead) */
export const scheduleError = (v) => {
  const d = fromScheduleInputs(v);
  if (!d) return "Pick a date and a time.";
  if (d.getTime() < Date.now() + 60_000) return "Pick a time in the future (at least 1 minute from now).";
  if (d.getTime() > Date.now() + 365 * 86_400_000) return "Pick a date within the next 12 months.";
  return null;
};
/** "Sat, 18 Oct, 7:15 PM" */
export const formatSchedule = (at) =>
  at ? new Date(at).toLocaleString("en", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
/** "in 2 h 5 min" / "in 3 days" */
export const timeUntil = (at) => {
  const ms = new Date(at).getTime() - Date.now();
  if (!(ms > 0)) return "any moment now";
  const min = Math.round(ms / 60_000);
  if (min < 60) return `in ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `in ${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  return `in ${Math.round(h / 24)} days`;
};
/** Has a date & time that hasn't come yet */
export const hasUpcomingSchedule = (p) => !!p?.scheduledAt && new Date(p.scheduledAt).getTime() > Date.now();

export const postTitle = (p) =>
  p?.content?.title || p?.content?.visual?.onImageText || p?.content?.hook || "Untitled post";

export const coverText = (p) =>
  p?.content?.reel?.coverText || p?.content?.carousel?.slides?.[0]?.headline || p?.content?.visual?.onImageText || p?.content?.title || p?.content?.hook || "";

/**
 * Quick client-side quality score (0-100) + checklist.
 * Mirrors the validator rules (hook, caption length, 1-6 hashtags, visual brief) plus best practices.
 */
export function scorePost(p) {
  const c = p?.content || {};
  const caption = c.caption || "";
  const checks = [];
  let score = 50;
  const hook = (c.hook || caption.split("\n")[0] || "").trim();
  if (hook && hook.length <= 125) { score += 12; checks.push({ ok: true, text: "Strong hook in first line" }); }
  else checks.push({ ok: false, text: hook ? "Hook is long — keep it under 125 chars" : "Add a hook" });
  if (/\d/.test(hook)) { score += 6; checks.push({ ok: true, text: "Hook opens with a number" }); }
  const tags = c.hashtags || [];
  if (platformOf(p) === "facebook") {
    // Facebook: few hashtags work best; a question invites comments
    if (tags.length <= 3) { score += 10; checks.push({ ok: true, text: tags.length ? `${tags.length} light hashtags (Facebook needs few)` : "No hashtag clutter (fine on Facebook)" }); }
    else checks.push({ ok: false, text: `Use 0–3 hashtags on Facebook (now ${tags.length})` });
    if (/\?/.test(caption)) { score += 4; checks.push({ ok: true, text: "Asks a question — invites comments" }); }
  } else if (tags.length >= 3 && tags.length <= 6) { score += 10; checks.push({ ok: true, text: `${tags.length} focused hashtags` }); }
  else checks.push({ ok: false, text: tags.length ? `Use 3–6 hashtags (now ${tags.length})` : "Add 3–6 hashtags" });
  if (c.callToAction) { score += 8; checks.push({ ok: true, text: "Clear call-to-action" }); }
  else checks.push({ ok: false, text: "Add a call-to-action" });
  const len = (p?.finalCaption || caption).length;
  if (len > 80 && len < 1600) score += 6;
  if (p?.contentType === "text") score += 5; // no image -> no alt text needed
  else if (c.altText) { score += 5; checks.push({ ok: true, text: "Alt text added" }); }
  else checks.push({ ok: false, text: "Add alt text for accessibility", fix: "altText" });
  if (p?.contentType === "text") score += 3; // a Facebook text post needs no media
  else if (p?.media?.length) { score += 3; checks.push({ ok: true, text: `${p.media.length} media file${p.media.length > 1 ? "s" : ""} attached` }); }
  else checks.push({ ok: false, text: "Attach media before publishing", fix: "media" });
  return { score: Math.min(99, score), checks };
}

export const predictReach = (score) => {
  const lo = Math.round(score * 0.42);
  return `${lo}–${Math.round(lo * 1.35)}K`;
};
