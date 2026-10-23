// ─────────────────────────────────────────────────────────────
// cloudflareImageClient.js — FREE image generation on Cloudflare Workers AI (no credit card)
//   Free plan: 10,000 "neurons" per day, resets daily (UTC). One 1024x1280 image costs about:
//     @cf/black-forest-labs/flux-2-klein-4b  ~156 neurons  -> ~60 free images / day   (DEFAULT — takes reference images)
//     @cf/black-forest-labs/flux-1-schnell   ~38 neurons   -> ~250 free images / day  (text only, lower quality)
//   FLUX.2 [klein] takes up to 4 reference images (each < 512x512) -> your real product photo goes in.
//
//   POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}
//   .env:
//     CLOUDFLARE_ACCOUNT_ID=...        dash.cloudflare.com -> Workers & Pages -> Account ID (right side)
//     CLOUDFLARE_API_TOKEN=...         My Profile -> API Tokens -> Create Token -> template "Workers AI"
//     CLOUDFLARE_IMAGE_MODEL=@cf/black-forest-labs/flux-2-klein-4b   (optional)
// ─────────────────────────────────────────────────────────────
const sharp = require("sharp");

const env = (k, d) => (process.env[k] != null && String(process.env[k]).trim() !== "" ? String(process.env[k]).trim() : d);
const BASE = () => env("CLOUDFLARE_API_URL", "https://api.cloudflare.com/client/v4").replace(/\/$/, "");
const accountId = () => env("CLOUDFLARE_ACCOUNT_ID", "");
const token = () => env("CLOUDFLARE_API_TOKEN", "");
const modelId = () => env("CLOUDFLARE_IMAGE_MODEL", "@cf/black-forest-labs/flux-2-klein-4b");
/** FLUX.2 models take multipart + reference images; FLUX.1 schnell takes JSON, text only */
const isFlux2 = (m) => /flux-2/i.test(m);

/** Output size per aspect ratio (multiples of 16, each side 256–1920) */
const SIZES = { "1:1": [1280, 1280], "4:5": [1024, 1280], "9:16": [1024, 1824] };

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const withTimeout = async (fn, ms, what) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fn(ctrl.signal);
    } catch (err) {
        if (err.name === "AbortError") throw httpError(504, `Cloudflare did not answer within ${Math.round(ms / 1000)}s (${what}).`);
        if (err.statusCode) throw err;
        throw httpError(503, `Can't reach Cloudflare (${err.message}). Check your internet connection.`);
    } finally {
        clearTimeout(t);
    }
};

const readJson = async (res) => {
    try {
        return await res.json();
    } catch {
        return null;
    }
};

/** Cloudflare error JSON -> one readable sentence */
const explain = (status, body) => {
    const e = body?.errors?.[0] || {};
    const msg = e.message || body?.message || "";
    if (status === 401 || status === 403 || /authentication|unauthorized|invalid api token/i.test(msg)) {
        return httpError(502, "Cloudflare rejected the token. Create one with the “Workers AI” template and check CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in backend/.env.");
    }
    if (status === 429 || /daily free allocation|neurons|capacity|rate limit/i.test(msg)) {
        return httpError(429, "Today's free Cloudflare quota is used up (10,000 neurons/day ≈ 60 images). It resets at 00:00 UTC (5:30 AM India time).");
    }
    if (/nsfw|safety/i.test(msg)) return httpError(422, "Cloudflare's safety filter blocked this image. Change the prompt and try again.");
    return httpError(502, `Cloudflare Workers AI error ${status}${msg ? `: ${msg}` : ""}${e.code ? ` (code ${e.code})` : ""}`);
};

const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

/** -> { ok, model, problems[] } — checks the token + account can see the model */
const health = async ({ fetchImpl = fetch } = {}) => {
    const out = { ok: false, model: modelId(), problems: [] };
    if (!accountId() || !token()) {
        out.problems.push("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in backend/.env (free Cloudflare account, no card) and restart the backend.");
        return out;
    }
    try {
        const name = modelId().split("/").pop();
        const res = await withTimeout(
            (signal) => fetchImpl(`${BASE()}/accounts/${accountId()}/ai/models/search?search=${encodeURIComponent(name)}`, { headers: authHeaders(), signal }),
            15000,
            "models"
        );
        const body = await readJson(res);
        if (!res.ok || body?.success === false) throw explain(res.status, body);
        const found = (body?.result || []).some((m) => m.name === modelId());
        if (!found) out.problems.push(`Model ${modelId()} isn't available on Workers AI. Remove CLOUDFLARE_IMAGE_MODEL from .env to use the default.`);
    } catch (err) {
        out.problems.push(err.message);
    }
    out.ok = out.problems.length === 0;
    return out;
};

/** Reference images must be smaller than 512x512 on FLUX.2 [klein] */
const toReference = (buf) => sharp(buf).rotate().resize(511, 511, { fit: "inside" }).flatten({ background: "#ffffff" }).png().toBuffer();

/**
 * Prompt (+ up to 4 reference images) -> one image.
 * @param {Object} a { prompt, images: [{ data: Buffer }], aspectRatio, seed }
 * @returns {Promise<{ image: Buffer, model, ms }>}
 */
const generateImage = async ({ prompt, images = [], aspectRatio = "4:5", seed }, { fetchImpl = fetch } = {}) => {
    if (!accountId() || !token()) throw httpError(503, "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN are not set in backend/.env.");
    const model = modelId();
    const [width, height] = SIZES[aspectRatio] || SIZES["4:5"];
    const url = `${BASE()}/accounts/${accountId()}/ai/run/${model}`;
    let init;
    if (isFlux2(model)) {
        const form = new FormData();
        form.append("prompt", String(prompt).slice(0, 4000));
        form.append("width", String(width));
        form.append("height", String(height));
        if (Number.isInteger(seed) && seed > 0) form.append("seed", String(seed));
        const refs = await Promise.all(images.slice(0, 4).map((im) => toReference(im.data)));
        refs.forEach((buf, i) => form.append(`input_image_${i}`, new Blob([buf], { type: "image/png" }), `ref${i}.png`));
        init = { method: "POST", headers: authHeaders(), body: form };
    } else {
        // FLUX.1 schnell: JSON, text only, max 8 steps, prompt max 2048 chars
        init = { method: "POST", headers: { ...authHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ prompt: String(prompt).slice(0, 2048), steps: 8, ...(seed ? { seed } : {}) }) };
    }
    const t0 = Date.now();
    const res = await withTimeout((signal) => fetchImpl(url, { ...init, signal }), Number(env("CLOUDFLARE_TIMEOUT_MS", 120000)), model);
    const type = res.headers?.get?.("content-type") || "";
    if (res.ok && /^image\//.test(type)) return { image: Buffer.from(await res.arrayBuffer()), model, ms: Date.now() - t0 };
    const body = await readJson(res);
    if (!res.ok || body?.success === false) throw explain(res.status, body);
    const b64 = body?.result?.image || body?.image;
    if (!b64) throw httpError(502, "Cloudflare returned no image.");
    return { image: Buffer.from(b64, "base64"), model, ms: Date.now() - t0 };
};

module.exports = { health, generateImage, explain, SIZES, isFlux2 };
