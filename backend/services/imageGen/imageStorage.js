// ─────────────────────────────────────────────────────────────
// imageStorage.js — save generated images under backend/uploads/generated/ and read logos / uploads back
//   Served by server.js:  app.use("/uploads", express.static(...))
//   With CLOUDINARY_URL set, files go to Cloudinary instead (public https links — no ngrok, works on Render).
//   Without it they stay on disk and Instagram / Facebook need PUBLIC_BASE_URL (e.g. ngrok) to download them.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cloudStorage = require("../cloudStorage.js");

const UPLOADS_ROOT = path.join(__dirname, "..", "..", "uploads");
const GENERATED_DIR = path.join(UPLOADS_ROOT, "generated");
const LOGO_DIR = path.join(UPLOADS_ROOT, "logos");
const DIRS = { generated: GENERATED_DIR, logos: LOGO_DIR, products: path.join(UPLOADS_ROOT, "products") };
const MAX_REMOTE_BYTES = 10 * 1024 * 1024;

/** PUBLIC_BASE_URL (ngrok / your domain) or the host the request came in on */
const publicBase = (req) => (process.env.PUBLIC_BASE_URL || (req ? `${req.protocol}://${req.get("host")}` : `http://localhost:${process.env.PORT || 5000}`)).replace(/\/$/, "");
const isPublicUrl = (url) => !/\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.)/.test(String(url || ""));

/**
 * @param {Buffer} buffer
 * @param {Object} o { ext: "jpg"|"png"|"svg"|"webp", dir: "generated"|"logos"|"products", prefix, req }
 * @returns {Promise<{ url, file, name }>}
 */
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" };

const saveBuffer = async (buffer, { ext = "png", dir = "generated", prefix = "img", req } = {}) => {
    if (!DIRS[dir]) throw new Error(`Unknown upload folder "${dir}"`);
    // Cloudinary set up -> permanent public https link (Instagram can download it, survives Render restarts)
    if (cloudStorage.isConfigured()) {
        const up = await cloudStorage.uploadBuffer(buffer, { folder: dir, mimeType: MIME[ext] || "application/octet-stream", filename: `${prefix}.${ext}` });
        return { url: up.url, file: null, name: up.publicId };
    }
    const folder = DIRS[dir];
    await fs.promises.mkdir(folder, { recursive: true });
    const name = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    const file = path.join(folder, name);
    await fs.promises.writeFile(file, buffer);
    return { url: `${publicBase(req)}/uploads/${dir}/${name}`, file, name };
};

/** A url that points at OUR /uploads/ folder -> the local file path (null if not ours / outside the folder) */
const localFileFor = (url) => {
    const i = String(url || "").indexOf("/uploads/");
    if (i === -1) return null;
    const rel = decodeURIComponent(String(url).slice(i + "/uploads/".length).split(/[?#]/)[0]);
    const file = path.resolve(UPLOADS_ROOT, rel);
    if (!file.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) return null; // no ../ tricks
    return fs.existsSync(file) ? file : null;
};

/** Read an image by url: our own uploads from disk (works without ngrok), anything else over https */
const loadImage = async (url, { fetchImpl = fetch } = {}) => {
    if (!url) return null;
    const local = localFileFor(url);
    if (local) return fs.promises.readFile(local);
    if (!/^https?:\/\//i.test(url)) throw new Error("Logo URL must start with http(s)://");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
        const res = await fetchImpl(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`Couldn't download the logo (${res.status})`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > MAX_REMOTE_BYTES) throw new Error("Logo is larger than 10 MB");
        return buf;
    } finally {
        clearTimeout(t);
    }
};

/** Point our own /uploads/ url at PUBLIC_BASE_URL (files saved before ngrok was set) */
const refreshUrl = (url) => {
    const base = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
    const i = String(url || "").indexOf("/uploads/");
    if (!base || i === -1 || String(url).startsWith(base)) return url;
    return base + String(url).slice(i);
};

module.exports = { saveBuffer, loadImage, localFileFor, publicBase, isPublicUrl, refreshUrl, GENERATED_DIR, LOGO_DIR, UPLOADS_ROOT };
