// ─────────────────────────────────────────────────────────────
// imageGenApi.js — AI product ad images (backend: routes/imageGenRoutes.js) + brand logo (routes/productRoutes.js)
// Flow: prompt -> up to 4 photos in different styles (createAdImageSet) -> pick one (image post) or several (carousel)
// Every call returns the whole JSON body ({ success, data, assistant })
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
    if (res.status === 429 || /rate limit|quota|RESOURCE_EXHAUSTED/i.test(msg)) msg = "The AI reached its usage limit. Wait a minute and try again.";
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** compositions / product shapes / aspect ratios / font pairs (fontPairs[].heading.url = /fonts/... on the backend) */
export const getImageGenOptions = () => call("/api/image-gen/options");

/** Where media is kept -> { data: { cloud: true|false, provider: "cloudinary"|"local" } } */
export const getMediaStorage = () => call("/api/image-gen/storage");

/** Is the photo engine ready? -> { data: { ok, provider, label, detail, problems[] } } */
export const getImageGenHealth = () => call("/api/image-gen/health");

/**
 * MAIN FLOW: prompt -> up to 4 photos in different styles (no sketch step).
 * Answers at once -> { data: { batchId, mode, items: [job (status "generating")] } }; poll listAdImages({ batchId }) until done.
 * mode: "product" (your real product photo in each scene) | "scene" | "" (auto)
 * Brand kit: purpose "social" | "ad" (logo 15–22 % / 18–25 % wide), logoCorner "top-left" | "bottom-right" (same for the whole set)
 */
export const createAdImageSet = ({ prompt, productId, postId, platform, aspectRatio, count = 4, mode, purpose, logoCorner }) =>
  call("/api/image-gen/batch", {
    method: "POST",
    body: { prompt, productId, postId, platform, aspectRatio, count, mode: mode || undefined, purpose: purpose || undefined, logoCorner: logoCorner || undefined },
  });

/**
 * Same photos, new text and/or font (and the current logo) -> { data: { batchId, items } } — no AI call, ~1 s per image.
 *   ids      only these images of the set (default: all of them)
 *   refresh  true = just redraw text + the current logo (after a logo upload / delete)
 */
export const updateAdImageSetTexts = (batchId, { texts, fontPair, ids, refresh } = {}) =>
  call(`/api/image-gen/batch/${batchId}/texts`, {
    method: "POST",
    body: { ...(texts ? { texts } : {}), ...(fontPair ? { fontPair } : {}), ...(ids?.length ? { ids } : {}), ...(refresh ? { refresh: true } : {}) },
  });

/** (legacy sketch flow) 1. prompt -> AI layout + SVG preview */
export const createAdLayout = ({ prompt, productId, postId, platform, aspectRatio }) =>
  call("/api/image-gen/layout", { method: "POST", body: { prompt, productId, postId, platform, aspectRatio } });

export const listAdImages = ({ productId, postId, batchId } = {}) => {
  const q = new URLSearchParams();
  if (batchId) q.set("batchId", batchId);
  if (productId) q.set("productId", productId);
  if (postId) q.set("postId", postId);
  return call(`/api/image-gen?${q}`);
};
export const getAdImage = (id) => call(`/api/image-gen/${id}`);

/** 2a. AI changes the layout from feedback */
export const reviseAdLayout = (id, feedback) => call(`/api/image-gen/${id}/revise`, { method: "POST", body: { feedback } });
/** 2b. manual edits: { texts, composition, productShape, aspectRatio, palette, sdPrompt } */
export const editAdLayout = (id, patch) => call(`/api/image-gen/${id}/layout`, { method: "PATCH", body: patch });
/** 3. approve the sketch */
export const approveAdLayout = (id) => call(`/api/image-gen/${id}/approve`, { method: "POST" });
/** 4. photo (opts.mode: product | scene | sketch) -> typography + logo -> JPEG  (10–90 s) */
export const generateAdImage = (id, opts = {}) => call(`/api/image-gen/${id}/generate`, { method: "POST", body: opts });
/** same photo, new text / logo */
export const composeAdImage = (id) => call(`/api/image-gen/${id}/compose`, { method: "POST" });

/** Brand logo (PNG / JPEG / WebP / SVG) -> { data: { logoUrl, product } } — replaces the icon (only one is used) */
export const uploadProductLogo = (productId, file) =>
  call(`/api/products/${productId}/logo`, { method: "POST", raw: true, headers: { "Content-Type": file.type }, body: file });
export const removeProductLogo = (productId) => call(`/api/products/${productId}/logo`, { method: "DELETE" });

/** Brand icon (PNG / JPEG / WebP / SVG) -> { data: { iconUrl, product } } — used INSTEAD of the logo (uploading it removes the logo) */
export const uploadProductIcon = (productId, file) =>
  call(`/api/products/${productId}/icon`, { method: "POST", raw: true, headers: { "Content-Type": file.type }, body: file });
export const removeProductIcon = (productId) => call(`/api/products/${productId}/icon`, { method: "DELETE" });

/** Real product photo (JPEG / PNG / WebP) — placed into AI scenes so the label stays exact -> { data: { photoUrl, product } } */
export const uploadProductPhoto = (productId, file) =>
  call(`/api/products/${productId}/photo`, { method: "POST", raw: true, headers: { "Content-Type": file.type }, body: file });
export const removeProductPhoto = (productId) => call(`/api/products/${productId}/photo`, { method: "DELETE" });
