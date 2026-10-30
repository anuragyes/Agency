// ─────────────────────────────────────────────────────────────
// app/api.js — every backend call the new app uses, in one place.
// Product + Instagram calls are re-exported from src/api/*, the rest is new.
//
// Backend routes used (backend/server.js):
//   GET  /                                         health check
//   POST /api/products                              Product AI Agent (Brand Brain)
//   GET  /api/products/getProduct                   list products (= workspaces / brands)
//   GET  /api/products/getIdProduct/:id             one product
//   POST /api/market-research/:productId            start market research (5 platforms)
//   GET  /api/market-research/product/:id/latest    newest run for a product
//   GET  /api/instagram/test                        Instagram connection check
//   POST /api/content/brief                         Studio step 1: prompt + platform -> compact JSON brief
//   POST /api/instagram/brief/research              Studio step 3: Instagram agent researches the brief (live, no LLM)
//   POST /api/instagram/instargramAgent/research    Instagram research agent (legacy, full LLM research)
//   /api/instagram/posts…                           Post Studio (generate / edit / revise / approve / publish)
//   POST /api/instagram/media                       upload JPEG / MP4 / MOV
//   GET  /api/instagram/account                     real profile + engagement (Accounts page)
//   GET  /api/instagram/instagram/hashtag-search?q=  real hashtags for a brand / keyword (Content Editor)
//   GET  /api/hashtags/platforms                    hashtag platforms (Instagram live, others ready for their API)
//   POST /api/hashtags/:platform/explore            real hashtags + top / recent posts (Hashtags page)
//   GET  /api/hashtags/:platform/quota              API searches used (Instagram: x / 30 per week)
//   GET  /api/instagram/competitor?username=        a brand's posts, engagement and hashtags
//   GET  /api/instagram/audience                    real audience: demographics, online times, reach, formats, sentiment
//   /api/competitor-research/…                      Competitor Research page (real data + grounded AI report)
//   /api/facebook/…                                 Facebook Page: test, account, brief research, posts (same flow as Instagram)
// ─────────────────────────────────────────────────────────────
import { API_BASE, analyzeProduct, getProduct, listProducts } from "../api/productApi";
import {
  approvePost,
  generatePost,
  getPost,
  listPosts,
  publishPost,
  schedulePost,
  unschedulePost,
  revisePost,
  runInstagramResearch,
  researchBrief,
  startResearchJob,
  getResearchJob,
  applyLiveHashtags,
  updatePost,
  uploadMedia,
  getInstagramAccount,
  searchHashtags,
  getInstagramCompetitor,
  getInstagramAudience,
  getInstagramMediaDetails,
} from "../api/instagramApi";
import { exploreHashtags, getHashtagQuota, listHashtagPlatforms } from "../api/hashtagApi";
import {
  approveFacebookPost,
  generateFacebookPost,
  getFacebookAccount,
  getFacebookPost,
  listFacebookPosts,
  publishFacebookPost,
  scheduleFacebookPost,
  unscheduleFacebookPost,
  researchFacebookBrief,
  reviseFacebookPost,
  testFacebook,
  updateFacebookPost,
  uploadFacebookMedia,
} from "../api/facebookApi";
import {
  approveCompetitorReport,
  getCompetitorReport,
  linkReportPost,
  listCompetitorPlatforms,
  listCompetitorReports,
  lookupCompetitor,
  runCompetitorResearch,
  cleanInstagramInput,
  listIntelAgents,
  discoverCompetitors,
  startIntelPipeline,
  getPipelineProgress,
  analyzeReportResults,
} from "../api/competitorApi";

export {
  API_BASE,
  analyzeProduct,
  getProduct,
  listProducts,
  approvePost,
  generatePost,
  getPost,
  listPosts,
  publishPost,
  revisePost,
  runInstagramResearch,
  researchBrief,
  startResearchJob,
  getResearchJob,
  applyLiveHashtags,
  updatePost,
  uploadMedia,
  getInstagramAccount,
  searchHashtags,
  getInstagramCompetitor,
  getInstagramAudience,
  getInstagramMediaDetails,
  exploreHashtags,
  getHashtagQuota,
  listHashtagPlatforms,
  approveCompetitorReport,
  getCompetitorReport,
  linkReportPost,
  listCompetitorPlatforms,
  listCompetitorReports,
  lookupCompetitor,
  runCompetitorResearch,
  cleanInstagramInput,
  listIntelAgents,
  discoverCompetitors,
  startIntelPipeline,
  getPipelineProgress,
  analyzeReportResults,
  getFacebookAccount,
  testFacebook,
};

async function call(path, { method = "GET", body, headers: customHeaders } = {}) {
  let res;
  let authHeaders = {};
  try {
    const token = localStorage.getItem("sociva_token");
    if (token) authHeaders = { Authorization: `Bearer ${token}` };
  } catch {
    /* ignore */
  }

  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(customHeaders || {}),
      },
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
    console.log("Something Went wrong")
  }
  if (!res.ok || json?.success === false) {
    let msg = json?.message || `Request failed (${res.status})`;
    if (res.status === 429 || /429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) msg = "The AI reached its usage limit. Wait a minute and try again.";
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return json;
}

/** Is the backend up? -> true / false (never throws) */
export async function pingBackend() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`${API_BASE}/`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

/* ── Market research (Phase 2) ── */
export const MARKET_PLATFORMS = ["instagram", "youtube", "facebook", "whatsapp", "pinterest"];

export const startMarketResearch = (productId, platforms) =>
  call(`/api/market-research/${productId}`, { method: "POST", body: platforms?.length ? { platforms } : {} }).then((r) => r.data);

export const getLatestMarketResearch = (productId) =>
  call(`/api/market-research/product/${productId}/latest`).then((r) => r.data);

/** Project-specific Google Trends interest-over-time data. */
export const getProjectTrends = ({ terms, geo = "" }) =>
  call("/api/trends/topics", { method: "POST", body: { terms, geo } }).then((r) => r.data);

/* ── Instagram connection ── */
export const testInstagram = () => call("/api/instagram/test").then((r) => r.data);


/* ── Studio flow: prompt -> optimize -> JSON -> platform -> researcher -> ready to post ── */
// Same list as backend/ai/contentBrief/PlatformBriefSpecs.js (live = researcher + publish backend exists)
export const STUDIO_PLATFORMS = [
  { key: "instagram", label: "Instagram", formats: ["carousel", "image", "reel"], live: true },
  { key: "youtube", label: "YouTube", formats: ["short", "video"], live: false },
  { key: "facebook", label: "Facebook", formats: ["text", "image", "carousel", "reel"], live: true },
  { key: "linkedin", label: "LinkedIn", formats: ["post", "carousel", "article"], live: false },
  { key: "x", label: "X", formats: ["post", "thread"], live: false },
];

/** Steps 2 + 3 — LLM optimizes the prompt, finds the important words, returns ONE small JSON -> { data, usage } */
export const createBrief = ({ productId, userPrompt }) =>
  call("/api/content/brief", { method: "POST", body: { productId, userPrompt } });

/** Make Your Project: name, description, and websiteUrl -> AI crawls website + builds RAG Markdown knowledge */
export const createProject = ({ name, description, websiteUrl }) =>
  call("/api/products", { method: "POST", body: { name, description, websiteUrl } }).then((r) => r.data);

/** Get project brand knowledge Markdown and chunks */
export const getProductKnowledge = (productId) =>
  call(`/api/products/${productId}/knowledge`).then((r) => r.data);

/** Update full Markdown knowledge base */
export const updateProductKnowledge = (productId, { knowledgeMd }) =>
  call(`/api/products/${productId}/knowledge`, { method: "PUT", body: { knowledgeMd } });

/** Add a new chunk to project knowledge base (incremental update) */
export const addKnowledgeChunk = (productId, { title, content, category, tags }) =>
  call(`/api/products/${productId}/knowledge/chunks`, { method: "POST", body: { title, content, category, tags } });

/** Update an existing knowledge chunk */
export const updateKnowledgeChunk = (productId, chunkId, { title, content, category, tags }) =>
  call(`/api/products/${productId}/knowledge/chunks/${chunkId}`, { method: "PUT", body: { title, content, category, tags } });

/** Delete a knowledge chunk */
export const deleteKnowledgeChunk = (productId, chunkId) =>
  call(`/api/products/${productId}/knowledge/chunks/${chunkId}`, { method: "DELETE" });

/* The Studio flow survives a trip to the Editor and back (per product, this browser tab only) */
const FKEY = (pid) => `sociva.studioFlow.${pid || "none"}`;
export const readStudioFlow = (pid) => {
  try {
    return JSON.parse(sessionStorage.getItem(FKEY(pid)));
  } catch {
    return null;
  }
};
export const saveStudioFlow = (pid, flow) => {
  try {
    if (flow) sessionStorage.setItem(FKEY(pid), JSON.stringify(flow));
    else sessionStorage.removeItem(FKEY(pid));
  } catch {
    /* storage blocked */
  }
};

/* ── One post API per platform: the Studio, Editor and Pipeline call postApi(post.platform).xxx ── */
const POST_APIS = {
  // startResearchJob / getResearchJob / applyLiveHashtags: Instagram only (queue + draft -> refine). Facebook keeps the one-call flow.
  instagram: { researchBrief, startResearchJob, getResearchJob, applyLiveHashtags, generatePost, getPost, updatePost, revisePost, approvePost, publishPost, schedulePost, unschedulePost, uploadMedia, listPosts },
  facebook: {
    researchBrief: researchFacebookBrief,
    generatePost: generateFacebookPost,
    getPost: getFacebookPost,
    updatePost: updateFacebookPost,
    revisePost: reviseFacebookPost,
    approvePost: approveFacebookPost,
    publishPost: publishFacebookPost,
    schedulePost: scheduleFacebookPost,
    unschedulePost: unscheduleFacebookPost,
    uploadMedia: uploadFacebookMedia,
    listPosts: listFacebookPosts,
  },
};
export const POST_PLATFORMS = Object.keys(POST_APIS);
export const postApi = (platform) => POST_APIS[platform] || POST_APIS.instagram;

/** Instagram + Facebook drafts/published posts in one list (newest first). One platform failing doesn't hide the other. */
export async function listAllPosts(productId) {
  const results = await Promise.allSettled(POST_PLATFORMS.map((p) => POST_APIS[p].listPosts(productId)));
  if (!results.some((r) => r.status === "fulfilled")) throw results[0].reason;
  const data = results.flatMap((r, i) => (r.status === "fulfilled" ? (r.value.data || []).map((d) => ({ ...d, platform: d.platform || POST_PLATFORMS[i] })) : []));
  data.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { success: true, data };
}

/* ── Unified Inbox API (Webhooks -> Filter -> BullMQ Queue -> AI Agent -> Socket.IO) ── */
export const syncInboxConversations = () =>
  call("/api/inbox/sync", { method: "POST" });

export const getInboxConversations = ({ folder = "all", channel, q } = {}) => {
  const params = new URLSearchParams();
  if (folder && folder !== "all") params.set("folder", folder);
  if (channel) params.set("channel", channel);
  if (q) params.set("q", q);
  const qs = params.toString();
  return call(`/api/inbox/conversations${qs ? "?" + qs : ""}`);
};

export const getInboxMessages = (conversationId) =>
  call(`/api/inbox/conversations/${conversationId}/messages`);

export const sendInboxReply = (conversationId, { text, isAiSuggestion = false }) =>
  call(`/api/inbox/conversations/${conversationId}/reply`, {
    method: "POST",
    body: { text, isAiSuggestion },
  });

export const updateInboxConversation = (conversationId, updates) =>
  call(`/api/inbox/conversations/${conversationId}`, {
    method: "PATCH",
    body: updates,
  });

export const getInboxStats = () => call("/api/inbox/stats");

export const toggleInboxAutoReply = (enabled) =>
  call("/api/inbox/auto-reply", {
    method: "POST",
    body: { enabled },
  });

export const simulateInboxWebhook = (payload) =>
  call("/api/inbox/simulate", {
    method: "POST",
    body: payload,
  });

/* ── Multi-tenant OAuth & Connected Accounts API ── */
export const getConnectedAccounts = (productId) =>
  call(`/api/auth/accounts${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`);

export const disconnectAccount = (accountId) =>
  call(`/api/auth/accounts/${accountId}`, { method: "DELETE" });

export const getMetaConnectUrl = (productId) =>
  call(`/api/auth/meta/connect${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`, {
    headers: { Accept: "application/json" },
  });

/* ── YouTube Channel API (YouTube Data API v3) ── */
export const getYoutubeAccount = (productId) =>
  call(`/api/youtube/account${productId ? `?productId=${encodeURIComponent(productId)}` : ""}`);

export const connectYoutubeChannel = ({ channelQuery, productId }) =>
  call("/api/youtube/connect", {
    method: "POST",
    body: { channelQuery, productId },
  });

export const disconnectYoutubeChannel = (productId) =>
  call("/api/youtube/disconnect", {
    method: "POST",
    body: { productId },
  });

export const testYoutube = () => call("/api/youtube/test");



