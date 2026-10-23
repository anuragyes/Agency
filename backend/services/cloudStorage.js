// ─────────────────────────────────────────────────────────────
// cloudStorage.js — keep media on Cloudinary (free plan, no card) instead of the local uploads/ folder
//   Why: Instagram / Facebook download media from a PUBLIC link. Files on your PC (http://localhost:5000/uploads/...)
//   can't be reached, and on Render's free plan local files are deleted on every restart / deploy / sleep.
//   With Cloudinary every upload / generated ad gets a permanent public https link -> no ngrok, works on Render.
//
//   .env (one line, from the Cloudinary dashboard -> "API environment variable"):
//     CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
//   or the three parts: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET
//   optional: CLOUDINARY_FOLDER=sociva
//
// Uses Cloudinary's REST upload API with a signed request (no SDK needed).
// ─────────────────────────────────────────────────────────────
const crypto = require("crypto");

const LOCAL_URL = /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/;
const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });
const env = (k) => String(process.env[k] || "").trim();

/** -> { cloudName, apiKey, apiSecret } | null */
const config = () => {
    const url = env("CLOUDINARY_URL");
    if (url) {
        const m = /^cloudinary:\/\/([^:]+):([^@]+)@([^/?#\s]+)/.exec(url);
        if (m) return { apiKey: decodeURIComponent(m[1]), apiSecret: decodeURIComponent(m[2]), cloudName: m[3] };
    }
    const cloudName = env("CLOUDINARY_CLOUD_NAME");
    const apiKey = env("CLOUDINARY_API_KEY");
    const apiSecret = env("CLOUDINARY_API_SECRET");
    return cloudName && apiKey && apiSecret ? { cloudName, apiKey, apiSecret } : null;
};
const isConfigured = () => Boolean(config());

/** Cloudinary signature: sha1("a=1&b=2" + api_secret) over the signed params, sorted by name */
const sign = (params, apiSecret) => {
    const str = Object.keys(params)
        .filter((k) => params[k] !== undefined && params[k] !== "")
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&");
    return crypto.createHash("sha1").update(str + apiSecret).digest("hex");
};

/**
 * Upload a file buffer -> permanent public https URL.
 * @param {Buffer} buffer
 * @param {Object} o { folder: "generated"|"instagram"|..., resourceType: "image"|"video", mimeType, filename }
 * @returns {Promise<{ url, publicId, bytes, format }>}
 */
const uploadBuffer = async (buffer, { folder = "uploads", resourceType = "image", mimeType = "application/octet-stream", filename = "file" } = {}, { fetchImpl = fetch } = {}) => {
    const cfg = config();
    if (!cfg) throw httpError(503, "Cloudinary is not set up — add CLOUDINARY_URL to backend/.env.");
    const fullFolder = [env("CLOUDINARY_FOLDER") || "sociva", folder].filter(Boolean).join("/");
    const timestamp = Math.floor(Date.now() / 1000);
    const signed = { folder: fullFolder, timestamp };

    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mimeType }), filename);
    form.append("api_key", cfg.apiKey);
    form.append("timestamp", String(timestamp));
    form.append("folder", fullFolder);
    form.append("signature", sign(signed, cfg.apiSecret));

    const type = resourceType === "video" ? "video" : "image";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Number(process.env.CLOUDINARY_TIMEOUT_MS || 300000));
    let res;
    try {
        res = await fetchImpl(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cfg.cloudName)}/${type}/upload`, { method: "POST", body: form, signal: ctrl.signal });
    } catch (err) {
        throw httpError(503, err.name === "AbortError" ? "Upload to Cloudinary timed out." : `Can't reach Cloudinary (${err.message}).`);
    } finally {
        clearTimeout(timer);
    }
    let body = null;
    try {
        body = await res.json();
    } catch {
        /* not JSON */
    }
    if (!res.ok) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        if (res.status === 401 || /api_key|signature|cloud_name/i.test(msg)) throw httpError(502, `Cloudinary rejected the upload (${msg}). Check CLOUDINARY_URL in backend/.env.`);
        if (/file size too large/i.test(msg)) throw httpError(413, `File too large for Cloudinary's free plan (${msg}). Images max 10 MB, videos max 100 MB.`);
        throw httpError(502, `Cloudinary upload failed: ${msg}`);
    }
    return { url: body.secure_url, publicId: body.public_id, bytes: body.bytes, format: body.format };
};

const isLocalUrl = (url) => LOCAL_URL.test(String(url || ""));

/**
 * Media that still points at THIS server's /uploads/ folder (made before Cloudinary was set up)
 * -> upload those files to Cloudinary and swap the URLs. Returns how many were moved.
 * @param {Object[]} media           post.media items { type, url, mimeType }
 * @param {(url) => string|null} localFileFor   url -> file path on disk (null if the file is gone)
 */
const moveLocalMediaToCloud = async (media, localFileFor, { readFile = require("fs").promises.readFile, fetchImpl } = {}) => {
    if (!isConfigured() || !Array.isArray(media)) return { moved: 0, missing: [] };
    let moved = 0;
    const missing = [];
    for (const m of media) {
        if (!m?.url || !isLocalUrl(m.url)) continue;
        const file = localFileFor(m.url);
        if (!file) {
            missing.push(m.url);
            continue;
        }
        const buf = await readFile(file);
        const isVideo = m.type === "video";
        const up = await uploadBuffer(buf, {
            folder: "posts",
            resourceType: isVideo ? "video" : "image",
            mimeType: m.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
            filename: String(file).split(/[\\/]/).pop(),
        }, { fetchImpl });
        m.url = up.url;
        m.source = "upload";
        moved++;
    }
    return { moved, missing };
};

module.exports = { isConfigured, config, uploadBuffer, moveLocalMediaToCloud, isLocalUrl, sign };
