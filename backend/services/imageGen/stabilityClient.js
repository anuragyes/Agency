// ─────────────────────────────────────────────────────────────
// stabilityClient.js — Stability AI hosted API (no GPU needed). 1 credit = $0.01, failed generations are free.
//   generateUltra()             text -> photo, follows a long detailed prompt (people, scenes)     ~8 credits
//   replaceBackgroundRelight()  YOUR real product photo -> new AI scene around it, relit         ~8 credits
//                               (label / logo stay exactly as photographed — async, polled)
//   controlSketch()             our layout sketch -> photo that follows the sketch strictly      ~5 credits
//   health()                    GET /v1/user/balance
//
//   .env:
//     STABILITY_API_KEY=sk-...                      (https://platform.stability.ai/account/keys)
//     STABILITY_CONTROL_STRENGTH=0.7                (0–1: how strictly the photo follows the sketch)
//     STABILITY_TIMEOUT_MS=120000
// ─────────────────────────────────────────────────────────────
const env = (k, d) => (process.env[k] != null && String(process.env[k]).trim() !== "" ? String(process.env[k]).trim() : d);
const BASE = () => env("STABILITY_API_URL", "https://api.stability.ai").replace(/\/$/, "");

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });
const apiKey = () => env("STABILITY_API_KEY", "");

/** Stability error JSON -> one readable sentence for the user */
const explain = (status, body) => {
    const detail = Array.isArray(body?.errors) ? body.errors.join("; ") : body?.message || body?.name || "";
    switch (status) {
        case 401: return httpError(502, "Stability AI rejected the API key. Check STABILITY_API_KEY in backend/.env.");
        case 402: return httpError(402, "Your Stability AI account is out of credits. Add credits at platform.stability.ai/account/credits.");
        case 403: return httpError(422, "Stability AI blocked this prompt (content moderation). Change the photo prompt and try again.");
        case 413: return httpError(502, "The sketch image was too large for Stability AI (max 10 MB).");
        case 422: return httpError(422, `Stability AI couldn't use this request: ${detail || "invalid prompt"}.`);
        case 429: return httpError(429, "Stability AI rate limit reached. Wait a minute and try again.");
        default: return httpError(502, `Stability AI error ${status}${detail ? `: ${detail}` : ""}`);
    }
};

const withTimeout = async (fn, ms, what) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
        return await fn(ctrl.signal);
    } catch (err) {
        if (err.name === "AbortError") throw httpError(504, `Stability AI did not answer within ${Math.round(ms / 1000)}s (${what}).`);
        if (err.statusCode) throw err;
        throw httpError(503, `Can't reach Stability AI (${err.message}). Check your internet connection.`);
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

/** -> { ok, credits, problems[] } */
const health = async ({ fetchImpl = fetch } = {}) => {
    const out = { ok: false, credits: null, problems: [] };
    if (!apiKey()) {
        out.problems.push("STABILITY_API_KEY is not set in backend/.env. Create a key at platform.stability.ai/account/keys and restart the backend.");
        return out;
    }
    try {
        const res = await withTimeout((signal) => fetchImpl(`${BASE()}/v1/user/balance`, { headers: { Authorization: `Bearer ${apiKey()}` }, signal }), 15000, "balance");
        const body = await readJson(res);
        if (!res.ok) throw explain(res.status, body);
        out.credits = typeof body?.credits === "number" ? Math.round(body.credits * 100) / 100 : null;
        if (out.credits != null && out.credits < 3) out.problems.push(`Only ${out.credits} Stability AI credits left — one image needs about 3–5. Add credits at platform.stability.ai/account/credits.`);
    } catch (err) {
        out.problems.push(err.message);
    }
    out.ok = out.problems.length === 0;
    return out;
};

/** POST multipart form -> parsed JSON (throws readable errors) */
const postForm = async (path, form, { fetchImpl = fetch, what } = {}) => {
    if (!apiKey()) throw httpError(503, "STABILITY_API_KEY is not set in backend/.env.");
    const res = await withTimeout(
        (signal) => fetchImpl(`${BASE()}${path}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json", "stability-client-id": "sociva" },
            body: form,
            signal,
        }),
        Number(env("STABILITY_TIMEOUT_MS", 120000)),
        what || path
    );
    const body = await readJson(res);
    if (!res.ok) throw explain(res.status, body);
    return body;
};

const pngBlob = (buf, name) => [new Blob([buf], { type: "image/png" }), name];
const addCommon = (form, { negativePrompt, seed }) => {
    if (negativePrompt) form.append("negative_prompt", String(negativePrompt).slice(0, 10000));
    if (Number.isInteger(seed) && seed > 0) form.append("seed", String(Math.min(seed, 4294967294)));
    form.append("output_format", "png");
};
/** finished-image JSON -> { image, seed, finishReason } (Stability uses "image"; some versions "result") */
const imageOf = (body) => {
    const b64 = body?.image || body?.result;
    if (!b64) throw httpError(502, "Stability AI returned no image.");
    return { image: Buffer.from(b64, "base64"), seed: Number(body.seed) || 0, finishReason: body.finish_reason || "SUCCESS" };
};

/**
 * Sketch -> photo (follows the sketch strictly).
 * @param {Object} a { sketchPng: Buffer, prompt, negativePrompt, seed, controlStrength }
 * @returns {Promise<{ image: Buffer, seed: number, ms: number, finishReason: string }>}
 */
const controlSketch = async ({ sketchPng, prompt, negativePrompt, seed, controlStrength }, { fetchImpl = fetch } = {}) => {
    const form = new FormData();
    form.append("image", ...pngBlob(sketchPng, "sketch.png"));
    form.append("prompt", String(prompt).slice(0, 10000));
    const strength = Number(controlStrength ?? env("STABILITY_CONTROL_STRENGTH", 0.7));
    form.append("control_strength", String(Math.min(1, Math.max(0, Number.isFinite(strength) ? strength : 0.7))));
    addCommon(form, { negativePrompt, seed });
    const t0 = Date.now();
    const body = await postForm("/v2beta/stable-image/control/sketch", form, { fetchImpl, what: "control/sketch" });
    return { ...imageOf(body), ms: Date.now() - t0 };
};

/**
 * Text -> photo with Stable Image Ultra (best at long, detailed prompts: people, hands, food, scenes).
 * @param {Object} a { prompt, negativePrompt, aspectRatio: "1:1"|"4:5"|"9:16", seed }
 */
const generateUltra = async ({ prompt, negativePrompt, aspectRatio = "4:5", seed }, { fetchImpl = fetch } = {}) => {
    const form = new FormData();
    form.append("prompt", String(prompt).slice(0, 10000));
    form.append("aspect_ratio", aspectRatio);
    addCommon(form, { negativePrompt, seed });
    const t0 = Date.now();
    const body = await postForm(`/v2beta/stable-image/generate/${env("STABILITY_SCENE_MODEL", "ultra")}`, form, { fetchImpl, what: "generate" });
    return { ...imageOf(body), ms: Date.now() - t0 };
};

/** Poll an async generation: 202 = still working, 200 = done (Stability asks for max 1 poll / 10 s) */
const pollResult = async (id, { fetchImpl = fetch, intervalMs = 10000, maxMs = 240000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) => {
    const t0 = Date.now();
    for (;;) {
        await sleep(intervalMs);
        const res = await withTimeout(
            (signal) => fetchImpl(`${BASE()}/v2beta/results/${id}`, { headers: { Authorization: `Bearer ${apiKey()}`, Accept: "application/json" }, signal }),
            30000,
            "results"
        );
        if (res.status === 202) {
            if (Date.now() - t0 > maxMs) throw httpError(504, "Stability AI is taking too long. Try again in a minute.");
            continue;
        }
        const body = await readJson(res);
        if (!res.ok) throw explain(res.status, body);
        return imageOf(body);
    }
};

/**
 * Your REAL product photo -> the same product in a new AI scene, relit to match (label stays as photographed).
 * @param {Object} a { subjectPng: Buffer, backgroundPrompt, foregroundPrompt, negativePrompt, seed, preserve (0–1), lightDirection }
 */
const replaceBackgroundRelight = async (
    { subjectPng, backgroundPrompt, foregroundPrompt, negativePrompt, seed, preserve, lightDirection },
    { fetchImpl = fetch, pollOptions } = {}
) => {
    const form = new FormData();
    form.append("subject_image", ...pngBlob(subjectPng, "product.png"));
    form.append("background_prompt", String(backgroundPrompt).slice(0, 10000));
    if (foregroundPrompt) form.append("foreground_prompt", String(foregroundPrompt).slice(0, 1000));
    const keep = Number(preserve ?? env("STABILITY_PRESERVE_SUBJECT", 0.8));
    form.append("preserve_original_subject", String(Math.min(1, Math.max(0, Number.isFinite(keep) ? keep : 0.8))));
    if (["left", "right", "above", "below"].includes(lightDirection)) form.append("light_source_direction", lightDirection);
    addCommon(form, { negativePrompt, seed });
    const t0 = Date.now();
    const started = await postForm("/v2beta/stable-image/edit/replace-background-and-relight", form, { fetchImpl, what: "replace-background-and-relight" });
    if (!started?.id) throw httpError(502, "Stability AI didn't start the generation (no id).");
    const out = await pollResult(started.id, { fetchImpl, ...pollOptions });
    return { ...out, ms: Date.now() - t0 };
};

module.exports = { health, controlSketch, generateUltra, replaceBackgroundRelight, pollResult, explain };
