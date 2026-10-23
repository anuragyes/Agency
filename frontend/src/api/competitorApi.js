// ─────────────────────────────────────────────────────────────
// competitorApi.js — Competitor Research page (backend: routes/competitorResearchRoutes.js)
//   GET  /api/competitor-research/platforms
//   GET  /api/competitor-research/:platform/lookup?username=   one REAL profile card
//   POST /api/competitor-research                              { productId, platform, competitors, prompt } -> report
//   GET  /api/competitor-research/product/:productId           history
//   GET  /api/competitor-research/:id                          one report
//   POST /api/competitor-research/:id/approve
//   POST /api/competitor-research/:id/posts                    { ideaIndex, postId }
//   ── AI Competitor Intelligence & Content Strategy Agent (multi-agent pipeline) ──
//   GET  /api/competitor-research/agents                       agents + their skill (.md) files
//   POST /api/competitor-research/discover                     { productId, seeds, known, useAI } -> verified candidates
//   POST /api/competitor-research/pipeline                     { productId, competitors, prompt, useAI, method } -> 202 (runs in background)
//   GET  /api/competitor-research/:id/progress                 live agent progress (poll)
//   POST /api/competitor-research/:id/results                  performance analysis of published posts
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

const BASE = "/api/competitor-research";

export const listCompetitorPlatforms = () => call(`${BASE}/platforms`);
export const lookupCompetitor = (platform, username) =>
  call(`${BASE}/${encodeURIComponent(platform)}/lookup?username=${encodeURIComponent(cleanInstagramInput(username))}`).then((r) => r.data);
export const runCompetitorResearch = ({ productId, platform, competitors, prompt }) =>
  call(BASE, { method: "POST", body: { productId, platform, competitors, prompt } }).then((r) => r.data);
export const listCompetitorReports = (productId) => call(`${BASE}/product/${encodeURIComponent(productId)}`).then((r) => r.data);
export const getCompetitorReport = (id) => call(`${BASE}/${encodeURIComponent(id)}`).then((r) => r.data);
export const approveCompetitorReport = (id) => call(`${BASE}/${encodeURIComponent(id)}/approve`, { method: "POST" }).then((r) => r.data);
export const linkReportPost = (id, { ideaIndex, postId }) =>
  call(`${BASE}/${encodeURIComponent(id)}/posts`, { method: "POST", body: { ideaIndex, postId } }).then((r) => r.data);

/** "https://www.instagram.com/blue_tokai/?hl=en" | "@blue_tokai" -> "blue_tokai" */
export const cleanInstagramInput = (v) => String(v || "").trim()
  .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "").toLowerCase();

export const listIntelAgents = () => call(`${BASE}/agents`).then((r) => r.data);
export const discoverCompetitors = ({ productId, prompt, seeds, known, useAI }) =>
  call(`${BASE}/discover`, { method: "POST", body: { productId, prompt, seeds, known, useAI } }).then((r) => r.data);
export const startIntelPipeline = ({ productId, competitors, prompt, useAI, method }) =>
  call(`${BASE}/pipeline`, { method: "POST", body: { productId, platform: "instagram", competitors, prompt, useAI, method } }).then((r) => r.data);
export const getPipelineProgress = (id) => call(`${BASE}/${encodeURIComponent(id)}/progress`).then((r) => r.data);
export const analyzeReportResults = (id) => call(`${BASE}/${encodeURIComponent(id)}/results`, { method: "POST" }).then((r) => r.data);
