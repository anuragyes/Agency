// ─────────────────────────────────────────────────────────────
// instagramApi.js — Instagram research + Post Studio (backend: routes/instagramRoutes.js)
// Every call returns the whole JSON body ({ success, data, assistant, research ... })
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
    if ((res.status === 429 || /429|rate limit|quota/i.test(msg)) && !/hashtag|instagram|application request limit/i.test(msg)) msg = "The AI reached its usage limit. Wait a minute and try again.";
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Step 1 — instargramAgent: hashtags, audience, ideas  -> { success, platform, research } */
export const runInstagramResearch = (productProfile) =>
  call("/api/instagram/instargramAgent/research", { method: "POST", body: productProfile });

/** Studio step 3 — Instagram agent researches the content brief (live hashtags, no LLM) -> { data: research } */
export const researchBrief = ({ productId, brief }) =>
  call("/api/instagram/brief/research", { method: "POST", body: { productId, brief } });

/** Studio step 5 (background) — start the research as a queue job -> { data: { jobId, mode: "queue"|"memory", reused } } */
export const startResearchJob = ({ productId, brief }) =>
  call("/api/instagram/brief/research/jobs", { method: "POST", body: { productId, brief } });

/** Poll a research job -> { data: { state, progress: { stage, seeds[], partialHashtags[] }, result, failedReason, hint } } */
export const getResearchJob = (jobId) => call(`/api/instagram/brief/research/jobs/${encodeURIComponent(jobId)}`);

/** Draft -> refine: swap the draft's hashtags for live ones from a finished research job -> { data: post } */
export const applyLiveHashtags = (id, { jobId, research } = {}) =>
  call(`/api/instagram/posts/${id}/live-hashtags`, { method: "POST", body: { jobId, research } });

/** Step 2 / Studio step 4 — AI writes an image post / reel / carousel.
 *  Studio flow: send { productId, brief, research } (small prompt). Legacy: { productId, instagramResearch, contentType }.
 *  Studio draft: { productId, brief, deferResearch: true } -> written from the brief only, while research still runs. */
export const generatePost = ({ productId, productProfile, instagramResearch, brief, research, deferResearch, contentType, userPrompt }) =>
  call("/api/instagram/posts/generate", {
    method: "POST",
    body: { productId, productProfile, instagramResearch, brief, research, deferResearch, contentType, userPrompt },
  });

export const listPosts = (productId) =>
  call(`/api/instagram/posts${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`);

export const getPost = (id) => call(`/api/instagram/posts/${id}`);

/** Manual edits: { content: {...}, media: [...], coverUrl } */
export const updatePost = (id, patch) => call(`/api/instagram/posts/${id}`, { method: "PATCH", body: patch });

/** AI edit with the user's prompt (optionally switch format) */
export const revisePost = (id, userPrompt, contentType) =>
  call(`/api/instagram/posts/${id}/revise`, { method: "POST", body: { userPrompt, contentType } });

/** placement: "feed" (post / reel / carousel) | "story" — only changes the media check + the question asked */
export const approvePost = (id, placement = "feed") => call(`/api/instagram/posts/${id}/approve`, { method: "POST", body: { placement } });

/** Only after the user said "Yes, upload". placement "story" -> Instagram Story (first image/video, no caption) */
export const publishPost = (id, placement = "feed") =>
  call(`/api/instagram/posts/${id}/publish`, { method: "POST", body: { confirm: true, placement } });

/** "Schedule for later": publish by itself at scheduledAt (ISO date) -> { data: post (status "scheduled") }. Call again to move it. */
export const schedulePost = (id, scheduledAt, placement = "feed") =>
  call(`/api/instagram/posts/${id}/schedule`, { method: "POST", body: { scheduledAt, placement } });

/** Cancel the schedule -> { data: post (status "approved") } */
export const unschedulePost = (id) => call(`/api/instagram/posts/${id}/schedule`, { method: "DELETE" });

/** Upload a JPEG / MP4 / MOV -> { data: { type, url, publicReachable } } */
export const uploadMedia = (file) =>
  call("/api/instagram/media", { method: "POST", raw: true, body: file, headers: { "Content-Type": file.type } });

/* ── Real Instagram data (official Graph API) ── */

/** Your account: profile, followers, engagement rate, recent posts -> { data: { profile, stats, recentPosts } } */
export const getInstagramAccount = (opts = 25) => {
  const limit = typeof opts === "number" ? opts : typeof opts === "object" ? opts?.limit || 25 : 25;
  const productId = typeof opts === "string" ? opts : typeof opts === "object" ? opts?.productId : undefined;
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (productId) params.set("productId", productId);
  return call(`/api/instagram/account?${params.toString()}`);
};

/** Audience page: demographics, online times, reach (30d), formats, comment sentiment
 *  -> { data: { profile, demographics, online, activity, formats, posts, sentiment, errors? } } */
export const getInstagramAudience = (refresh = false) => call(`/api/instagram/audience${refresh ? "?refresh=1" : ""}`);


/** Real hashtags used together with a brand / keyword on Instagram (backend: GET /api/instagram/instagram/hashtag-search?q=)
 *  -> { success, hashtag, hashtagId, hashtags: ["#snitchbrand", ...], source, fetchedAt } */
export const searchHashtags = (q) =>
  call(`/api/instagram/instagram/hashtag-search?q=${encodeURIComponent(String(q || "").trim())}`);


/** A Business/Creator account (competitor / top brand): posts, engagement and hashtags */
export const getInstagramCompetitor = (username) =>
  call(`/api/instagram/competitor?username=${encodeURIComponent(username)}`);

/** Live insights (reach, saved) + real comments for any media ID -> { data: { reach, saved, comments, likes, ... } } */
export const getInstagramMediaDetails = (mediaId) =>
  call(`/api/instagram/media/${encodeURIComponent(mediaId)}/details`);
