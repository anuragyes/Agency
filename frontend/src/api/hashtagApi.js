// ─────────────────────────────────────────────────────────────
// hashtagApi.js — REAL hashtag data per social platform (backend: routes/hashtagRoutes.js)
//   GET  /api/hashtags/platforms              -> { data: [{ id, name, implemented, configured, features, ... }] }
//   POST /api/hashtags/:platform/explore      { seeds }    "Find real hashtags"
//   GET  /api/hashtags/:platform/quota        -> { data: { used, limit, remaining } | null }
// ─────────────────────────────────────────────────────────────
import { API_BASE, getAuthHeaders } from "./productApi";

async function call(path, { method = "GET", body } = {}) {
  let res;
  try {
    const authHeaders = getAuthHeaders();
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
    const err = new Error(json?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const enc = (platform) => encodeURIComponent(String(platform || "instagram").toLowerCase());

/** Which platforms exist and which are live -> [{ id, name, implemented, configured, features, source, quotaNote, notes }] */
export const listHashtagPlatforms = () => call("/api/hashtags/platforms").then((r) => r.data);

/** Hashtags + the real top / recent posts behind them. seeds: "ghee, desi ghee" or ["ghee", "desi ghee"] */
export const exploreHashtags = (platform, seeds) =>
  call(`/api/hashtags/${enc(platform)}/explore`, { method: "POST", body: { seeds } });

/** API searches used (null when the platform has no limit) -> { data } */
export const getHashtagQuota = (platform) => call(`/api/hashtags/${enc(platform)}/quota`);
