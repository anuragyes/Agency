// ─────────────────────────────────────────────────────────────
// fontEngine.js — real fonts for the ad typography (opentype.js)
//   Fonts live in backend/assets/fonts (WOFF, SIL Open Font License — see the LICENSE-*.txt files there).
//   measure()  exact width of a line in px (glyph advances + kerning + tracking) -> text never overflows its box
//   pathFor()  the line as an SVG <path> -> the final JPEG looks the same on every server (no installed fonts needed)
//   canRender() false for scripts opentype.js can't shape (Devanagari, Arabic, Thai...) or missing glyphs
//               -> the renderer falls back to a normal SVG <text> for that line.
// ─────────────────────────────────────────────────────────────
const fs = require("fs");
const path = require("path");

let opentype = null;
try {
    opentype = require("opentype.js");
} catch {
    opentype = null; // not installed yet -> layoutRenderer uses its width estimate
}

const FONT_DIR = process.env.AD_FONT_DIR || path.join(__dirname, "../../assets/fonts");
const SUBSETS = ["latin", "latin-ext"]; // latin first; latin-ext only for what latin lacks (₹, ā, ś ...)

// Scripts that need complex shaping (opentype.js can't do it right) -> SVG <text> fallback
const COMPLEX_SCRIPT = /[֐-ࣿऀ-෿฀-໿ༀ-࿿က-႟ក-៿]/;

const fileCache = new Map();
const faceCache = new Map();

const loadFile = (file) => {
    if (fileCache.has(file)) return fileCache.get(file);
    let font = null;
    if (opentype) {
        try {
            const buf = fs.readFileSync(path.join(FONT_DIR, file));
            font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
        } catch {
            font = null;
        }
    }
    fileCache.set(file, font);
    return font;
};

/**
 * { slug: "inter", weight: 800, family: "Inter" } -> face { slug, weight, family, fonts[] } or null (fonts missing)
 */
const face = (spec) => {
    if (!spec || !spec.slug) return null;
    const key = `${spec.slug}-${spec.weight}`;
    if (faceCache.has(key)) return faceCache.get(key);
    const fonts = SUBSETS.map((sub) => loadFile(`${spec.slug}-${sub}-${spec.weight}-normal.woff`));
    const f = fonts[0] ? { slug: spec.slug, weight: spec.weight, family: spec.family || spec.slug, fonts: fonts.filter(Boolean) } : null;
    faceCache.set(key, f);
    return f;
};

const isSpace = (ch) => /\s/.test(ch);

/** first font of the face that has a real glyph for ch */
const fontFor = (f, ch) => f.fonts.find((font) => font.charToGlyphIndex(ch) > 0) || null;

const canRender = (f, text) => {
    if (!f) return false;
    const s = String(text || "");
    if (COMPLEX_SCRIPT.test(s)) return false;
    for (const ch of s) if (!isSpace(ch) && !fontFor(f, ch)) return false;
    return true;
};

/** text -> runs of consecutive characters drawn by the same font file */
const runsOf = (f, text) => {
    const runs = [];
    for (const ch of String(text || "")) {
        const font = fontFor(f, ch) || (isSpace(ch) && runs.length ? runs[runs.length - 1].font : f.fonts[0]);
        const last = runs[runs.length - 1];
        if (last && last.font === font) last.text += ch;
        else runs.push({ font, text: ch });
    }
    return runs;
};

/**
 * Glyph positions of one line. tracking = extra space between letters in em (e.g. -0.01).
 * @returns {{ width: number, items: { font, glyph, x, scale }[] }}
 */
const shape = (f, text, size, tracking = 0) => {
    const items = [];
    let x = 0;
    let prev = null;
    for (const run of runsOf(f, text)) {
        const font = run.font;
        const scale = size / font.unitsPerEm;
        for (const glyph of font.stringToGlyphs(run.text)) {
            if (prev && prev.font === font) x += font.getKerningValue(prev.glyph, glyph) * scale;
            if (items.length) x += tracking * size;
            items.push({ font, glyph, x, scale });
            x += (glyph.advanceWidth || 0) * scale;
            prev = { font, glyph };
        }
    }
    return { width: x, items };
};

/** exact width of one line in px */
const measure = (f, text, size, tracking = 0) => shape(f, text, size, tracking).width;

/**
 * One line of text -> SVG path data. anchor: "start" | "middle" | "end"; y = baseline.
 */
const pathFor = (f, text, size, x, y, { anchor = "start", tracking = 0 } = {}) => {
    const { width, items } = shape(f, text, size, tracking);
    const x0 = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x;
    return items.map((it) => it.glyph.getPath(x0 + it.x, y, size).toPathData(2)).join("");
};

const available = () => Boolean(opentype) && Boolean(face({ slug: "inter", weight: 800 }));

module.exports = { face, canRender, measure, pathFor, available, FONT_DIR, COMPLEX_SCRIPT };
