// ─────────────────────────────────────────────────────────────
// geminiImageClient.js — Google Gemini image models ("Nano Banana") via the REST generateContent API
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
//   Why Gemini: it follows long natural-language prompts (people, actions, food, kitchens) and takes
//   REFERENCE IMAGES — your real product photo goes in, the same jar / label comes out inside the new scene.
//
//   .env:
//     GEMINI_IMAGE_API_KEY=...      (or GEMINI_API_KEY)  — https://aistudio.google.com/apikey  (image output needs billing on)
//     GEMINI_IMAGE_MODEL=           optional; default = best available of the models below
//     GEMINI_IMAGE_SIZE=2K          1K | 2K | 4K (4K only on Pro) | off — a model that rejects the size gets no size (auto-retry)
// ─────────────────────────────────────────────────────────────
const env = (k, d) => (process.env[k] != null && String(process.env[k]).trim() !== "" ? String(process.env[k]).trim() : d);
const BASE = () => env("GEMINI_API_URL", "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
const apiKey = () => env("GEMINI_IMAGE_API_KEY", env("GEMINI_API_KEY", ""));

/** Preferred image models, best value first (names change often -> we also accept any "*image*" model the key can use) */
const PREFERRED_MODELS = [
    "gemini-3.1-flash-lite-image",
    "gemini-nano-banana-2.1",
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-3-pro-image-preview",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-image-preview",
];
const PRICE_HINT = {
    "gemini-3.1-flash-lite-image": "lowest-cost Flash image model",
    "gemini-nano-banana-2.1": "~$0.05 / image",
    "gemini-3.1-flash-image": "~$0.10 / image",
    "gemini-3-pro-image": "~$0.13 / image",
    "gemini-3-pro-image-preview": "~$0.13 / image",
    "gemini-2.5-flash-image": "~$0.04 / image",
};

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const withTimeout = async (fn, ms, what) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fn(ctrl.signal);
    } catch (err) {
        if (err.name === "AbortError") throw httpError(504, `Gemini did not answer within ${Math.round(ms / 1000)}s (${what}).`);
        if (err.statusCode) throw err;
        throw httpError(503, `Can't reach Google Gemini (${err.message}). Check your internet connection.`);
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

/** Google error JSON -> one readable sentence */
const explain = (status, body) => {
    const msg = body?.error?.message || "";
    if (status === 400 && /api key/i.test(msg)) return httpError(502, "Google rejected the API key. Check GEMINI_IMAGE_API_KEY (or GEMINI_API_KEY) in backend/.env.");
    if (status === 403) return httpError(502, `Google denied access: ${msg || "this key can't use the Gemini API"}.`);
    if (status === 404) return httpError(502, `Gemini model not found: ${msg}. Remove GEMINI_IMAGE_MODEL from .env to pick one automatically.`);
    if (status === 429) {
        return /limit:\s*0|free.?tier|billing/i.test(msg)
            ? httpError(402, "Gemini image generation needs billing turned on for this API key (it has no free tier). Enable billing in Google AI Studio → Settings → Billing.")
            : httpError(429, "Gemini rate limit reached. Wait a minute and try again.");
    }
    return httpError(502, `Gemini error ${status}${msg ? `: ${msg}` : ""}`);
};

let cache = { at: 0, model: null, models: [] };
const sizeUnsupported = new Set(); // models that rejected GEMINI_IMAGE_SIZE -> don't send it again (saves a failed call per image)
const CACHE_MS = 10 * 60 * 1000;

/** Image models this key can call with generateContent */
const listImageModels = async ({ fetchImpl = fetch } = {}) => {
    const res = await withTimeout((signal) => fetchImpl(`${BASE()}/models?pageSize=1000`, { headers: { "x-goog-api-key": apiKey() }, signal }), 15000, "models");
    const body = await readJson(res);
    if (!res.ok) throw explain(res.status, body);
    return (body?.models || [])
        .map((m) => ({ ...m, id: String(m.name).replace(/^models\//, "") }))
        // image models: known names, or "*image*" / "*banana*" (new names like gemini-nano-banana-2.1 have no "image" in them)
        .filter((m) => (!m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
            && (PREFERRED_MODELS.includes(m.id) || (/image|banana/i.test(m.id) && !/imagen/i.test(m.id))))
        .map((m) => m.id);
};

const pickModel = (available) => {
    const wanted = env("GEMINI_IMAGE_MODEL", "");
    if (wanted) return available.includes(wanted) || !available.length ? wanted : null;
    return PREFERRED_MODELS.find((m) => available.includes(m)) || available.find((m) => /flash.*image|image.*flash/i.test(m)) || available[0] || null;
};

/** -> { ok, model, models[], price, problems[] } */
const health = async ({ fetchImpl = fetch } = {}) => {
    const out = { ok: false, model: null, models: [], price: null, problems: [] };
    if (!apiKey()) {
        out.problems.push("GEMINI_IMAGE_API_KEY (or GEMINI_API_KEY) is not set in backend/.env. Create a key at aistudio.google.com/apikey and restart the backend.");
        return out;
    }
    try {
        out.models = await listImageModels({ fetchImpl });
        out.model = pickModel(out.models);
        if (!out.model) {
            out.problems.push(env("GEMINI_IMAGE_MODEL", "")
                ? `GEMINI_IMAGE_MODEL "${env("GEMINI_IMAGE_MODEL", "")}" isn't available for this key. Available: ${out.models.join(", ") || "none"}.`
                : "This API key has no Gemini image model available.");
        }
        out.price = PRICE_HINT[out.model] || null;
    } catch (err) {
        out.problems.push(err.message);
    }
    out.ok = out.problems.length === 0;
    if (out.ok) cache = { at: Date.now(), model: out.model, models: out.models };
    return out;
};

const resolveModel = async ({ fetchImpl } = {}) => {
    if (cache.model && Date.now() - cache.at < CACHE_MS) return cache.model;
    const h = await health({ fetchImpl });
    if (!h.ok) throw httpError(503, `Gemini isn't ready: ${h.problems.join(" ")}`);
    return h.model;
};

/** "No image came back" reasons -> what the user can do */
const noImageReason = (cand, text) => {
    const r = cand?.finishReason || "";
    if (/SAFETY|PROHIBITED|BLOCK|IMAGE_SAFETY|RECITATION/i.test(r)) return `Gemini's safety filter blocked this image (${r}). Change the prompt (e.g. less detail about people) and try again.`;
    return `Gemini returned no image${r ? ` (${r})` : ""}${text ? `: ${String(text).slice(0, 200)}` : ""}. Try again or simplify the prompt.`;
};

/**
 * Prompt (+ reference images) -> one image.
 * @param {Object} a
 * @param {string} a.prompt
 * @param {{ data: Buffer, mimeType: string }[]} [a.images]  reference images (your product photo, the layout sketch...)
 * @param {string} [a.aspectRatio]  "1:1" | "4:5" | "9:16" ...
 * @returns {Promise<{ image: Buffer, mimeType, model, ms, text }>}
 */
const generateImage = async ({ prompt, images = [], aspectRatio = "4:5" }, { fetchImpl = fetch } = {}) => {
    if (!apiKey()) throw httpError(503, "GEMINI_IMAGE_API_KEY (or GEMINI_API_KEY) is not set in backend/.env.");
    const model = await resolveModel({ fetchImpl });
    const parts = [
        ...images.map((im) => ({ inlineData: { mimeType: im.mimeType || "image/png", data: Buffer.from(im.data).toString("base64") } })),
        { text: String(prompt).slice(0, 30000) },
    ];
    const call = async (imageConfig) => {
        const body = {
            contents: [{ role: "user", parts }],
            generationConfig: { responseModalities: ["TEXT", "IMAGE"], ...(imageConfig ? { imageConfig } : {}) },
        };
        const res = await withTimeout(
            (signal) => fetchImpl(`${BASE()}/models/${encodeURIComponent(model)}:generateContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
                body: JSON.stringify(body),
                signal,
            }),
            Number(env("GEMINI_IMAGE_TIMEOUT_MS", 180000)),
            "generateContent"
        );
        return { res, json: await readJson(res) };
    };

    const t0 = Date.now();
    const size = env("GEMINI_IMAGE_SIZE", "2K");
    const errMsg = (j) => j?.error?.message || "";
    let config = { aspectRatio, ...(size && !/^(off|none|auto)$/i.test(size) && !sizeUnsupported.has(model) ? { imageSize: size } : {}) };
    let { res, json } = await call(config);
    // the model doesn't support this imageSize ("Image size 2K is not supported for this model" — e.g. flash-lite,
    // or older models: "Invalid value for image_size") -> same request without it; remembered for this model
    if (res.status === 400 && config.imageSize && /image[\s_]?size/i.test(errMsg(json))) {
        sizeUnsupported.add(model);
        config = { aspectRatio };
        ({ res, json } = await call(config));
    }
    // the model doesn't know this aspect ratio -> the nearest one it does (4:5 -> 3:4; the composer crops to the post size)
    if (res.status === 400 && /aspect|imageConfig/i.test(errMsg(json)) && config.aspectRatio === "4:5") {
        config = { ...config, aspectRatio: "3:4" };
        ({ res, json } = await call(config));
    }
    if (!res.ok) throw explain(res.status, json);

    const cand = json?.candidates?.[0];
    const outParts = cand?.content?.parts || [];
    const img = outParts.find((p) => p.inlineData?.data || p.inline_data?.data);
    const text = outParts.filter((p) => p.text).map((p) => p.text).join(" ").trim();
    if (!img) {
        const blocked = json?.promptFeedback?.blockReason;
        throw httpError(422, blocked ? `Gemini blocked the prompt (${blocked}). Change the prompt and try again.` : noImageReason(cand, text));
    }
    const data = img.inlineData || img.inline_data;
    return { image: Buffer.from(data.data, "base64"), mimeType: data.mimeType || data.mime_type || "image/png", model, ms: Date.now() - t0, text };
};

const _resetCache = () => {
    cache = { at: 0, model: null, models: [] };
    sizeUnsupported.clear();
};

module.exports = { health, generateImage, listImageModels, pickModel, explain, PREFERRED_MODELS, _resetCache };
