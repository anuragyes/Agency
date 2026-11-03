// ─────────────────────────────────────────────────────────────
// youtubeApi.js — YouTube Post Studio & Publishing API Client
// ─────────────────────────────────────────────────────────────
import { API_BASE, getAuthHeaders } from "./productApi";

async function call(path, { method = "GET", body, headers, raw } = {}) {
  let res;
  try {
    const authHeaders = getAuthHeaders();
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: raw
        ? { ...authHeaders, ...headers }
        : { "Content-Type": "application/json", ...authHeaders, ...headers },
      body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    const err = new Error(`Can't reach the Sociva server at ${API_BASE}. Is the backend running?`);
    err.offline = true;
    throw err;
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok || json?.success === false) {
    let msg = json?.message || `Request failed (${res.status})`;
    if (res.status === 429 || /429|rate limit|quota/i.test(msg)) {
      msg = "The AI reached its usage limit. Wait a minute and try again.";
    }
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** AI drafts a YouTube package: Title, Hooks, SEO Description, Chapters, Tags, Thumbnail concept */
export const generateYouTubePost = ({ productId, brief, contentType = "short", userPrompt }) =>
  call("/api/youtube/posts/generate", {
    method: "POST",
    body: { productId, brief, contentType, userPrompt },
  });

export const listYouTubePosts = (productId) =>
  call(`/api/youtube/posts${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`);

export const getYouTubePost = (id) => call(`/api/youtube/posts/${id}`);

export const updateYouTubePost = (id, patch) =>
  call(`/api/youtube/posts/${id}`, { method: "PATCH", body: patch });

export const reviseYouTubePost = (id, userPrompt, contentType) =>
  call(`/api/youtube/posts/${id}/revise`, {
    method: "POST",
    body: { prompt: userPrompt, contentType },
  });

export const approveYouTubePost = (id) =>
  call(`/api/youtube/posts/${id}/approve`, { method: "POST" });

export const publishYouTubePost = (id) =>
  call(`/api/youtube/posts/${id}/publish`, { method: "POST" });

export const scheduleYouTubePost = (id, scheduledAt) =>
  call(`/api/youtube/posts/${id}/schedule`, {
    method: "POST",
    body: { scheduledAt },
  });

export const unscheduleYouTubePost = (id) =>
  call(`/api/youtube/posts/${id}/schedule`, { method: "DELETE" });

/** Upload MP4 / MOV Video or JPEG / PNG Thumbnail (binary raw) */
export const uploadYouTubeMedia = (file) =>
  call("/api/youtube/media", {
    method: "POST",
    raw: true,
    body: file,
    headers: { "Content-Type": file.type },
  });

export const testYouTube = () => call("/api/youtube/test").then((r) => r.data);

/** Dedicated YouTube AI Thumbnail Generator */
export const generateYouTubeThumbnail = ({
  postId,
  productId,
  prompt,
  videoTitle,
  archetype = "viral-shock",
  overlayText,
  textColor,
  aspectRatio = "16:9",
  position = "left",
}) =>
  call("/api/youtube/thumbnails/generate", {
    method: "POST",
    body: {
      postId,
      productId,
      prompt,
      videoTitle,
      archetype,
      overlayText,
      textColor,
      aspectRatio,
      position,
    },
  });

export const getYouTubeThumbnailArchetypes = () =>
  call("/api/youtube/thumbnails/archetypes");

