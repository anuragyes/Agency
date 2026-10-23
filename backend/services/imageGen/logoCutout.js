// ─────────────────────────────────────────────────────────────
// logoCutout.js — makes the user's logo transparent before it is drawn on an image
//   Many uploaded logos are JPEGs or PNGs with a solid white / blue / any-colour background (or a white tile
//   with rounded corners). Drawn as-is, that background shows up as a box on every generated post.
//   cutOutLogo():
//     1. finds the background colour from the image border (only when one colour clearly dominates it)
//     2. flood-fills it from the edges -> transparent (soft, de-fringed edges; colours INSIDE the logo,
//        e.g. a white face or white eyes enclosed by an outline, are kept because the fill can't reach them)
//     3. trims the empty margin, so the mark is sized by what is really visible and sits tight in its corner
//   Already-transparent PNG / SVG files only get step 3. Safe: if the result looks wrong (almost nothing
//   left), the original pixels are kept.
// ─────────────────────────────────────────────────────────────
const sharp = require("sharp");

const MAX_SIDE = 1200;   // plenty for a mark that is at most ~25 % of a 1080–1920 px canvas
const HARD = 40;         // RGB distance (0–441) still counted as background -> fully transparent
const SOFT = 95;         // up to this distance, edge pixels next to the background fade out (anti-aliasing)
const SEE_THROUGH = 24;  // alpha below this = already transparent

/** border pixels -> dominant opaque colour, or null when the border is mostly transparent / mixed */
const borderBackground = (data, W, H) => {
    const bins = new Map();
    let opaque = 0;
    let total = 0;
    const visit = (x, y) => {
        const i = (y * W + x) * 4;
        total++;
        if (data[i + 3] < 200) return;
        opaque++;
        const key = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
        const b = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += data[i]; b.g += data[i + 1]; b.b += data[i + 2];
        bins.set(key, b);
    };
    for (let x = 0; x < W; x++) { visit(x, 0); visit(x, H - 1); }
    for (let y = 1; y < H - 1; y++) { visit(0, y); visit(W - 1, y); }
    if (opaque < total * 0.25) return null; // border already (mostly) transparent -> nothing to remove

    // the most common colour, merged with its close neighbours (JPEG noise spreads one colour over several bins)
    let best = null;
    for (const b of bins.values()) if (!best || b.n > best.n) best = b;
    const bg = { r: best.r / best.n, g: best.g / best.n, b: best.b / best.n };
    let near = 0;
    for (const b of bins.values()) {
        const d = Math.hypot(b.r / b.n - bg.r, b.g / b.n - bg.g, b.b / b.n - bg.b);
        if (d < HARD) near += b.n;
    }
    if (near < opaque * 0.55) return null; // one colour has to clearly own the border
    const list = [bg];
    // a rounded tile saved as JPEG gets solid (often black) corners: if all 4 corners share another colour, clear it too
    const at = (x, y) => { const i = (y * W + x) * 4; return data[i + 3] < 200 ? null : { r: data[i], g: data[i + 1], b: data[i + 2] }; };
    const corners = [at(0, 0), at(W - 1, 0), at(0, H - 1), at(W - 1, H - 1)];
    const c0 = corners[0];
    if (c0 && corners.every((c) => c && Math.hypot(c.r - c0.r, c.g - c0.g, c.b - c0.b) < HARD)
        && Math.hypot(c0.r - bg.r, c0.g - bg.g, c0.b - bg.b) >= HARD) list.push(c0);
    return list;
};

/** alpha bounding box (with a 2 px pad), or null when the image is empty */
const alphaBox = (data, W, H) => {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * 4 + 3] > 10) {
                if (x < x0) x0 = x;
                if (x > x1) x1 = x;
                if (y < y0) y0 = y;
                if (y > y1) y1 = y;
            }
        }
    }
    if (x1 < 0) return null;
    const pad = 2;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
};

/**
 * @param {Buffer} input  the uploaded logo (PNG / JPEG / WebP / SVG)
 * @returns {Promise<{ png: Buffer, width: number, height: number, removed: boolean }>}
 */
const cutOutLogo = async (input) => {
    const { data, info } = await sharp(input, { density: 300 })
        .rotate()
        .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const W = info.width;
    const H = info.height;
    const out = Buffer.from(data);
    let removed = false;

    const bgs = borderBackground(data, W, H);
    if (bgs) {
        const [bg, corner] = bgs;
        const n = W * H;
        const seen = new Uint8Array(n);
        const queue = new Int32Array(n);
        let head = 0;
        let tail = 0;
        let cleared = 0;
        const distTo = (p, c) => { const i = p * 4; return Math.hypot(data[i] - c.r, data[i + 1] - c.g, data[i + 2] - c.b); };
        const dist = (p) => distTo(p, bg);
        const see = (p) => out[p * 4 + 3] < SEE_THROUGH; // `out` = pixels cleared so far count as transparent
        const push = (p) => { if (!seen[p]) { seen[p] = 1; queue[tail++] = p; } };
        const seedBorder = () => {
            seen.fill(0); head = 0; tail = 0;
            for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
            for (let y = 1; y < H - 1; y++) { push(y * W); push(y * W + W - 1); }
        };
        const spread = (p) => {
            const x = p % W;
            if (x > 0) push(p - 1);
            if (x < W - 1) push(p + 1);
            if (p >= W) push(p - W);
            if (p < n - W) push(p + W);
        };
        // pixel colour on the line corner-colour -> bg colour? t = 0 at the corner colour, 1 at the bg colour
        const mix = (p) => {
            const i = p * 4;
            const vx = bg.r - corner.r, vy = bg.g - corner.g, vz = bg.b - corner.b;
            const wx = data[i] - corner.r, wy = data[i + 1] - corner.g, wz = data[i + 2] - corner.b;
            const t = Math.max(0, Math.min(1, (wx * vx + wy * vy + wz * vz) / (vx * vx + vy * vy + vz * vz)));
            const off = Math.hypot(wx - t * vx, wy - t * vy, wz - t * vz);
            return off < HARD * 0.8 ? t : -1;
        };

        // pass 1 (rounded tile saved with solid corners): clear the corner colour, only where it touches the edge
        if (corner) {
            seedBorder();
            while (head < tail) {
                const p = queue[head++];
                const t = mix(p);
                if (see(p) || distTo(p, corner) < HARD || (t >= 0 && t < 0.5)) {
                    if (!see(p)) cleared++;
                    out[p * 4 + 3] = 0;
                    spread(p);
                }
            }
        }

        // pass 2: the background colour, flood-filled from the edges
        seedBorder();
        // a COLOURED background (blue, red …) also shows through the holes of letters like P, d, o -> clear those too.
        // A white / grey / black background is only cleared from the edges: enclosed white (a mascot's face or eyes) stays.
        if (Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) > 60) {
            for (let p = 0; p < n; p++) if (!see(p) && dist(p) < HARD * 0.7) push(p);
        }
        while (head < tail) {
            const p = queue[head++];
            const i = p * 4;
            const t = corner ? mix(p) : -1;
            if (see(p) || dist(p) < HARD || t >= 0.5) {
                if (!see(p)) cleared++;
                out[i + 3] = 0;
                spread(p);
            } else {
                // first pixel of the logo next to the background: fade by how close it is to the bg colour
                const d = dist(p);
                if (d < SOFT) {
                    const a = (d - HARD) / (SOFT - HARD);
                    out[i + 3] = Math.round(data[i + 3] * a);
                    // remove the background colour mixed into the edge (no white / blue halo)
                    const k = Math.max(a, 0.05);
                    out[i] = Math.max(0, Math.min(255, Math.round((data[i] - (1 - k) * bg.r) / k)));
                    out[i + 1] = Math.max(0, Math.min(255, Math.round((data[i + 1] - (1 - k) * bg.g) / k)));
                    out[i + 2] = Math.max(0, Math.min(255, Math.round((data[i + 2] - (1 - k) * bg.b) / k)));
                }
            }
        }

        // safety: if (almost) nothing of the logo is left, the "background" was the logo itself -> keep the original
        if (cleared > 0 && n - cleared > n * 0.02) removed = true;
        else data.copy(out);
    }

    const box = alphaBox(out, W, H) || { left: 0, top: 0, width: W, height: H };
    const { data: png, info: o } = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
        .extract(box)
        .png()
        .toBuffer({ resolveWithObject: true });
    return { png, width: o.width, height: o.height, removed };
};

module.exports = { cutOutLogo };
