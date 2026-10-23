// ─────────────────────────────────────────────────────────────
// AdLayoutSpecs.js — the fixed vocabulary of the ad layout (shared by the agent, renderer and tests)
//   The LLM only PICKS from these lists (composition, product shape, prop shapes) and writes the texts
//   + the photo prompt. Pixel positions come from code -> the layout is always valid and the text area
//   never collides with the product.
//   All boxes are in percent of the canvas: { x, y, w, h } (0–100), x/y = top-left corner.
// ─────────────────────────────────────────────────────────────

/** Final ad size (what we post) + the size Stable Diffusion 1.5 renders at (multiples of 64, ~0.6 MP) */
const ASPECTS = {
    "1:1": { width: 1080, height: 1080, sd: { width: 768, height: 768 } },
    "4:5": { width: 1080, height: 1350, sd: { width: 640, height: 800 } },
    "9:16": { width: 1080, height: 1920, sd: { width: 576, height: 1024 } },
};
const DEFAULT_ASPECT = "4:5";

/**
 * Where the product, the text block (headline + subline + CTA) and the logo go.
 * surfaceY = where the table / floor line is (null = top-down flat lay, no horizon).
 * align    = text alignment inside the text block. emptyArea = told to Stable Diffusion ("clean space for text").
 */
const COMPOSITIONS = {
    "text-top": {
        label: "Text on top, product below",
        product: { x: 26, y: 36, w: 48, h: 52 },
        text: { x: 7, y: 5, w: 86, h: 27 },
        logo: { x: 4, y: 91, w: 18, h: 6 },
        surfaceY: 82, align: "center", emptyArea: "top",
    },
    "text-bottom": {
        label: "Product on top, text below",
        product: { x: 26, y: 9, w: 48, h: 52 },
        text: { x: 7, y: 67, w: 86, h: 28 },
        logo: { x: 4, y: 3, w: 18, h: 6 },
        surfaceY: 57, align: "center", emptyArea: "bottom",
    },
    "product-left": {
        label: "Product left, text right",
        product: { x: 5, y: 22, w: 46, h: 62 },
        text: { x: 54, y: 24, w: 41, h: 52 },
        logo: { x: 77, y: 4, w: 19, h: 6 },
        surfaceY: 80, align: "left", emptyArea: "right side",
    },
    "product-right": {
        label: "Product right, text left",
        product: { x: 49, y: 22, w: 46, h: 62 },
        text: { x: 5, y: 24, w: 41, h: 52 },
        logo: { x: 4, y: 4, w: 19, h: 6 },
        surfaceY: 80, align: "left", emptyArea: "left side",
    },
    "flatlay": {
        label: "Top-down flat lay, text below",
        product: { x: 28, y: 18, w: 44, h: 46 },
        text: { x: 7, y: 72, w: 86, h: 23 },
        logo: { x: 4, y: 3, w: 18, h: 6 },
        surfaceY: null, align: "center", emptyArea: "bottom",
    },
};
const DEFAULT_COMPOSITION_BY_ASPECT = { "1:1": "text-bottom", "4:5": "text-top", "9:16": "text-top" };

/** Product outlines the renderer can draw (ratio = natural width / height, used to fit the shape in its box) */
const PRODUCT_SHAPES = {
    bottle: { ratio: 0.38, label: "bottle (oil, ghee, shampoo, wine, serum)" },
    jar: { ratio: 0.85, label: "jar / tub (honey, cream, pickle)" },
    box: { ratio: 0.82, label: "box / carton (tea, gadget packaging)" },
    tube: { ratio: 0.34, label: "squeeze tube (face wash, toothpaste)" },
    can: { ratio: 0.56, label: "can / tin" },
    pouch: { ratio: 0.72, label: "stand-up pouch (snacks, coffee)" },
    cup: { ratio: 0.85, label: "cup / glass / mug" },
    phone: { ratio: 0.5, label: "phone / tablet" },
    laptop: { ratio: 1.5, label: "laptop / monitor" },
    shoe: { ratio: 2.1, label: "shoe / sneaker (side view)" },
    watch: { ratio: 0.55, label: "watch / band" },
    bag: { ratio: 0.95, label: "handbag / tote" },
    garment: { ratio: 0.9, label: "t-shirt / garment" },
    generic: { ratio: 1, label: "anything else (rounded block)" },
};

/** Scene props drawn as simple outlines around the product */
const PROP_SHAPES = ["circle", "ellipse", "rect", "leaf", "blob", "wave", "line"];
const MAX_PROPS = 6;

const PRODUCT_VIEWS = ["front", "three-quarter", "top-down"];

/** Always added to the photo prompt / negative prompt (realistic checkpoints like Realistic Vision) */
const SD_QUALITY_SUFFIX = "RAW photo, professional commercial product photography, advertising shot, dslr, 85mm, soft studio lighting, high detail, sharp focus, 8k uhd";
const SD_NEGATIVE_DEFAULT =
    "text, letters, words, watermark, logo, icon, emblem, badge, signature, label text, typography, blurry, out of focus, deformed, distorted, " +
    "cartoon, illustration, drawing, painting, anime, 3d render, cgi, lowres, low quality, jpeg artifacts, oversaturated, duplicate product, cropped product";

const TEXT_LIMITS = { headline: 48, subline: 90, cta: 28 };

/**
 * Curated font pairs (heading + body + CTA button). Files: backend/assets/fonts/<slug>-<subset>-<weight>-normal.woff
 * The LLM picks one by mood; the user can switch it later. tracking = letter spacing in em; lineHeight = x font size.
 * Curated on purpose: 6 good pairs beat 1,000 fonts.
 */
const FONT_PAIRS = {
    // the brand's fixed font system (BrandKit.js) — used for every image while the brand kit is on
    "brand": {
        label: "Brand (Poppins + Inter)", mood: "brand typography: Poppins ExtraBold headline, Poppins SemiBold subheading, Inter Bold button",
        heading: { slug: "poppins", family: "Poppins", weight: 800, tracking: -0.01, lineHeight: 1.08 },
        body: { slug: "poppins", family: "Poppins", weight: 600 },
        cta: { slug: "inter", family: "Inter", weight: 700 },
    },
    "modern-sans": {
        label: "Modern sans", mood: "clean, modern, tech, everyday products",
        heading: { slug: "inter", family: "Inter", weight: 800, tracking: -0.015, lineHeight: 1.08 },
        body: { slug: "inter", family: "Inter", weight: 500 },
        cta: { slug: "inter", family: "Inter", weight: 700 },
    },
    "bold-geometric": {
        label: "Bold geometric", mood: "bold, youthful, energetic, D2C brands",
        heading: { slug: "poppins", family: "Poppins", weight: 700, tracking: -0.01, lineHeight: 1.1 },
        body: { slug: "poppins", family: "Poppins", weight: 400 },
        cta: { slug: "poppins", family: "Poppins", weight: 600 },
    },
    "elegant-serif": {
        label: "Elegant serif", mood: "premium, luxury, heritage, beauty, fine food",
        heading: { slug: "playfair-display", family: "Playfair Display", weight: 700, tracking: 0, lineHeight: 1.1 },
        body: { slug: "lato", family: "Lato", weight: 400 },
        cta: { slug: "lato", family: "Lato", weight: 700 },
    },
    "friendly-rounded": {
        label: "Friendly rounded", mood: "warm, friendly, kids, homemade, wellness",
        heading: { slug: "nunito", family: "Nunito", weight: 800, tracking: -0.005, lineHeight: 1.1 },
        body: { slug: "nunito", family: "Nunito", weight: 500 },
        cta: { slug: "nunito", family: "Nunito", weight: 700 },
    },
    "editorial": {
        label: "Editorial", mood: "stylish, editorial, fashion, lifestyle, cafes",
        heading: { slug: "dm-serif-display", family: "DM Serif Display", weight: 400, tracking: 0, lineHeight: 1.08 },
        body: { slug: "dm-sans", family: "DM Sans", weight: 500 },
        cta: { slug: "dm-sans", family: "DM Sans", weight: 700 },
    },
    "impact-condensed": {
        label: "Impact condensed", mood: "loud, sale, sports, fitness, offers",
        heading: { slug: "oswald", family: "Oswald", weight: 700, tracking: 0.005, lineHeight: 1.05 },
        body: { slug: "roboto", family: "Roboto", weight: 400 },
        cta: { slug: "roboto", family: "Roboto", weight: 700 },
    },
};
const DEFAULT_FONT_PAIR = "modern-sans";

/**
 * Hook angles: every image of a set gets its OWN headline / subline / CTA written from a different angle,
 * so the user can compare messages (or post a carousel that doesn't repeat itself).
 */
const HOOK_ANGLES = [
    { name: "Benefit", how: "the main result the customer gets" },
    { name: "Emotion", how: "a feeling, memory or moment (family, comfort, pride, joy)" },
    { name: "Offer", how: "price, deal, limited time or a clear reason to act now (only if true — else 'try it today')" },
    { name: "Curiosity", how: "a question or surprising fact that makes people stop scrolling" },
    { name: "Trust", how: "quality proof: process, ingredients, origin, how it is made (only true claims)" },
];

/**
 * One prompt -> up to MAX_VARIANTS photos, each in a clearly different style (the user picks one, or several for a carousel).
 * The LLM writes styles that fit the prompt (layout.styles); these presets fill any gap.
 * composition: null = keep the one the LLM picked for the base layout.
 */
const MAX_VARIANTS = 4;
const STYLE_PRESETS = [
    {
        name: "Clean studio",
        look: "premium studio product shot on a seamless soft-colored backdrop, soft diffused key light, gentle shadow, minimal and elegant, crisp e-commerce catalogue look",
        composition: null,
    },
    {
        name: "Lifestyle",
        look: "real-life lifestyle scene where the product is naturally in use, warm natural window light, candid and authentic, shallow depth of field, cozy lived-in setting",
        composition: "text-bottom",
    },
    {
        name: "Bold color pop",
        look: "bold vibrant color-block background in punchy saturated colors, hard direct light with crisp graphic shadows, modern energetic pop-art advertising look",
        composition: "product-right",
    },
    {
        name: "Moody cinematic",
        look: "dark moody low-key scene, dramatic rim light and soft glow, rich deep contrast, luxurious cinematic color grade, premium night-time feel",
        composition: "text-top",
    },
];

module.exports = {
    ASPECTS,
    DEFAULT_ASPECT,
    COMPOSITIONS,
    DEFAULT_COMPOSITION_BY_ASPECT,
    PRODUCT_SHAPES,
    PROP_SHAPES,
    MAX_PROPS,
    PRODUCT_VIEWS,
    SD_QUALITY_SUFFIX,
    SD_NEGATIVE_DEFAULT,
    TEXT_LIMITS,
    FONT_PAIRS,
    DEFAULT_FONT_PAIR,
    HOOK_ANGLES,
    MAX_VARIANTS,
    STYLE_PRESETS,
};
