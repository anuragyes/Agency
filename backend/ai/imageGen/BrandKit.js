// ─────────────────────────────────────────────────────────────
// BrandKit.js — the brand rules every AI-generated image follows (logo, colours, visual style, typography)
//   One place for the rules, used by the layout agent (LLM prompt), the photo prompts (Gemini / Cloudflare /
//   Stability / SD), the layout renderer (typography + colours) and the composer (logo placement).
//
//   A layout carries its brand settings in layout.brand = { kit, purpose, mark, logoCorner, logoAspect, logoWidthPct }.
//   mark = "logo" | "icon" — the ONE file the user uploaded (never both); an icon is drawn smaller than a logo.
//   Layouts without layout.brand (old jobs, AD_BRAND_KIT=off) keep the old flexible behaviour.
//
//   .env (all optional):
//     AD_BRAND_KIT=off           turn the brand rules off (back to free font / colour choice)
//     AD_LOGO_CORNER=top-left    default logo corner: top-left | bottom-right
//     AD_LOGO_FACE_RATIO=0.3     height of the mascot's face as a share of the logo height (= the logo's clear space)
// ─────────────────────────────────────────────────────────────

/** 2. Brand colours (approximate visual matches of the uploaded logos — sample the originals for exact values) */
const COLORS = {
    primary: "#ef3027",   // ILP Red — headlines, key messages, buttons, important highlights
    secondary: "#253c80", // Learning Blue — subheadings, supporting text, outlines, technical elements
    accent: "#56b7e8",    // Innovation Blue — robotics, STEM illustrations, icons, visual highlights
    white: "#ffffff",     // backgrounds, negative space, clean educational layouts
    light: "#f3f6fc",     // Light Grey-Blue — cards, information panels, subtle background sections
};

/** The same colours in words — image models ignore hex codes */
const COLOR_WORDS = "bright red (#EF3027), deep learning blue / navy (#253C80) and sky blue (#56B7E8) on white and very light grey-blue (#F3F6FC)";

/**
 * 3. Typography — one font system for every design (FONT_PAIRS key in AdLayoutSpecs.js).
 * Sizes are px on a 1080 px wide canvas (1080 x 1350 social post) and scale with the canvas width.
 * [min, max] = the recommended starting range; floor = the smallest we go when a text is too long
 * (mobile readability first — below the floor the renderer asks the user to shorten the text).
 */
const FONT_PAIR = "brand";
const TYPE = {
    refWidth: 1080,
    headline: { min: 64, max: 88, floor: 44 },   // Poppins ExtraBold
    subline: { min: 36, max: 48, floor: 28 },    // Poppins SemiBold (subheading / supporting claim)
    body: { min: 26, max: 32, floor: 24 },       // Inter Regular / Medium
    cta: { min: 28, max: 36, floor: 24 },        // Inter Bold
    disclaimer: { min: 18, max: 22, floor: 18 }, // Inter Regular
};

/** Text colours: theme "dark" = text on a light / white area, "light" = text on a dark photo or deep-blue area */
const TEXT_COLORS = {
    dark: { headline: COLORS.primary, subline: COLORS.secondary, scrim: COLORS.white, scrimOpacity: 0.82 },
    light: { headline: COLORS.white, subline: COLORS.white, scrim: COLORS.secondary, scrimOpacity: 0.8 },
    cta: { background: COLORS.primary, text: COLORS.white },
};

/**
 * 1. Logo rules
 *  - only the ONE file the user uploaded in the app — a logo OR an icon, never both, never an AI-drawn mark
 *  - drawn exactly as uploaded: no background, card or plate behind it (the user's files are already cut out)
 *  - proportions kept: never stretched, rotated, recoloured, cropped or distorted (fit "inside" only)
 *  - tight in the top-left OR bottom-right corner, the same corner for every image of a campaign (batch)
 *  - clear space around it ≥ the height of the mascot's face (text, product and props stay out of it)
 *  - logo width: 15–22 % of the canvas for social posts, 18–25 % for ads; icon width: 8–12 % / 10–14 %
 */
const LOGO = {
    corners: ["top-left", "bottom-right"],
    defaultCorner: ["top-left", "bottom-right"].includes(String(process.env.AD_LOGO_CORNER || "").trim()) ? String(process.env.AD_LOGO_CORNER).trim() : "top-left",
    widthPct: {
        social: { min: 15, max: 22, default: 18 },
        ad: { min: 18, max: 25, default: 22 },
    },
    iconWidthPct: {
        social: { min: 8, max: 12, default: 10 },
        ad: { min: 10, max: 14, default: 12 },
    },
    marks: ["logo", "icon"],
    edgePct: 3.5,       // the mark sits this close to the canvas edges (% of the shorter side) — right in the corner
    mascotFaceRatio: Math.min(0.8, Math.max(0.1, Number(process.env.AD_LOGO_FACE_RATIO) || 0.3)),
    minClearPx: 16,
    maxHeightPct: 22,   // a very tall logo is capped at this share of the canvas height
    defaultAspect: 1.6, // width / height used to reserve the corner before a logo is uploaded
    minContrast: 0.28,  // below this logo-vs-photo brightness difference the user gets a "hard to see" warning
    maxLostShare: 0.12, // ... or when more than this share of the logo's pixels nearly vanish on the photo
};

const PURPOSES = ["social", "ad"];

/** 2. Visual style — added to the planner prompt and to every photo prompt */
const VISUAL_STYLE = [
    "Modern, premium, friendly, child-focused and educational.",
    "When relevant to the product: realistic Indian children, parents and teachers, robotics kits, hands-on STEM activities and bright classroom environments.",
    "Photorealistic subjects combined with clean graphic touches — simple geometric shapes and subtle technology-inspired details.",
    "Prefer white or light backgrounds for educational content; use a darker deep-blue background only selectively, for technology-focused images.",
    `Colour palette: ${COLOR_WORDS}. Red draws attention to one or two details only — it never dominates the picture.`,
    "Uncluttered layout, generous whitespace, strong contrast.",
];

/** Short version for image-model prompts */
const PHOTO_LOOK =
    "modern premium friendly child-focused educational look, clean uncluttered composition with generous whitespace, " +
    "white or very light grey-blue background tones, small accents of bright red, deep navy blue and sky blue, " +
    "subtle geometric and technology-inspired details, strong contrast";

/** Brand style presets (the LLM's own styles come first; these fill the gaps) — 3 light, 1 selective dark-blue tech look */
const STYLE_PRESETS = [
    {
        name: "Bright classroom",
        look: "bright modern Indian classroom or learning space, soft daylight from large windows, white and light grey-blue walls, clean desks, cheerful and premium, small red and sky-blue accents",
        composition: null,
    },
    {
        name: "Hands-on STEM",
        look: "close, candid moment of hands building or testing a robotics / STEM kit on a clean white table, natural light, shallow depth of field, focused and joyful, sky-blue and red details",
        composition: "text-bottom",
    },
    {
        name: "Clean white studio",
        look: "premium studio shot on a seamless white to very light grey-blue backdrop, soft diffused light, gentle shadow, minimal and educational, one or two bright red and sky-blue accents",
        composition: "product-right",
    },
    {
        name: "Tech blue",
        look: "deep learning-blue background with subtle glowing sky-blue technology lines and simple geometric shapes, crisp studio light, modern robotics and innovation mood",
        composition: "text-top",
    },
];

const enabled = () => String(process.env.AD_BRAND_KIT || "").trim().toLowerCase() !== "off";

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/** width range (% of the canvas) for a logo or an icon */
const widthRange = (mark, purpose) => (mark === "icon" ? LOGO.iconWidthPct : LOGO.widthPct)[purpose] || (mark === "icon" ? LOGO.iconWidthPct : LOGO.widthPct).social;

/**
 * Any input -> clean brand settings, or null when the brand kit is off.
 * @param {Object} raw   { purpose, mark, logoCorner, logoAspect, logoWidthPct } (partial is fine)
 * @param {Object} prev  the layout's current brand settings (kept for anything raw doesn't set)
 */
const normalizeBrand = (raw, prev) => {
    if (!enabled()) return null;
    const r = raw && typeof raw === "object" ? raw : {};
    const p = prev && typeof prev === "object" ? prev : {};
    const purpose = PURPOSES.includes(r.purpose) ? r.purpose : PURPOSES.includes(p.purpose) ? p.purpose : "social";
    const mark = LOGO.marks.includes(r.mark) ? r.mark : LOGO.marks.includes(p.mark) ? p.mark : "logo";
    const logoCorner = LOGO.corners.includes(r.logoCorner) ? r.logoCorner : LOGO.corners.includes(p.logoCorner) ? p.logoCorner : LOGO.defaultCorner;
    const aspect = Number(r.logoAspect ?? p.logoAspect);
    const range = widthRange(mark, purpose);
    // purpose or logo/icon changed -> its own default width (an old width may be outside the new range)
    const changed = (r.purpose && r.purpose !== p.purpose) || (r.mark && r.mark !== (p.mark || "logo"));
    const askedW = Number(r.logoWidthPct ?? (changed ? NaN : p.logoWidthPct));
    return {
        kit: "ilp",
        purpose,
        mark,
        logoCorner,
        logoAspect: Number.isFinite(aspect) && aspect > 0 ? clamp(aspect, 0.25, 8) : LOGO.defaultAspect,
        logoWidthPct: Number.isFinite(askedW) ? clamp(askedW, range.min, range.max) : range.default,
    };
};

/**
 * Where the logo / icon goes on a W x H canvas (px): tight in the corner, its own proportions kept.
 * clear space = mascot face height — kept free of text / product / props (zone), clipped to the canvas.
 * @param {Object} brand    layout.brand
 * @param {number} [aspect] the real logo's width / height (defaults to brand.logoAspect)
 * @returns {{ box: {x,y,w,h}, zone: {x,y,w,h}, clear: number, corner: string }}
 *          box = the logo itself, zone = logo + clear space (nothing else may enter it)
 */
const logoPlacement = (brand, W, H, aspect) => {
    const b = brand || normalizeBrand({}) || { purpose: "social", logoCorner: LOGO.defaultCorner, logoAspect: LOGO.defaultAspect, logoWidthPct: 18 };
    const a = Number.isFinite(aspect) && aspect > 0 ? aspect : b.logoAspect || LOGO.defaultAspect;
    const range = widthRange(b.mark, b.purpose);
    let w = (clamp(b.logoWidthPct || range.default, range.min, range.max) / 100) * W;
    let h = w / a;
    const maxH = (LOGO.maxHeightPct / 100) * H;
    if (h > maxH) {
        // very tall logo: cap the height, but never go below the minimum width of the range
        h = maxH;
        w = Math.max((range.min / 100) * W, h * a);
        h = w / a;
    }
    const clear = Math.max(LOGO.minClearPx, h * LOGO.mascotFaceRatio);
    const corner = LOGO.corners.includes(b.logoCorner) ? b.logoCorner : LOGO.defaultCorner;
    const edge = Math.max(LOGO.minClearPx, (LOGO.edgePct / 100) * Math.min(W, H)); // right in the corner
    const x = corner === "top-left" ? edge : W - edge - w;
    const y = corner === "top-left" ? edge : H - edge - h;
    const box = { x, y, w, h };
    const zx = Math.max(0, x - clear);
    const zy = Math.max(0, y - clear);
    const zone = { x: zx, y: zy, w: Math.min(W, x + w + clear) - zx, h: Math.min(H, y + h + clear) - zy };
    return { box, zone, clear, corner };
};

/** do two px boxes overlap? */
const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Shrink a box so it no longer enters the logo zone — from the side that keeps the most area.
 * The logo sits in a corner, so cutting one side is always enough.
 */
const avoidZone = (box, zone) => {
    if (!zone || !intersects(box, zone)) return box;
    const options = [
        { ...box, h: zone.y - box.y },                                            // keep the part above the zone
        { ...box, y: zone.y + zone.h, h: box.y + box.h - (zone.y + zone.h) },    // below
        { ...box, w: zone.x - box.x },                                            // left of it
        { ...box, x: zone.x + zone.w, w: box.x + box.w - (zone.x + zone.w) },    // right of it
    ].filter((o) => o.w > 0 && o.h > 0);
    if (!options.length) return box;
    return options.reduce((best, o) => (o.w * o.h > best.w * best.h ? o : best));
};

/** "top-left" -> words for the photo prompts */
const cornerWords = (corner) => (corner === "bottom-right" ? "bottom-right corner" : "top-left corner");

/** Typography sizes (px) for a canvas width, from TYPE */
const typeSizes = (W) => {
    const k = W / TYPE.refWidth;
    const scale = (r) => ({ min: Math.round(r.min * k), max: Math.round(r.max * k), floor: Math.round(r.floor * k) });
    return { headline: scale(TYPE.headline), subline: scale(TYPE.subline), cta: scale(TYPE.cta), body: scale(TYPE.body), disclaimer: scale(TYPE.disclaimer) };
};

/** Brand rules as plain text for the layout planner (LLM) */
const plannerGuide = () =>
    [
        "BRAND RULES (always follow — they override the user's style wishes where they conflict):",
        ...VISUAL_STYLE.map((l) => `- ${l}`),
        "- Typography is fixed by the brand (Poppins ExtraBold headline, Poppins SemiBold subline, Inter Bold button) — keep headline ≤ 6 words and subline ≤ 12 words so they stay big and readable on a phone.",
        "- The user's REAL logo or icon is placed later in a corner; never describe a logo, icon, brand mark, emblem or mascot in the photo.",
    ].join("\n");

/** For the UI (GET /api/image-gen/options) */
const publicKit = () =>
    enabled()
        ? {
            enabled: true,
            colors: COLORS,
            fontPair: FONT_PAIR,
            purposes: PURPOSES.map((value) => ({ value, label: value === "ad" ? "Advertisement" : "Social post", logoWidthPct: LOGO.widthPct[value], iconWidthPct: LOGO.iconWidthPct[value] })),
            marks: LOGO.marks,
            logoCorners: LOGO.corners,
            defaultCorner: LOGO.defaultCorner,
            type: TYPE,
        }
        : { enabled: false };

module.exports = {
    COLORS,
    COLOR_WORDS,
    FONT_PAIR,
    TYPE,
    TEXT_COLORS,
    LOGO,
    PURPOSES,
    VISUAL_STYLE,
    PHOTO_LOOK,
    STYLE_PRESETS,
    enabled,
    normalizeBrand,
    logoPlacement,
    avoidZone,
    intersects,
    cornerWords,
    typeSizes,
    plannerGuide,
    publicKit,
};
