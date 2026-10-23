// ─────────────────────────────────────────────────────────────
// productApi.js — talks to the Sociva backend (Phase 1: Product AI Agent)
// Backend routes (backend/Routers/ProductRouters.js):
//   POST /api/products                    -> run the AI agent + save  { success, data: product }
//   GET  /api/products/getProduct         -> list products            { success, data: [product] }
//   GET  /api/products/getIdProduct/:id   -> one product              { success, data: product }
// Set VITE_API_URL in frontend/.env to point somewhere else (default http://localhost:5000)
// ─────────────────────────────────────────────────────────────

export const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

function friendlyMessage(msg, status) {
  if (status === 429 || /429|rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
    return "The AI reached its usage limit (Gemini free tier). Wait a minute and try again.";
  }
  if (/Product AI Agent failed/i.test(msg)) {
    return "The AI couldn't read that description. Try again, or add a bit more detail.";
  }
  return msg;
}

export function getAuthHeaders() {
  try {
    const token = localStorage.getItem("sociva_token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function request(path, options = {}) {
  let res;
  try {
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(options.headers || {}),
    };
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    const err = new Error(`Can't reach the Sociva server at ${API_BASE}. Is the backend running?`);
    err.offline = true;
    throw err;
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || body?.success === false) {
    const raw = body?.message || `Request failed (${res.status})`;
    const err = new Error(friendlyMessage(raw, res.status));
    err.status = res.status;
    err.raw = raw;
    throw err;
  }
  return body?.data;
}

/** Run the Product AI Agent on a free-text description and save it */
export const analyzeProduct = (description) =>
  request("/api/products", { method: "POST", body: JSON.stringify({ description }) });

/** All saved products, newest first */
export const listProducts = () => request("/api/products/getProduct");

/** One saved product by Mongo _id */
export const getProduct = (id) => request(`/api/products/getIdProduct/${encodeURIComponent(id)}`);
