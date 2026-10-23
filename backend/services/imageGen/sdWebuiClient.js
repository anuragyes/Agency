// ─────────────────────────────────────────────────────────────
// sdWebuiClient.js — Stable Diffusion (AUTOMATIC1111 / Forge WebUI API) + ControlNet Scribble
//   Start the WebUI with:  webui-user.bat ->  set COMMANDLINE_ARGS=--api   (Forge: same flag)
//   Needs: a realistic SD 1.5 checkpoint (e.g. Realistic Vision V6) + control_v11p_sd15_scribble (ControlNet extension / Forge built-in)
//
//   .env (all optional):
//     SD_WEBUI_URL=http://127.0.0.1:7860
//     SD_CHECKPOINT=realisticVisionV60B1_v51HyperVAE      (part of the name is enough; empty = whatever is loaded)
//     SD_CONTROLNET_MODEL=control_v11p_sd15_scribble      (part of the name is enough)
//     SD_STEPS=30  SD_CFG=6  SD_SAMPLER=DPM++ 2M Karras  SD_CONTROL_WEIGHT=0.85  SD_TIMEOUT_MS=300000
//     SD_HIRES=0   (1 = hires fix x1.5 — sharper but ~2x slower)
//     SD_AUTH=user:password   (only if you started the WebUI with --api-auth)
// ─────────────────────────────────────────────────────────────

const env = (k, d) => (process.env[k] != null && String(process.env[k]).trim() !== "" ? String(process.env[k]).trim() : d);
const baseUrl = () => env("SD_WEBUI_URL", "http://127.0.0.1:7860").replace(/\/$/, "");

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const headers = () => {
    const h = { "Content-Type": "application/json" };
    const auth = env("SD_AUTH", "");
    if (auth) h.Authorization = `Basic ${Buffer.from(auth).toString("base64")}`;
    return h;
};

/** fetch JSON from the WebUI with a timeout and readable errors */
const sdFetch = async (path, { method = "GET", body, timeoutMs = 15000, fetchImpl = fetch } = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
        res = await fetchImpl(`${baseUrl()}${path}`, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    } catch (err) {
        if (err.name === "AbortError") throw httpError(504, `Stable Diffusion did not answer within ${Math.round(timeoutMs / 1000)}s (${path}).`);
        throw httpError(503, `Can't reach Stable Diffusion WebUI at ${baseUrl()}. Start it with --api (and check SD_WEBUI_URL in backend/.env).`);
    } finally {
        clearTimeout(timer);
    }
    const text = await res.text();
    let json = null;
    try {
        json = JSON.parse(text);
    } catch {
        /* not JSON */
    }
    if (!res.ok) {
        const detail = json?.detail || json?.error || json?.errors || text.slice(0, 300);
        const msg = typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 300);
        if (res.status === 404 && /\/sdapi\//.test(path)) throw httpError(502, "The WebUI is running without the API. Restart it with --api.");
        if (/controlnet/i.test(msg) && /not found|no script/i.test(msg)) throw httpError(502, "ControlNet is not installed in the WebUI (Extensions -> sd-webui-controlnet, or use Forge).");
        throw httpError(502, `Stable Diffusion error ${res.status}: ${msg}`);
    }
    return json;
};

/** "part of a name" -> the exact name from a list (exact match first, then case-insensitive "includes") */
const pickName = (list, wanted, fallbackIncludes) => {
    const names = (list || []).map(String);
    const w = String(wanted || "").toLowerCase();
    if (w) {
        const exact = names.find((n) => n.toLowerCase() === w);
        if (exact) return exact;
        const part = names.find((n) => n.toLowerCase().includes(w));
        if (part) return part;
    }
    return fallbackIncludes ? names.find((n) => n.toLowerCase().includes(fallbackIncludes)) || null : null;
};

let cache = { at: 0, controlModel: null, checkpoint: null };
const CACHE_MS = 5 * 60 * 1000;

/**
 * Is the WebUI up, with a checkpoint + a scribble ControlNet model?
 * @returns {{ ok, url, checkpoint, checkpoints, controlModel, controlModels, problems: string[] }}
 */
const health = async ({ fetchImpl } = {}) => {
    const out = { ok: false, url: baseUrl(), checkpoint: null, checkpoints: [], controlModel: null, controlModels: [], problems: [] };
    try {
        const models = await sdFetch("/sdapi/v1/sd-models", { fetchImpl });
        out.checkpoints = (models || []).map((m) => m.title || m.model_name);
        const opts = await sdFetch("/sdapi/v1/options", { fetchImpl }).catch(() => ({}));
        const wanted = env("SD_CHECKPOINT", "");
        out.checkpoint = wanted ? pickName(out.checkpoints, wanted) : opts.sd_model_checkpoint || out.checkpoints[0] || null;
        if (wanted && !out.checkpoint) out.problems.push(`Checkpoint "${wanted}" (SD_CHECKPOINT) is not in the WebUI's models/Stable-diffusion folder.`);
        if (!out.checkpoints.length) out.problems.push("No checkpoints found. Put a realistic SD 1.5 model (e.g. Realistic Vision) in models/Stable-diffusion.");
    } catch (err) {
        out.problems.push(err.message);
        return out;
    }
    try {
        const cn = await sdFetch("/controlnet/model_list", { fetchImpl });
        out.controlModels = cn?.model_list || [];
        out.controlModel = pickName(out.controlModels, env("SD_CONTROLNET_MODEL", "control_v11p_sd15_scribble"), "scribble");
        if (!out.controlModel) out.problems.push("No ControlNet Scribble model found. Download control_v11p_sd15_scribble.pth into models/ControlNet.");
    } catch (err) {
        out.problems.push(/404|not found/i.test(err.message) ? "ControlNet extension not found in the WebUI (install sd-webui-controlnet, or use Forge)." : err.message);
    }
    out.ok = out.problems.length === 0;
    if (out.ok) cache = { at: Date.now(), controlModel: out.controlModel, checkpoint: out.checkpoint };
    return out;
};

/** Model names resolved once (cached 5 min), so every generation doesn't list all models */
const resolveModels = async ({ fetchImpl } = {}) => {
    if (cache.controlModel && Date.now() - cache.at < CACHE_MS) return cache;
    const h = await health({ fetchImpl });
    if (!h.ok) throw httpError(503, `Stable Diffusion isn't ready: ${h.problems.join(" ")}`);
    return cache;
};

/** The txt2img request body: realistic checkpoint + ControlNet Scribble on our white-on-black sketch */
const buildTxt2ImgPayload = ({ prompt, negativePrompt, width, height, controlImageBase64, seed = -1, steps, cfgScale, controlWeight, checkpoint, controlModel }) => {
    const hires = env("SD_HIRES", "0") === "1";
    const payload = {
        prompt,
        negative_prompt: negativePrompt,
        width,
        height,
        steps: Number(steps || env("SD_STEPS", 30)),
        cfg_scale: Number(cfgScale || env("SD_CFG", 6)),
        sampler_name: env("SD_SAMPLER", "DPM++ 2M Karras"),
        seed: Number.isInteger(seed) ? seed : -1,
        batch_size: 1,
        n_iter: 1,
        send_images: true,
        save_images: false,
        alwayson_scripts: {
            controlnet: {
                args: [
                    {
                        enabled: true,
                        image: controlImageBase64,       // already a scribble (white lines on black) ->
                        module: "none",                  // no preprocessor needed
                        model: controlModel,
                        weight: Number(controlWeight || env("SD_CONTROL_WEIGHT", 0.85)),
                        guidance_start: 0,
                        guidance_end: 0.9,               // last 10% of steps free -> more natural detail
                        control_mode: "Balanced",
                        resize_mode: "Crop and Resize",
                        pixel_perfect: true,
                        processor_res: Math.min(width, height),
                    },
                ],
            },
        },
    };
    if (checkpoint) {
        payload.override_settings = { sd_model_checkpoint: checkpoint };
        payload.override_settings_restore_afterwards = false; // keep it loaded -> next image is fast
    }
    if (hires) Object.assign(payload, { enable_hr: true, hr_scale: 1.5, hr_upscaler: env("SD_HR_UPSCALER", "R-ESRGAN 4x+"), denoising_strength: 0.35, hr_second_pass_steps: 12 });
    return payload;
};

/**
 * Generate ONE photo from the scribble.
 * @returns {Promise<{ image: Buffer, seed: number, info: Object, ms: number, checkpoint, controlModel }>}
 */
const txt2imgScribble = async (args, { fetchImpl } = {}) => {
    const { controlModel, checkpoint } = await resolveModels({ fetchImpl });
    const payload = buildTxt2ImgPayload({ ...args, controlModel, checkpoint });
    const t0 = Date.now();
    const json = await sdFetch("/sdapi/v1/txt2img", { method: "POST", body: payload, timeoutMs: Number(env("SD_TIMEOUT_MS", 300000)), fetchImpl });
    const first = json?.images?.[0];
    if (!first) throw httpError(502, "Stable Diffusion returned no image.");
    let info = {};
    try {
        info = typeof json.info === "string" ? JSON.parse(json.info) : json.info || {};
    } catch {
        /* info is optional */
    }
    return {
        image: Buffer.from(String(first).replace(/^data:image\/\w+;base64,/, ""), "base64"),
        seed: Number.isFinite(info.seed) ? info.seed : payload.seed,
        info,
        ms: Date.now() - t0,
        checkpoint: checkpoint || info.sd_model_name || null,
        controlModel,
    };
};

const _resetCache = () => {
    cache = { at: 0, controlModel: null, checkpoint: null };
};

module.exports = { health, txt2imgScribble, buildTxt2ImgPayload, pickName, baseUrl, _resetCache };
