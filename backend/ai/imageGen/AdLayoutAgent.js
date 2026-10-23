// ─────────────────────────────────────────────────────────────
// AdLayoutAgent.js — image generation step 1 (ONE LLM call, +1 retry) -> buildStyleVariants() = up to 4 styled layouts
//   user prompt (+ product facts, + the draft's visual brief) -> layout JSON
//   The LLM only picks from AdLayoutSpecs (composition / shapes) and writes texts + the photo prompt;
//   normalizeLayout() clamps everything, so the renderer always gets a valid layout.
// ─────────────────────────────────────────────────────────────
const LLMFactory = require("../../llm/factory/LLMFactory");
const { estimateTokens } = require("../contentBrief/ContentBriefAgent.js");
const { buildAdLayoutPrompt, buildAdLayoutRevisePrompt } = require("./AdLayoutPrompt.js");
const {
    ASPECTS, DEFAULT_ASPECT, COMPOSITIONS, DEFAULT_COMPOSITION_BY_ASPECT, PRODUCT_SHAPES, PROP_SHAPES, MAX_PROPS,
    PRODUCT_VIEWS, SD_QUALITY_SUFFIX, SD_NEGATIVE_DEFAULT, TEXT_LIMITS, MAX_VARIANTS, STYLE_PRESETS, FONT_PAIRS, DEFAULT_FONT_PAIR,
} = require("./AdLayoutSpecs.js");
const Brand = require("./BrandKit.js");

const MAX_ATTEMPTS = 2;

const str = (v, max = 240) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const hex = (v, fallback) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v.trim()) ? v.trim().toLowerCase() : fallback);
/** strip Markdown + quotes the LLM likes to add around ad texts */
const adText = (v, max) => {
    const t = str(v, max * 3).replace(/\*\*|__|`/g, "").replace(/^["'“”]+|["'“”]+$/g, "").trim();
    if (t.length <= max) return t;
    // never cut a word in half ("Explore DHENU dairy toda") -> cut at the last space that fits
    const head = t.slice(0, max + 1);
    const cut = /\s/.test(head) ? head.replace(/\s+\S*$/, "") : t.slice(0, max);
    return cut.replace(/[\s,;:–-]+$/, "").trim();
};

const parseJson = (text) => {
    if (text && typeof text === "object") return text;
    const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return JSON.parse(t);
    } catch {
        const s = t.indexOf("{");
        const e = t.lastIndexOf("}");
        if (s !== -1 && e > s) return JSON.parse(t.slice(s, e + 1));
        throw new Error("Ad layout agent returned invalid JSON");
    }
};

/**
 * The photo prompt may be long (people, scene details) but must not ask the image model to WRITE anything:
 * quoted brand names / "label reading ..." / "text that says ..." come out misspelled -> real text + logo are added later.
 */
const cleanPhotoPrompt = (v) =>
    str(v, 1600)
        // label reading “DHENU” and “A2 GIR COW GHEE” -> plain label
        .replace(/\b(label|sign|tag|sticker)\s+(?:reading|saying|that says|says|with the words?|with text|printed with)\s*(?:[“"'‘][^”"'’]*[”"'’][\s,.]*(?:and|&)?\s*)+/gi, "plain $1 ")
        .replace(/[“"‘]([^”"’]{1,60})[”"’]/g, "")
        // drop whole clauses that ask for (or mention) written text
        .split(/(?<=[.;,])\s+/)
        // ... and layout talk with numbers ("bottom 30% empty"): image models paint the numbers into the photo
        .filter((clause) => !/\b(text|typography|lettering|watermark|caption|written|spelled|font)s?\b/i.test(clause) && !/\d+(?:\.\d+)?\s*%/.test(clause))
        .join(" ")
        .replace(/\s+([,.;])/g, "$1")
        .replace(/([,.;])(?:\s*[,.;])+/g, "$1")
        .replace(/\s{2,}/g, " ")
        .replace(/(plain (?:label|sign|tag|sticker))\s+(?=[A-Z])/g, "$1. ")
        .replace(/[\s,;]+$/, "")
        .trim();

/** "Elegant serif" / "elegant-serif" -> "elegant-serif", unknown -> null */
const fontPairKey = (v) => {
    const k = String(v || "").toLowerCase().trim().replace(/\s+/g, "-");
    return FONT_PAIRS[k] ? k : null;
};

const normalizeAspect = (a) => (ASPECTS[a] ? a : DEFAULT_ASPECT);

/** share of box a that lies inside box b (0–1) */
const overlap = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return a.w * a.h ? (ix * iy) / (a.w * a.h) : 1;
};

const normalizeProps = (props, comp) =>
    (Array.isArray(props) ? props : [])
        .map((p) => {
            const shape = PROP_SHAPES.includes(String(p?.shape).toLowerCase()) ? String(p.shape).toLowerCase() : "blob";
            const w = num(p?.w, 3, 40, 10);
            const h = num(p?.h, 1, 40, 10);
            return { shape, x: num(p?.x, 0, 100 - w, 0), y: num(p?.y, 0, 100 - h, 0), w, h, label: str(p?.label, 30) };
        })
        .filter((p) => overlap(p, comp.text) < 0.2 && overlap(p, comp.product) < 0.6) // never in the text area / on the product
        .slice(0, MAX_PROPS);

/**
 * Clean + clamp the LLM JSON into the layout the renderer uses.
 * @returns layout { aspectRatio, composition, productShape, productView, scene, props, palette, texts,
 *                   sdPromptCore, sdPrompt, negativePromptExtra, negativePrompt, productName }
 */
const normalizeLayout = (raw, { aspectRatio, productProfile, previous } = {}) => {
    const r = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const prev = previous || {};
    const aspect = normalizeAspect(aspectRatio || prev.aspectRatio);
    const p = productProfile?.aiProfile || productProfile || {};

    const compKey = String(r.composition || "").toLowerCase().trim();
    const composition = COMPOSITIONS[compKey] ? compKey : prev.composition || DEFAULT_COMPOSITION_BY_ASPECT[aspect];
    const comp = COMPOSITIONS[composition];

    const shapeKey = String(r.productShape || "").toLowerCase().trim();
    const productShape = PRODUCT_SHAPES[shapeKey] ? shapeKey : prev.productShape || "generic";
    const viewKey = String(r.productView || "").toLowerCase().trim();
    let productView = PRODUCT_VIEWS.includes(viewKey) ? viewKey : prev.productView || "front";
    if (composition === "flatlay") productView = "top-down";
    else if (productView === "top-down") productView = "three-quarter";

    const texts = {
        headline: adText(r.texts?.headline, TEXT_LIMITS.headline) || prev.texts?.headline || "",
        subline: adText(r.texts?.subline, TEXT_LIMITS.subline) || (r.texts ? "" : prev.texts?.subline || ""),
        cta: adText(r.texts?.cta, TEXT_LIMITS.cta) || prev.texts?.cta || "",
    };

    const sdPromptCore = cleanPhotoPrompt(r.sdPrompt) || prev.sdPromptCore || "";
    const negativePromptExtra = str(r.negativePrompt, 300);

    const layout = {
        aspectRatio: aspect,
        composition,
        productShape,
        productView,
        productName: str(p.name, 80) || prev.productName || "",
        scene: str(r.scene, 240) || prev.scene || "",
        productDescription: str(r.productDescription, 160) || prev.productDescription || "",
        props: normalizeProps(r.props, comp),
        palette: {
            background: hex(r.palette?.background, prev.palette?.background || "#efe9e1"),
            surface: hex(r.palette?.surface, prev.palette?.surface || "#d9cbb8"),
            accent: hex(r.palette?.accent, prev.palette?.accent || "#7c3aed"),
        },
        texts,
        fontPair: fontPairKey(r.fontPair) || fontPairKey(prev.fontPair) || DEFAULT_FONT_PAIR,
        sdPromptCore,
        negativePromptExtra,
    };
    applyBrandLocks(layout, Brand.normalizeBrand(r.brand, prev.brand));
    const styles = normalizeStyles(r.styles);
    if (styles.length) layout.styles = styles;
    else if (prev.styles?.length) layout.styles = prev.styles;
    if (prev.style) layout.style = prev.style; // a variant keeps its style through revisions
    return withFullPrompts(layout);
};

/**
 * Brand kit on -> the layout carries its brand settings and uses the brand's fixed font system + colours
 * (the LLM / UI can't switch them). Off (null) -> the old free choice.
 */
const applyBrandLocks = (layout, brand) => {
    if (!brand) {
        delete layout.brand;
        return layout;
    }
    layout.brand = brand;
    layout.fontPair = Brand.FONT_PAIR;
    layout.palette = { background: Brand.COLORS.white, surface: Brand.COLORS.light, accent: Brand.COLORS.primary };
    return layout;
};

/** a style's own ad texts (different hook per image) -> clamped texts, or null when it has no headline */
const styleTexts = (t) => {
    if (!t || typeof t !== "object") return null;
    const out = { headline: adText(t.headline, TEXT_LIMITS.headline), subline: adText(t.subline, TEXT_LIMITS.subline), cta: adText(t.cta, TEXT_LIMITS.cta) };
    return out.headline ? out : null;
};

/** LLM styles -> [{ name, look, composition|null, hook?, texts? }] (max MAX_VARIANTS, no duplicates, no text requests in the look) */
const normalizeStyles = (styles) => {
    const seen = new Set();
    return (Array.isArray(styles) ? styles : [])
        .map((s) => {
            const compKey = String(s?.composition || "").toLowerCase().trim();
            const out = { name: adText(s?.name, 30), look: cleanPhotoPrompt(s?.look).slice(0, 400), composition: COMPOSITIONS[compKey] ? compKey : null };
            const texts = styleTexts(s?.texts);
            if (texts) out.texts = texts;
            const hook = adText(s?.hook, 30);
            if (hook) out.hook = hook;
            return out;
        })
        .filter((s) => s.name && s.look && s.look.split(/\s+/).length >= 4 && !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()))
        .slice(0, MAX_VARIANTS);
};

/**
 * One base layout -> `count` layouts, each with its own style (LLM styles first, presets fill the gaps)
 * and its own composition, so the user gets visibly different photos from ONE prompt.
 * Every variant keeps the same product and photo prompt; each one gets its style's OWN texts (a different hook)
 * when the LLM wrote them, else the base texts. layout.style = { name, look, hook? }.
 */
const buildStyleVariants = (base, count = MAX_VARIANTS) => {
    const n = Math.min(MAX_VARIANTS, Math.max(1, Math.round(Number(count)) || MAX_VARIANTS));
    const picked = [];
    const names = new Set();
    for (const s of [...(base.styles || []), ...(base.brand ? Brand.STYLE_PRESETS : STYLE_PRESETS)]) {
        const key = s.name.toLowerCase();
        if (names.has(key)) continue;
        names.add(key);
        picked.push(s);
        if (picked.length === n) break;
    }
    return picked.map((s, i) => {
        const composition = s.composition || (i === 0 ? base.composition : null) || base.composition;
        const own = s.texts?.headline ? { texts: { ...s.texts, cta: s.texts.cta || base.texts?.cta || "" } } : {};
        const v = editAdLayout({ ...base, styles: undefined }, { composition, ...own });
        delete v.styles;
        v.style = { name: s.name, look: s.look, ...(s.hook ? { hook: s.hook } : {}) };
        return withFullPrompts(v);
    });
};

/** Core prompt + composition hint + quality tags -> the prompt sent to Stable Diffusion */
const withFullPrompts = (layout) => {
    const comp = COMPOSITIONS[layout.composition];
    const view = layout.productView === "top-down" ? "top-down flat lay view" : `${layout.productView} view of the product`;
    const empty = `clean empty ${comp.emptyArea} area with soft out-of-focus background (negative space)`;
    // the logo corner = the same scene continuing, softly blurred (asking for a "plain corner" makes models paint a blank panel)
    const brand = layout.brand
        ? [Brand.PHOTO_LOOK, `soft out-of-focus background continuing into the ${Brand.cornerWords(layout.brand.logoCorner)}, no objects there`]
        : [];
    layout.sdPrompt = [layout.sdPromptCore, layout.style?.look, view, empty, ...brand, SD_QUALITY_SUFFIX].filter(Boolean).join(", ");
    layout.negativePrompt = [SD_NEGATIVE_DEFAULT, layout.negativePromptExtra].filter(Boolean).join(", ");
    return layout;
};

const validateLayout = (layout) => {
    const errors = [];
    if (!layout.sdPromptCore || layout.sdPromptCore.split(/\s+/).length < 5) errors.push("sdPrompt must describe the whole photo (people, product, setting, light) in 60–180 words");
    if (!layout.texts.headline) errors.push("texts.headline must be a non-empty string");
    return { valid: errors.length === 0, errors };
};

const addUsage = (usage, llm, prompt, text) => {
    if (llm.lastUsage) {
        usage.promptTokens += llm.lastUsage.prompt_tokens || 0;
        usage.completionTokens += llm.lastUsage.completion_tokens || 0;
    } else {
        usage.promptTokens += estimateTokens(prompt);
        usage.completionTokens += estimateTokens(text);
        usage.estimated = true;
    }
};

const runAgent = async ({ buildPrompt, llm, normalizeArgs, tag }) => {
    let fixErrors = [];
    const usage = { promptTokens: 0, completionTokens: 0, estimated: false };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const prompt = buildPrompt(fixErrors);
        const text = await llm.generate({ input: prompt, temperature: 0.5 });
        addUsage(usage, llm, prompt, text);

        let layout;
        try {
            layout = normalizeLayout(parseJson(text), normalizeArgs);
        } catch (err) {
            fixErrors = ["Return ONE valid JSON object only"];
            if (attempt === MAX_ATTEMPTS) throw err;
            continue;
        }
        const { valid, errors } = validateLayout(layout);
        if (valid) return { layout, usage };
        console.warn(`[${tag}] attempt ${attempt} invalid:`, errors.join("; "));
        fixErrors = errors;
        if (attempt === MAX_ATTEMPTS) throw new Error(`Ad layout validation failed: ${errors.join(", ")}`);
    }
};

/**
 * @param {Object} args
 * @param {string} args.userPrompt         what the user wants in the image
 * @param {string} [args.aspectRatio]      "1:1" | "4:5" | "9:16"
 * @param {Object} [args.productProfile]   saved aiProfile
 * @param {Object} [args.postContext]      { hook, visualBrief, onImageText, cta } from the draft
 * @param {Object} [args.llm]              injected LLM (tests)
 * @returns {Promise<{ layout, usage }>}
 */
const generateAdLayout = async ({ userPrompt, aspectRatio, productProfile = {}, postContext = null, llm = LLMFactory.create() } = {}) => {
    if (!userPrompt || !String(userPrompt).trim()) throw new Error("prompt is required");
    const aspect = normalizeAspect(aspectRatio);
    return runAgent({
        llm,
        tag: "AdLayoutAgent",
        normalizeArgs: { aspectRatio: aspect, productProfile },
        buildPrompt: (fixErrors) => buildAdLayoutPrompt({ userPrompt, productProfile, postContext, aspectRatio: aspect, fixErrors }),
    });
};

/** Apply the user's feedback ("move the text down", "add lemons", "darker background") to a layout */
const reviseAdLayout = async ({ layout, feedback, productProfile = {}, llm = LLMFactory.create() } = {}) => {
    if (!layout) throw new Error("layout is required");
    if (!feedback || !String(feedback).trim()) throw new Error("feedback is required");
    return runAgent({
        llm,
        tag: "AdLayoutAgent:revise",
        normalizeArgs: { aspectRatio: layout.aspectRatio, productProfile, previous: layout },
        buildPrompt: (fixErrors) => buildAdLayoutRevisePrompt({ layout, feedback, productProfile, aspectRatio: layout.aspectRatio, fixErrors }),
    });
};

/**
 * Manual edits from the UI (no LLM): texts, composition, product shape, aspect ratio, palette, photo prompt.
 * Props are re-filtered when the composition changes (a prop may now sit in the text area).
 */
const editAdLayout = (layout, patch = {}) => {
    const next = JSON.parse(JSON.stringify(layout));
    if (patch.aspectRatio && ASPECTS[patch.aspectRatio]) next.aspectRatio = patch.aspectRatio;
    if (patch.composition && COMPOSITIONS[patch.composition]) {
        next.composition = patch.composition;
        if (patch.composition === "flatlay") next.productView = "top-down";
        else if (next.productView === "top-down") next.productView = "three-quarter";
    }
    if (patch.productShape && PRODUCT_SHAPES[patch.productShape]) next.productShape = patch.productShape;
    if (patch.brand && typeof patch.brand === "object") applyBrandLocks(next, Brand.normalizeBrand(patch.brand, next.brand));
    if (fontPairKey(patch.fontPair) && !next.brand) next.fontPair = fontPairKey(patch.fontPair); // brand kit = one font system
    if (patch.texts && typeof patch.texts === "object") {
        for (const k of Object.keys(TEXT_LIMITS)) {
            if (typeof patch.texts[k] === "string") next.texts[k] = adText(patch.texts[k], TEXT_LIMITS[k]);
        }
    }
    if (patch.palette && typeof patch.palette === "object" && !next.brand) {
        for (const k of ["background", "surface", "accent"]) next.palette[k] = hex(patch.palette[k], next.palette[k]);
    }
    if (typeof patch.sdPrompt === "string" && patch.sdPrompt.trim()) next.sdPromptCore = cleanPhotoPrompt(patch.sdPrompt);
    if (Array.isArray(patch.props)) next.props = patch.props;
    next.props = normalizeProps(next.props, COMPOSITIONS[next.composition]);
    return withFullPrompts(next);
};

/**
 * A layout planned earlier by generateAdLayout (POST /plan) and sent back by the UI — maybe with edited texts,
 * an edited photo prompt or another aspect ratio. Never trusted: it goes through the same clamps as LLM output.
 * @returns layout, or null when it isn't usable (the caller then plans again with the LLM)
 */
const layoutFromPlan = (plan, { aspectRatio, productProfile } = {}) => {
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) return null;
    const raw = { ...plan, sdPrompt: plan.sdPromptCore || "", negativePrompt: plan.negativePromptExtra || "" };
    const layout = normalizeLayout(raw, { aspectRatio: aspectRatio || plan.aspectRatio, productProfile, previous: { productName: str(plan.productName, 80) } });
    return validateLayout(layout).valid ? layout : null;
};

module.exports = { generateAdLayout, reviseAdLayout, editAdLayout, normalizeLayout, validateLayout, parseJson, cleanPhotoPrompt, normalizeStyles, buildStyleVariants, layoutFromPlan };
