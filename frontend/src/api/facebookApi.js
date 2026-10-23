// ─────────────────────────────────────────────────────────────
// facebookApi.js — Facebook Page: real data + Post Studio (backend: routes/facebookRoutes.js)
// Same functions + response shapes as instagramApi.js, so the Studio / Editor / Pipeline work for both.
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
    if ((res.status === 429 || /429|rate limit|quota/i.test(msg)) && !/facebook|application request limit/i.test(msg)) msg = "The AI reached its usage limit. Wait a minute and try again.";
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Studio step 5 — reads your Page's recent posts for the brief (no LLM) -> { data: research } */
export const researchFacebookBrief = ({ productId, brief }) =>
  call("/api/facebook/brief/research", { method: "POST", body: { productId, brief } });

/** AI writes a text / image (photo) / carousel (photo album) / reel post */
export const generateFacebookPost = ({ productId, productProfile, brief, research, contentType, userPrompt }) =>
  call("/api/facebook/posts/generate", { method: "POST", body: { productId, productProfile, brief, research, contentType, userPrompt } });

export const listFacebookPosts = (productId) =>
  call(`/api/facebook/posts${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`);

export const getFacebookPost = (id) => call(`/api/facebook/posts/${id}`);

export const updateFacebookPost = (id, patch) => call(`/api/facebook/posts/${id}`, { method: "PATCH", body: patch });

export const reviseFacebookPost = (id, userPrompt, contentType) =>
  call(`/api/facebook/posts/${id}/revise`, { method: "POST", body: { userPrompt, contentType } });

export const approveFacebookPost = (id, placement = "feed") =>
  call(`/api/facebook/posts/${id}/approve`, { method: "POST", body: { placement } });

export const publishFacebookPost = (id, placement = "feed") =>
  call(`/api/facebook/posts/${id}/publish`, { method: "POST", body: { confirm: true, placement } });

/** "Schedule for later": post by itself at scheduledAt (ISO date) -> { data: post (status "scheduled") } */
export const scheduleFacebookPost = (id, scheduledAt, placement = "feed") =>
  call(`/api/facebook/posts/${id}/schedule`, { method: "POST", body: { scheduledAt, placement } });

export const unscheduleFacebookPost = (id) => call(`/api/facebook/posts/${id}/schedule`, { method: "DELETE" });

/** Upload a JPEG / PNG / MP4 / MOV -> { data: { type, url, publicReachable } } */
export const uploadFacebookMedia = (file) =>
  call("/api/facebook/media", { method: "POST", raw: true, body: file, headers: { "Content-Type": file.type } });

/** Your Page: profile, followers, engagement, recent posts -> { data: { profile, stats, recentPosts } } */
export const getFacebookAccount = (opts = 25) => {
  const limit = typeof opts === "number" ? opts : typeof opts === "object" ? opts?.limit || 25 : 25;
  const productId = typeof opts === "string" ? opts : typeof opts === "object" ? opts?.productId : undefined;
  const params = new URLSearchParams();
  if (limit) params.set("limit", limit);
  if (productId) params.set("productId", productId);
  return call(`/api/facebook/account?${params.toString()}`);
};

export const testFacebook = () => call("/api/facebook/test").then((r) => r.data);
