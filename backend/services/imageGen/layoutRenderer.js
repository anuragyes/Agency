// ─────────────────────────────────────────────────────────────
// layoutRenderer.js — layout JSON -> SVG (pure functions, no I/O)
//   renderPreviewSvg()  colored sketch the USER approves (product outline, props, real headline / CTA, logo box)
//   renderScribbleSvg() the sketch the photo model follows (NO text): white-on-black for ControlNet, black-on-white for Stability AI
//   textOverlaySvg()    the real typography (scrim + headline + subline + CTA) — same code for preview and final ad
//                       text is drawn as outlined paths in the layout's font pair (fontEngine) -> identical everywhere
// Coordinates: the canvas is the FINAL ad size (1080 x H); the scribble is drawn in the same units and scaled down.
// ─────────────────────────────────────────────────────────────
const { ASPECTS, COMPOSITIONS, PRODUCT_SHAPES, FONT_PAIRS, DEFAULT_FONT_PAIR } = require("../../ai/imageGen/AdLayoutSpecs.js");
const fonts = require("./fontEngine.js");
const Brand = require("../../ai/imageGen/BrandKit.js");

const FONT = process.env.AD_FONT_FAMILY || "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

/** percent box -> px box on a W x H canvas */
const px = (box, W, H) => ({ x: (box.x / 100) * W, y: (box.y / 100) * H, w: (box.w / 100) * W, h: (box.h / 100) * H });

const canvasOf = (layout) => {
    const a = ASPECTS[layout.aspectRatio] || ASPECTS["4:5"];
    return { W: a.width, H: a.height, sd: a.sd };
};

/**
 * Brand kit: the logo's corner + clear space is reserved, so the text block, the product and the props
 * never enter it (logo rules: never behind other elements). Without layout.brand -> the composition's boxes.
 * @returns {{ logo: {box, zone, clear, corner} | null, text: pxBox, product: pxBox }}
 */
const areasOf = (layout, W, H, { logoAspect } = {}) => {
    const comp = COMPOSITIONS[layout.composition] || COMPOSITIONS["text-top"];
    const text = px(comp.text, W, H);
    const product = px(comp.product, W, H);
    if (!layout.brand) return { logo: null, text, product };
    const logo = Brand.logoPlacement(layout.brand, W, H, logoAspect);
    return { logo, text: Brand.avoidZone(text, logo.zone), product: Brand.avoidZone(product, logo.zone) };
};

/** props that would sit in the logo's clear space are left out (brand kit) */
const visibleProps = (layout, W, H) => {
    const zone = areasOf(layout, W, H).logo?.zone;
    return (layout.props || []).filter((p) => !zone || !Brand.intersects(px(p, W, H), zone));
};

/* ── shapes: each returns { fill: [d...], line: [d...] } inside the px box (x, y, w, h) ── */
const pt = (b) => (fx, fy) => `${r1(b.x + fx * b.w)},${r1(b.y + fy * b.h)}`;
const rrect = (b, x0, y0, x1, y1, rad) => {
    const P = pt(b);
    const rx = rad / b.w;
    const ry = rad / b.h;
    return `M${P(x0 + rx, y0)} L${P(x1 - rx, y0)} Q${P(x1, y0)} ${P(x1, y0 + ry)} L${P(x1, y1 - ry)} Q${P(x1, y1)} ${P(x1 - rx, y1)} L${P(x0 + rx, y1)} Q${P(x0, y1)} ${P(x0, y1 - ry)} L${P(x0, y0 + ry)} Q${P(x0, y0)} ${P(x0 + rx, y0)} Z`;
};
const ellipse = (cx, cy, rx, ry) => `M${r1(cx - rx)},${r1(cy)} A${r1(rx)} ${r1(ry)} 0 1 0 ${r1(cx + rx)},${r1(cy)} A${r1(rx)} ${r1(ry)} 0 1 0 ${r1(cx - rx)},${r1(cy)} Z`;

const PRODUCT_DRAW = {
    bottle: (b) => {
        const P = pt(b);
        return {
            fill: [
                `M${P(0.36, 0.13)} L${P(0.36, 0.24)} C${P(0.36, 0.3)} ${P(0, 0.3)} ${P(0, 0.4)} L${P(0, 0.96)} Q${P(0, 1)} ${P(0.06, 1)} L${P(0.94, 1)} Q${P(1, 1)} ${P(1, 0.96)} L${P(1, 0.4)} C${P(1, 0.3)} ${P(0.64, 0.3)} ${P(0.64, 0.24)} L${P(0.64, 0.13)} Z`,
                rrect(b, 0.31, 0, 0.69, 0.13, b.w * 0.05),
            ],
            line: [`M${P(0, 0.52)} L${P(1, 0.52)}`, `M${P(0, 0.8)} L${P(1, 0.8)}`, `M${P(0.15, 0.44)} L${P(0.15, 0.92)}`],
        };
    },
    jar: (b) => {
        const P = pt(b);
        return {
            fill: [rrect(b, 0, 0.17, 1, 1, b.w * 0.09), rrect(b, 0.05, 0, 0.95, 0.17, b.w * 0.04)],
            line: [`M${P(0.05, 0.085)} L${P(0.95, 0.085)}`, `M${P(0, 0.42)} L${P(1, 0.42)}`, `M${P(0, 0.8)} L${P(1, 0.8)}`],
        };
    },
    box: (b) => {
        const P = pt(b);
        return {
            fill: [
                `M${P(0, 0.2)} L${P(0.78, 0.2)} L${P(0.78, 1)} L${P(0, 1)} Z`,
                `M${P(0, 0.2)} L${P(0.22, 0)} L${P(1, 0)} L${P(0.78, 0.2)} Z`,
                `M${P(0.78, 0.2)} L${P(1, 0)} L${P(1, 0.8)} L${P(0.78, 1)} Z`,
            ],
            line: [`M${P(0.1, 0.6)} L${P(0.68, 0.6)}`],
        };
    },
    tube: (b) => {
        const P = pt(b);
        return {
            fill: [`M${P(0, 0)} L${P(1, 0)} L${P(1, 0.05)} L${P(0.84, 0.8)} L${P(0.16, 0.8)} L${P(0, 0.05)} Z`, rrect(b, 0.2, 0.8, 0.8, 1, b.w * 0.06)],
            line: [`M${P(0, 0.035)} L${P(1, 0.035)}`, `M${P(0.12, 0.32)} L${P(0.88, 0.32)}`],
        };
    },
    can: (b) => {
        const P = pt(b);
        const rx = b.w / 2;
        const ry = b.h * 0.06;
        return {
            fill: [`M${P(0, 0.06)} L${P(0, 0.94)} A${r1(rx)} ${r1(ry)} 0 0 0 ${P(1, 0.94)} L${P(1, 0.06)} A${r1(rx)} ${r1(ry)} 0 0 0 ${P(0, 0.06)} Z`],
            line: [
                ellipse(b.x + rx, b.y + ry, rx, ry),
                `M${P(0, 0.32)} A${r1(rx)} ${r1(ry)} 0 0 0 ${P(1, 0.32)}`,
                `M${P(0, 0.74)} A${r1(rx)} ${r1(ry)} 0 0 0 ${P(1, 0.74)}`,
            ],
        };
    },
    pouch: (b) => {
        const P = pt(b);
        return {
            fill: [
                `M${P(0.03, 0.09)} L${P(0.97, 0.09)} C${P(1, 0.5)} ${P(1, 0.85)} ${P(0.95, 1)} L${P(0.05, 1)} C${P(0, 0.85)} ${P(0, 0.5)} ${P(0.03, 0.09)} Z`,
                `M${P(0.03, 0)} L${P(0.97, 0)} L${P(0.97, 0.09)} L${P(0.03, 0.09)} Z`,
            ],
            line: [`M${P(0.05, 0.17)} L${P(0.95, 0.17)}`, `M${P(0.1, 0.93)} Q${P(0.5, 0.86)} ${P(0.9, 0.93)}`],
        };
    },
    cup: (b) => {
        const P = pt(b);
        const rx = b.w / 2;
        const ry = b.h * 0.06;
        return {
            fill: [`M${P(0, 0.06)} A${r1(rx)} ${r1(ry)} 0 0 0 ${P(1, 0.06)} L${P(0.86, 0.96)} A${r1(b.w * 0.36)} ${r1(b.h * 0.04)} 0 0 1 ${P(0.14, 0.96)} Z`],
            line: [ellipse(b.x + rx, b.y + ry, rx, ry), `M${P(0.05, 0.4)} L${P(0.95, 0.4)}`, `M${P(0.09, 0.66)} L${P(0.91, 0.66)}`],
        };
    },
    phone: (b) => ({
        fill: [rrect(b, 0, 0, 1, 1, b.w * 0.12)],
        line: [rrect(b, 0.06, 0.05, 0.94, 0.95, b.w * 0.06), ellipse(b.x + b.w * 0.5, b.y + b.h * 0.025, b.w * 0.03, b.w * 0.03)],
    }),
    laptop: (b) => {
        const P = pt(b);
        return {
            fill: [rrect(b, 0.1, 0, 0.9, 0.8, b.w * 0.02), `M${P(0.1, 0.8)} L${P(0.9, 0.8)} L${P(1, 1)} L${P(0, 1)} Z`],
            line: [`M${P(0.14, 0.05)} L${P(0.86, 0.05)} L${P(0.86, 0.74)} L${P(0.14, 0.74)} Z`, `M${P(0.42, 0.91)} L${P(0.58, 0.91)}`],
        };
    },
    shoe: (b) => {
        const P = pt(b);
        return {
            fill: [
                `M${P(0, 0.95)} L${P(0, 0.62)} Q${P(0.02, 0.35)} ${P(0.12, 0.3)} L${P(0.3, 0.28)} Q${P(0.38, 0)} ${P(0.48, 0.08)} L${P(0.62, 0.45)} Q${P(0.8, 0.55)} ${P(0.95, 0.62)} Q${P(1, 0.72)} ${P(1, 0.85)} L${P(1, 0.95)} Q${P(1, 1)} ${P(0.95, 1)} L${P(0.05, 1)} Q${P(0, 1)} ${P(0, 0.95)} Z`,
            ],
            line: [`M${P(0, 0.84)} L${P(1, 0.84)}`, `M${P(0.4, 0.2)} L${P(0.52, 0.24)}`, `M${P(0.44, 0.3)} L${P(0.56, 0.34)}`, `M${P(0.48, 0.4)} L${P(0.6, 0.44)}`],
        };
    },
    watch: (b) => {
        const P = pt(b);
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        return {
            fill: [
                `M${P(0.22, 0)} L${P(0.78, 0)} L${P(0.74, 0.3)} L${P(0.26, 0.3)} Z`,
                `M${P(0.26, 0.7)} L${P(0.74, 0.7)} L${P(0.78, 1)} L${P(0.22, 1)} Z`,
                ellipse(cx, cy, b.w * 0.5, b.w * 0.5),
            ],
            line: [ellipse(cx, cy, b.w * 0.4, b.w * 0.4), `M${r1(cx)},${r1(cy)} L${r1(cx)},${r1(cy - b.w * 0.3)}`, `M${r1(cx)},${r1(cy)} L${r1(cx + b.w * 0.22)},${r1(cy)}`],
        };
    },
    bag: (b) => {
        const P = pt(b);
        return {
            fill: [`M${P(0.08, 0.32)} L${P(0.92, 0.32)} L${P(1, 1)} L${P(0, 1)} Z`],
            line: [`M${P(0.28, 0.32)} C${P(0.28, -0.05)} ${P(0.72, -0.05)} ${P(0.72, 0.32)}`, `M${P(0.06, 0.46)} L${P(0.94, 0.46)}`],
        };
    },
    garment: (b) => {
        const P = pt(b);
        return {
            fill: [`M${P(0.33, 0)} Q${P(0.5, 0.12)} ${P(0.67, 0)} L${P(1, 0.14)} L${P(0.9, 0.36)} L${P(0.8, 0.3)} L${P(0.8, 1)} L${P(0.2, 1)} L${P(0.2, 0.3)} L${P(0.1, 0.36)} L${P(0, 0.14)} Z`],
            line: [`M${P(0.37, 0.02)} Q${P(0.5, 0.16)} ${P(0.63, 0.02)}`],
        };
    },
    generic: (b) => {
        const P = pt(b);
        return { fill: [rrect(b, 0, 0, 1, 1, b.w * 0.12)], line: [`M${P(0.12, 0.62)} L${P(0.88, 0.62)}`] };
    },
};

const PROP_DRAW = {
    circle: (b) => ({ fill: [ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.min(b.w, b.h) / 2, Math.min(b.w, b.h) / 2)], line: [] }),
    ellipse: (b) => ({ fill: [ellipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2)], line: [] }),
    rect: (b) => ({ fill: [rrect(b, 0, 0, 1, 1, Math.min(b.w, b.h) * 0.12)], line: [] }),
    leaf: (b) => {
        const P = pt(b);
        return { fill: [`M${P(0, 0.5)} Q${P(0.5, -0.15)} ${P(1, 0.5)} Q${P(0.5, 1.15)} ${P(0, 0.5)} Z`], line: [`M${P(0.02, 0.5)} L${P(0.95, 0.5)}`] };
    },
    blob: (b) => {
        const P = pt(b);
        return { fill: [`M${P(0.5, 0)} C${P(0.85, 0)} ${P(1, 0.3)} ${P(0.95, 0.55)} C${P(0.9, 0.85)} ${P(0.65, 1)} ${P(0.42, 0.98)} C${P(0.15, 0.95)} ${P(0, 0.75)} ${P(0.04, 0.45)} C${P(0.08, 0.15)} ${P(0.25, 0)} ${P(0.5, 0)} Z`], line: [] };
    },
    wave: (b) => {
        const P = pt(b);
        return { fill: [], line: [`M${P(0, 0.5)} C${P(0.17, 0)} ${P(0.33, 0)} ${P(0.5, 0.5)} S${P(0.83, 1)} ${P(1, 0.5)}`] };
    },
    line: (b) => {
        const P = pt(b);
        return { fill: [], line: [`M${P(0, 0.5)} L${P(1, 0.5)}`] };
    },
};

/** The product's px box: its natural shape ratio fitted in the composition box (bottom-aligned, or centered for flat lays) */
const productBox = (layout, W, H) => {
    const comp = COMPOSITIONS[layout.composition];
    const box = areasOf(layout, W, H).product;
    const ratio = PRODUCT_SHAPES[layout.productShape]?.ratio || 1;
    let w = box.w;
    let h = box.w / ratio;
    if (h > box.h) {
        h = box.h;
        w = box.h * ratio;
    }
    const x = box.x + (box.w - w) / 2;
    const y = comp.surfaceY == null ? box.y + (box.h - h) / 2 : box.y + box.h - h;
    return { x, y, w, h };
};

/** Table / floor line, split around the product so it never crosses its outline */
const surfacePaths = (layout, W, H, pb) => {
    const comp = COMPOSITIONS[layout.composition];
    if (comp.surfaceY == null) return [];
    const y = r1((comp.surfaceY / 100) * H);
    if (y <= pb.y || y >= pb.y + pb.h) return [`M0,${y} L${W},${y}`];
    const gap = W * 0.01;
    return [`M0,${y} L${r1(pb.x - gap)},${y}`, `M${r1(pb.x + pb.w + gap)},${y} L${W},${y}`];
};

/* ── colors ── */
const luminance = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!m) return 0.5;
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** "light" = white text on a dark scrim (dark / busy photo), "dark" = dark text on a light scrim */
const themeForBackground = (hexColor) => (luminance(hexColor) > 0.45 ? "dark" : "light");

/* ── typography ── */
// Real font metrics (fontEngine) decide every line break and size -> text always fits its box, in any font pair.
// When the font files / opentype.js are missing, or a line uses a script we can't shape (Hindi...), the old
// width estimate + SVG <text> are used for that line.
const MIN_HEAD_FS = 30;
const MIN_SUB_FS = 22;
const MIN_CTA_FS = 16;
const EST = { heading: 0.56, body: 0.5, cta: 0.64 }; // fallback: average glyph width / font size

const fontPairOf = (layout) => FONT_PAIRS[layout?.fontPair] || FONT_PAIRS[DEFAULT_FONT_PAIR];
const cssFamily = (spec) => `'${spec.family}', 'Nirmala UI', 'Noto Sans Devanagari', ${FONT}`;

/** role ("heading" | "body" | "cta") -> { spec, face, tracking, measure(text, fs) } */
const typeOf = (layout, role) => {
    const spec = fontPairOf(layout)[role];
    const face = fonts.face(spec);
    const tracking = spec.tracking || 0;
    const measure = (text, fs) =>
        face && fonts.canRender(face, text) ? fonts.measure(face, text, fs, tracking) : String(text || "").length * fs * EST[role];
    return { spec, face, tracking, measure };
};

/** Greedy word wrap by measured width. overflow = needed more than maxLines, or one word is wider than the box. */
const wrapByWidth = (text, maxW, maxLines, measure) => {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (!cur || measure(next) <= maxW) cur = next;
        else {
            lines.push(cur);
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
        const kept = lines.slice(0, maxLines);
        let last = `${kept[maxLines - 1].replace(/[.,;:!?]?$/, "")}…`;
        while (measure(last) > maxW && /\s/.test(last)) last = `${last.replace(/\s+\S+$/, "").replace(/[.,;:!?]?$/, "")}…`;
        kept[maxLines - 1] = last;
        return { lines: kept, overflow: true };
    }
    return { lines, overflow: lines.some((l) => measure(l) > maxW + 0.5) };
};

/**
 * Same number of lines, but as even as possible (like CSS text-wrap: balance): finds the narrowest width that
 * still gives n lines -> no lonely last word ("Pure Bilona A2 Ghee, only / ₹499" -> "Pure Bilona A2 / Ghee, only ₹499").
 */
const balanceLines = (text, maxW, maxLines, measure) => {
    const first = wrapByWidth(text, maxW, maxLines, measure);
    if (first.overflow || first.lines.length < 2) return first;
    let lo = maxW * 0.4;
    let hi = maxW;
    let best = first;
    for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        const r = wrapByWidth(text, mid, maxLines, measure);
        if (!r.overflow && r.lines.length === first.lines.length) {
            best = r;
            hi = mid;
        } else lo = mid;
    }
    return best;
};

/** old character-count wrap (kept for callers that only know a max character count) */
const wrap = (text, maxChars, maxLines) => wrapByWidth(text, maxChars, maxLines, (s) => s.length);

/**
 * Lay out headline / subline / CTA in the composition's text box with the layout's font pair.
 * Sizes shrink until everything fits (headline max 3 lines, subline max 3 lines, CTA on one line).
 * Returns positions in canvas px (used by the SVG + tests) and issues[] when text can't fit even at the minimum size.
 */
/** font size rules: brand kit = the brand's ranges (TYPE in BrandKit.js), else the old free sizing */
const sizeRules = (layout, box, W) => {
    if (layout.brand) {
        const T = Brand.typeSizes(W);
        const clampN = (n, a, b) => Math.round(Math.min(b, Math.max(a, n)));
        return {
            cap: Math.min(T.headline.max, Math.max(T.headline.min, Math.min(box.w * 0.15, box.h * 0.36))),
            headFloor: T.headline.floor,
            headLines: box.w < W * 0.5 ? 4 : 3,
            // a headline in its range -> subheading in its range; a long headline below its range pulls the subline down with it
            subStart: (h) => (h >= T.headline.min ? clampN(h * 0.55, T.subline.min, T.subline.max) : clampN(h * 0.6, T.subline.floor, T.subline.min)),
            subFloor: T.subline.floor,
            ctaStart: (sub) => clampN(sub * 0.8, T.cta.min, T.cta.max),
            ctaFloor: T.cta.floor,
        };
    }
    return {
        cap: Math.min(112, box.w * 0.15, box.h * 0.36),
        headFloor: MIN_HEAD_FS,
        headLines: 3,
        subStart: (h) => Math.round(Math.min(42, Math.max(MIN_SUB_FS + 2, h * 0.42))),
        subFloor: MIN_SUB_FS,
        ctaStart: (sub) => Math.round(Math.min(36, Math.max(24, sub))),
        ctaFloor: MIN_CTA_FS,
    };
};

const layoutText = (layout, W, H) => {
    const comp = COMPOSITIONS[layout.composition];
    const box = areasOf(layout, W, H).text;
    const S = sizeRules(layout, box, W);
    const t = layout.texts || {};
    const headT = typeOf(layout, "heading");
    const bodyT = typeOf(layout, "body");
    const ctaT = typeOf(layout, "cta");
    const lh = headT.spec.lineHeight || 1.08;
    const CTA_PAD = 2.4; // CTA horizontal padding, in em (both sides together)

    /** all sizes for a given largest headline size -> { head, sub, cta, total, issues } */
    const fit = (capFs) => {
        const issues = [];
        let head = { fs: 0, lines: [] };
        let headOverflow = false;
        for (let fs = Math.round(capFs); fs >= S.headFloor; fs -= 2) {
            const { lines, overflow } = balanceLines(t.headline, box.w, S.headLines, (s) => headT.measure(s, fs));
            head = { fs, lines };
            headOverflow = overflow;
            if (!overflow && lines.length * fs * lh <= box.h * 0.6) break;
        }
        if (t.headline && headOverflow) issues.push({ code: "text-too-long", target: "headline", detail: `Headline doesn't fit in ${S.headLines} lines even at the smallest readable size — shorten it.` });

        let sub = { fs: S.subStart(head.fs), lines: [] };
        if (t.subline) {
            for (let fs = sub.fs; fs >= S.subFloor; fs -= 2) {
                // brand kit: balanced lines (no lonely last word like "aged / 8–14")
                const r = (layout.brand ? balanceLines : wrapByWidth)(t.subline, box.w, 3, (s) => bodyT.measure(s, fs));
                sub = { fs, lines: r.lines };
                if (!r.overflow) break;
                if (fs - 2 < S.subFloor) issues.push({ code: "text-too-long", target: "subline", detail: "Subline doesn't fit in 3 lines — shorten it." });
            }
        }

        // button font shrinks until the whole CTA fits the text box width on one line (never clipped)
        let cta = null;
        if (t.cta) {
            let fs = S.ctaStart(sub.fs);
            while (fs > S.ctaFloor && ctaT.measure(t.cta, fs) + fs * CTA_PAD > box.w) fs -= 1;
            const textW = ctaT.measure(t.cta, fs);
            if (textW + fs * CTA_PAD > box.w + 0.5) issues.push({ code: "text-too-long", target: "cta", detail: "Button text is too long — shorten it." });
            cta = { fs, textW, h: Math.round(Math.max(fs * 2.1, 44)), w: Math.round(Math.min(box.w, textW + fs * CTA_PAD)) };
        }

        const headH = head.lines.length * head.fs * lh;
        const subH = sub.lines.length * sub.fs * 1.3;
        const gap1 = sub.lines.length ? head.fs * 0.35 : 0;
        const gap2 = cta ? sub.fs * 0.9 : 0;
        return { head, sub, cta, headH, subH, gap1, gap2, total: headH + gap1 + subH + gap2 + (cta ? cta.h : 0), issues };
    };

    // the WHOLE block (headline + subline + button) must fit the text box -> shrink the headline until it does
    let capFs = S.cap;
    let F = fit(capFs);
    while (F.total > box.h && F.head.fs > S.headFloor) {
        capFs = F.head.fs - 2;
        F = fit(capFs);
    }
    if (F.total > box.h + 0.5) F.issues.push({ code: "text-too-tall", target: "text", detail: "Texts are too long for this layout — shorten the subline or headline." });
    const { head, sub, cta, headH, subH, gap1, gap2, total, issues } = F;

    let top;
    if (comp.emptyArea === "top") top = box.y;
    else if (comp.emptyArea === "bottom") top = box.y + box.h - total;
    else top = box.y + (box.h - total) / 2;
    top = Math.max(0, Math.min(Math.max(box.y, top), H - total - H * 0.02));

    const center = comp.align === "center";
    const x = center ? box.x + box.w / 2 : box.x;
    return {
        box, align: comp.align, x, top, total,
        fontPair: FONT_PAIRS[layout.fontPair] ? layout.fontPair : DEFAULT_FONT_PAIR,
        lineHeight: lh,
        headline: { ...head, y: top + head.fs * 0.9 },
        subline: { ...sub, y: top + headH + gap1 + sub.fs * 0.95 },
        cta: cta && { ...cta, x: center ? x - cta.w / 2 : x, y: top + headH + gap1 + subH + gap2 },
        issues,
    };
};

/** Gradient behind the text so it stays readable on any photo */
const scrimSvg = (layout, W, H, theme) => {
    const comp = COMPOSITIONS[layout.composition];
    const tb = areasOf(layout, W, H).text;
    const bc = layout.brand ? Brand.TEXT_COLORS[theme === "light" ? "light" : "dark"] : null;
    // brand kit: deep learning-blue scrim under white text, white scrim under dark text
    const color = bc ? bc.scrim : theme === "light" ? "#000000" : "#ffffff";
    const strong = bc ? bc.scrimOpacity : theme === "light" ? 0.62 : 0.72;
    let rect;
    let grad;
    if (comp.emptyArea === "top") {
        rect = { x: 0, y: 0, w: W, h: Math.min(H, tb.y + tb.h + H * 0.1) };
        grad = { x1: 0, y1: 0, x2: 0, y2: 1, from: strong, to: 0 };
    } else if (comp.emptyArea === "bottom") {
        const y = Math.max(0, tb.y - H * 0.1);
        rect = { x: 0, y, w: W, h: H - y };
        grad = { x1: 0, y1: 0, x2: 0, y2: 1, from: 0, to: strong };
    } else if (comp.emptyArea === "left side") {
        rect = { x: 0, y: 0, w: Math.min(W, tb.x + tb.w + W * 0.08), h: H };
        grad = { x1: 0, y1: 0, x2: 1, y2: 0, from: strong, to: 0 };
    } else {
        const x = Math.max(0, tb.x - W * 0.08);
        rect = { x, y: 0, w: W - x, h: H };
        grad = { x1: 0, y1: 0, x2: 1, y2: 0, from: 0, to: strong };
    }
    return `<defs><linearGradient id="scrim" x1="${grad.x1}" y1="${grad.y1}" x2="${grad.x2}" y2="${grad.y2}">` +
        `<stop offset="0" stop-color="${color}" stop-opacity="${grad.from}"/><stop offset="1" stop-color="${color}" stop-opacity="${grad.to}"/></linearGradient></defs>` +
        `<rect x="${r1(rect.x)}" y="${r1(rect.y)}" width="${r1(rect.w)}" height="${r1(rect.h)}" fill="url(#scrim)"/>`;
};

/** One line of text: an outlined <path> in the real font, or an SVG <text> fallback (missing fonts / complex scripts) */
const lineSvg = (T, text, fs, x, y, anchor, attrs) =>
    T.face && fonts.canRender(T.face, text)
        ? `<path d="${fonts.pathFor(T.face, text, fs, x, y, { anchor, tracking: T.tracking })}" ${attrs}/>`
        : `<text x="${r1(x)}" y="${r1(y)}" font-family="${esc(cssFamily(T.spec))}" font-size="${fs}" font-weight="${T.spec.weight}" text-anchor="${anchor}" ${attrs}>${esc(text)}</text>`;

/**
 * The real typography layer (SVG elements, no <svg> root).
 * @param {"light"|"dark"} theme  light = white text (dark photo), dark = near-black text (bright photo)
 */
const textOverlaySvg = (layout, W, H, { theme = "light", scrim = true } = {}) => {
    const L = layoutText(layout, W, H);
    const anchor = L.align === "center" ? "middle" : "start";
    const bc = layout.brand ? Brand.TEXT_COLORS[theme === "light" ? "light" : "dark"] : null;
    // brand kit: ILP Red headline + Learning Blue subline on light areas, white on dark; red button with white text
    const main = bc ? bc.headline : theme === "light" ? "#ffffff" : "#111111";
    const soft = bc ? bc.subline : theme === "light" ? "#ffffff" : "#222222";
    const accent = layout.brand ? Brand.TEXT_COLORS.cta.background : layout.palette?.accent || "#7c3aed";
    const ctaText = layout.brand ? Brand.TEXT_COLORS.cta.text : luminance(accent) > 0.5 ? "#111111" : "#ffffff";
    const headT = typeOf(layout, "heading");
    const bodyT = typeOf(layout, "body");
    const ctaT = typeOf(layout, "cta");
    const parts = [];
    if (scrim) parts.push(scrimSvg(layout, W, H, theme));
    // each block in a labelled group: the words stay readable for screen readers / tests even when drawn as paths
    const group = (role, text, inner) => `<g data-role="${role}" aria-label="${esc(text)}">${inner}</g>`;
    if (L.headline.lines.length) {
        parts.push(group("headline", L.headline.lines.join(" "), L.headline.lines
            .map((l, i) => lineSvg(headT, l, L.headline.fs, L.x, L.headline.y + i * L.headline.fs * L.lineHeight, anchor, `fill="${main}"`)).join("")));
    }
    if (L.subline.lines.length) {
        parts.push(group("subline", L.subline.lines.join(" "), L.subline.lines
            .map((l, i) => lineSvg(bodyT, l, L.subline.fs, L.x, L.subline.y + i * L.subline.fs * 1.3, anchor, `fill="${soft}" fill-opacity="0.92"`)).join("")));
    }
    if (L.cta) {
        const c = L.cta;
        parts.push(group("cta", layout.texts.cta, `<rect x="${r1(c.x)}" y="${r1(c.y)}" width="${c.w}" height="${c.h}" rx="${r1(c.h / 2)}" fill="${accent}"/>` +
            lineSvg(ctaT, layout.texts.cta, c.fs, c.x + c.w / 2, c.y + c.h / 2 + c.fs * 0.35, "middle", `fill="${ctaText}"`)));
    }
    return parts.join("");
};

const drawShape = (shape, attrsFill, attrsLine) =>
    shape.fill.map((d) => `<path d="${d}" ${attrsFill}/>`).join("") + shape.line.map((d) => `<path d="${d}" ${attrsLine}/>`).join("");

/**
 * The sketch the user approves (final ad size, viewBox units = px).
 * @param {Object} [opts] { logoUrl, theme }
 */
const renderPreviewSvg = (layout, { logoUrl, productPhotoUrl, theme } = {}) => {
    const { W, H } = canvasOf(layout);
    const comp = COMPOSITIONS[layout.composition];
    const pal = layout.palette || {};
    const pb = productBox(layout, W, H);
    const stroke = "#2b2440";
    const parts = [];

    parts.push(`<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.background}"/><stop offset="1" stop-color="${pal.surface}" stop-opacity="0.55"/></linearGradient></defs>`);
    parts.push(`<rect width="${W}" height="${H}" fill="url(#bg)"/>`);
    if (comp.surfaceY != null) {
        const sy = (comp.surfaceY / 100) * H;
        parts.push(`<rect x="0" y="${r1(sy)}" width="${W}" height="${r1(H - sy)}" fill="${pal.surface}"/>`);
    }
    for (const d of surfacePaths(layout, W, H, pb)) parts.push(`<path d="${d}" stroke="${stroke}" stroke-opacity="0.35" stroke-width="3" fill="none"/>`);

    for (const p of visibleProps(layout, W, H)) {
        const b = px(p, W, H);
        parts.push(drawShape((PROP_DRAW[p.shape] || PROP_DRAW.blob)(b),
            `fill="${pal.accent}" fill-opacity="0.18" stroke="${stroke}" stroke-opacity="0.55" stroke-width="3" stroke-dasharray="10 7"`,
            `fill="none" stroke="${stroke}" stroke-opacity="0.55" stroke-width="3"`));
        if (p.label) parts.push(`<text x="${r1(b.x + b.w / 2)}" y="${r1(b.y + b.h / 2 + 8)}" font-family="${esc(FONT)}" font-size="22" fill="${stroke}" fill-opacity="0.75" text-anchor="middle">${esc(p.label)}</text>`);
    }

    // contact shadow + product
    if (comp.surfaceY != null) parts.push(`<path d="${ellipse(pb.x + pb.w / 2, pb.y + pb.h, pb.w * 0.6, Math.max(8, pb.h * 0.04))}" fill="#000" fill-opacity="0.12"/>`);
    if (productPhotoUrl) {
        // "your real product photo" mode: show the real pack where it will stand (same box as the final image)
        const box = areasOf(layout, W, H).product;
        const align = comp.surfaceY == null ? "xMidYMid" : "xMidYMax";
        parts.push(`<image href="${esc(productPhotoUrl)}" x="${r1(box.x)}" y="${r1(box.y)}" width="${r1(box.w)}" height="${r1(box.h)}" preserveAspectRatio="${align} meet"/>`);
    } else {
        parts.push(drawShape((PRODUCT_DRAW[layout.productShape] || PRODUCT_DRAW.generic)(pb),
            `fill="#ffffff" fill-opacity="0.82" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"`,
            `fill="none" stroke="${stroke}" stroke-opacity="0.6" stroke-width="3"`));
    }
    const nameFs = Math.max(18, Math.min(30, pb.w * 0.1));
    if (layout.productName && !productPhotoUrl) {
        parts.push(`<text x="${r1(pb.x + pb.w / 2)}" y="${r1(pb.y + pb.h * 0.66)}" font-family="${esc(FONT)}" font-size="${r1(nameFs)}" font-weight="700" fill="${stroke}" text-anchor="middle">${esc(layout.productName.slice(0, 28))}</text>`);
    }

    // text block (real typography) + logo box
    parts.push(textOverlaySvg(layout, W, H, { theme: theme || themeForBackground(pal.background) }));
    // brand kit: the logo's real place (corner, width %, clear space); else the composition's logo box
    const lb = layout.brand ? areasOf(layout, W, H).logo.box : px(comp.logo, W, H);
    // the user's logo OR icon, pushed into its corner like the final image (drawn as uploaded, no background)
    const anchor = layout.brand?.logoCorner === "bottom-right" ? "xMaxYMax" : layout.brand ? "xMinYMin" : "xMidYMid";
    if (logoUrl) parts.push(`<image href="${esc(logoUrl)}" x="${r1(lb.x)}" y="${r1(lb.y)}" width="${r1(lb.w)}" height="${r1(lb.h)}" preserveAspectRatio="${anchor} meet"/>`);
    else {
        parts.push(`<rect x="${r1(lb.x)}" y="${r1(lb.y)}" width="${r1(lb.w)}" height="${r1(lb.h)}" rx="10" fill="#ffffff" fill-opacity="0.5" stroke="${stroke}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 6"/>` +
            `<text x="${r1(lb.x + lb.w / 2)}" y="${r1(lb.y + lb.h / 2 + 8)}" font-family="${esc(FONT)}" font-size="22" font-weight="700" fill="${stroke}" fill-opacity="0.7" text-anchor="middle">LOGO</text>`);
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join("")}</svg>`;
};

/**
 * The sketch the photo model follows. Only the product + props + surface line — the text area stays EMPTY
 * so the photo keeps clean space there. No text is ever drawn.
 *   default            white lines on black at Stable Diffusion size  -> ControlNet Scribble (local WebUI)
 *   { size: "final", invert: true }  black lines on white at the final ad size -> Stability AI "Control: Sketch"
 */
const renderScribbleSvg = (layout, { size = "sd", invert = false } = {}) => {
    const { W, H, sd } = canvasOf(layout);
    const out = size === "final" ? { width: W, height: H } : sd;
    const bg = invert ? "#ffffff" : "#000000";
    const ink = invert ? "#000000" : "#ffffff";
    const sw = r1(5 * (W / out.width)); // ≈5px lines at the output size (sketch models like bold strokes)
    const attrs = `fill="none" stroke="${ink}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`;
    const pb = productBox(layout, W, H);
    const parts = [`<rect width="${W}" height="${H}" fill="${bg}"/>`];
    for (const d of surfacePaths(layout, W, H, pb)) parts.push(`<path d="${d}" ${attrs}/>`);
    for (const p of visibleProps(layout, W, H)) parts.push(drawShape((PROP_DRAW[p.shape] || PROP_DRAW.blob)(px(p, W, H)), attrs, attrs));
    parts.push(drawShape((PRODUCT_DRAW[layout.productShape] || PRODUCT_DRAW.generic)(pb), attrs, attrs));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${out.width}" height="${out.height}">${parts.join("")}</svg>`;
};

module.exports = {
    renderPreviewSvg,
    renderScribbleSvg,
    textOverlaySvg,
    layoutText,
    productBox,
    areasOf,
    visibleProps,
    canvasOf,
    px,
    luminance,
    themeForBackground,
    wrap,
    wrapByWidth,
    balanceLines,
    fontPairOf,
    typeOf,
    esc,
};
