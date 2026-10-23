// ─────────────────────────────────────────────────────────────
// imageProviders.js — which engine turns the approved sketch into a photo
//   IMAGE_PROVIDER=cloudflare FREE: Cloudflare Workers AI, FLUX.2 [klein] (~60 images/day, no card) — uses your product photo
//   IMAGE_PROVIDER=gemini     Google Gemini image model ("Nano Banana") — best at following long prompts + uses your product photo (paid)
//   IMAGE_PROVIDER=stability  Stability AI hosted API (no GPU — works on any laptop, paid per image)
//   IMAGE_PROVIDER=webui      local Stable Diffusion WebUI (A1111 / Forge) + ControlNet Scribble (needs an NVIDIA GPU)
//   not set -> "cloudflare" if its keys are set, else "gemini" if a Gemini key is set, else "stability". IMAGE_PROVIDER=webui = local NVIDIA GPU.
// Every provider: health() -> { ok, provider, label, problems[], modes[] ... }
//                 generate({ layout, mode, productPhoto, userPrompt, seed, steps, cfgScale, controlWeight })
//                   -> { image, controlPng, seed, ms, model, controlModel, warnings }
// Modes (how the photo is made):
//   product  YOUR real product photo is placed in the layout and an AI scene is generated around it (label stays exact)
//   scene    the whole photo from the detailed description (people, kitchen, food) — product is drawn by the AI
//   sketch   the photo follows the layout sketch strictly (simple product shots)
// ─────────────────────────────────────────────────────────────
const sharp = require("sharp");
const sdClient = require("./sdWebuiClient.js");
const stabilityClient = require("./stabilityClient.js");
const geminiClient = require("./geminiImageClient.js");
const cloudflareClient = require("./cloudflareImageClient.js");
const { renderScribbleSvg, canvasOf, areasOf } = require("./layoutRenderer.js");
const Brand = require("../../ai/imageGen/BrandKit.js");
const { COMPOSITIONS } = require("../../ai/imageGen/AdLayoutSpecs.js");

const httpError = (status, message) => Object.assign(new Error(message), { statusCode: status });

const MODES = {
    product: { label: "Your real product photo in an AI scene", credits: 8, needsPhoto: true },
    scene: { label: "AI scene from your description", credits: 8 },
    sketch: { label: "Follow the layout sketch exactly", credits: 5 },
};

/**
 * Real product photo -> transparent-free canvas at the final ad size with the product where the layout wants it.
 * Stability cuts the product out itself and paints the new scene around it.
 */
const productSubject = async (layout, productPhoto) => {
    const { W, H } = canvasOf(layout);
    const comp = COMPOSITIONS[layout.composition];
    const box = areasOf(layout, W, H).product; // brand kit: kept out of the logo's corner
    const fitted = await sharp(productPhoto).rotate().resize(Math.round(box.w), Math.round(box.h), { fit: "inside" }).flatten({ background: "#ffffff" }).png()
        .toBuffer({ resolveWithObject: true });
    const left = Math.round(box.x + (box.w - fitted.info.width) / 2);
    const top = Math.round(comp.surfaceY == null ? box.y + (box.h - fitted.info.height) / 2 : box.y + box.h - fitted.info.height);
    return sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } }).composite([{ input: fitted.data, left, top }]).png().toBuffer();
};

/** "light from the left / window on the right" in the description -> Stability light direction */
const lightDirectionOf = (text) => {
    const m = /\b(?:light|window|sun)[^.]{0,40}?\b(left|right|above|below)\b/i.exec(String(text || ""));
    return m ? m[1].toLowerCase() : undefined;
};

const svgToPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

const webui = (client = sdClient) => ({
    name: "webui",
    label: "Stable Diffusion",
    modes: ["sketch"],
    async health() {
        const h = await client.health();
        return { ...h, provider: "webui", label: "Stable Diffusion", detail: [h.checkpoint, h.controlModel].filter(Boolean).join(" · "), modes: [{ value: "sketch", ...MODES.sketch, credits: 0 }] };
    },
    async generate({ layout, mode = "sketch", seed, steps, cfgScale, controlWeight }) {
        if (mode !== "sketch") throw httpError(400, `"${MODES[mode]?.label || mode}" needs Cloudflare (free), Google Gemini or Stability AI (set IMAGE_PROVIDER in backend/.env).`);
        const { sd } = canvasOf(layout);
        const controlPng = await svgToPng(renderScribbleSvg(layout)); // white on black, SD size
        const out = await client.txt2imgScribble({
            prompt: layout.sdPrompt,
            negativePrompt: layout.negativePrompt,
            width: sd.width,
            height: sd.height,
            controlImageBase64: controlPng.toString("base64"),
            seed: Number.isInteger(seed) ? seed : -1,
            steps,
            cfgScale,
            controlWeight,
        });
        return { image: out.image, controlPng, seed: out.seed, ms: out.ms, model: out.checkpoint, controlModel: out.controlModel, warnings: [] };
    },
});

const stability = (client = stabilityClient) => ({
    name: "stability",
    label: "Stability AI",
    modes: Object.keys(MODES),
    async health() {
        const h = await client.health();
        return { ...h, provider: "stability", label: "Stability AI", detail: h.credits != null ? `${h.credits} credits left` : "", modes: Object.entries(MODES).map(([value, m]) => ({ value, ...m })) };
    },
    async generate({ layout, mode = "scene", productPhoto, seed, controlWeight }) {
        const s = Number.isInteger(seed) && seed > 0 ? seed : undefined;
        let out;
        let controlPng;
        let model;
        if (mode === "product") {
            if (!productPhoto) throw httpError(400, "Upload a photo of your product first (Product photo box) — or pick “AI scene”.");
            controlPng = await productSubject(layout, productPhoto);
            out = await client.replaceBackgroundRelight({
                subjectPng: controlPng,
                backgroundPrompt: layout.sdPrompt,
                foregroundPrompt: layout.productDescription || layout.productName,
                negativePrompt: layout.negativePrompt,
                lightDirection: lightDirectionOf(layout.sdPromptCore),
                seed: s,
            });
            model = "Stability AI · your product + AI scene";
        } else if (mode === "scene") {
            controlPng = await svgToPng(renderScribbleSvg(layout, { size: "final", invert: true })); // kept only to show the plan
            out = await client.generateUltra({ prompt: layout.sdPrompt, negativePrompt: layout.negativePrompt, aspectRatio: layout.aspectRatio, seed: s });
            model = "Stability AI · Stable Image Ultra";
        } else if (mode === "sketch") {
            // black lines on white at the FINAL size (Stability returns the same size -> sharp 1080 px photo)
            controlPng = await svgToPng(renderScribbleSvg(layout, { size: "final", invert: true }));
            out = await client.controlSketch({
                sketchPng: controlPng,
                prompt: layout.sdPrompt,
                negativePrompt: layout.negativePrompt,
                seed: s,
                controlStrength: controlWeight != null ? Math.min(1, Number(controlWeight)) : undefined,
            });
            model = "Stability AI · Control Sketch";
        } else {
            throw httpError(400, `Unknown mode "${mode}". Use: ${Object.keys(MODES).join(" | ")}`);
        }
        const warnings = out.finishReason === "CONTENT_FILTERED" ? ["Stability AI's content filter blurred part of this photo — change the photo prompt and generate again."] : [];
        return { image: out.image, controlPng, seed: out.seed, ms: out.ms, model, controlModel: mode, warnings };
    },
});

/* ── Google Gemini ── */
const WHERE_PRODUCT = {
    "text-top": "in the lower half of the frame, front and center",
    "text-bottom": "in the upper-middle of the frame",
    "product-left": "in the left half of the frame",
    "product-right": "in the right half of the frame",
    flatlay: "in the center, seen from directly above",
};
// plain words only — numbers / percentages in the prompt get PAINTED into the photo by the image model ("27%", "Bottom 30%")
const EMPTY_AREA = {
    "text-top": "the upper part of the photo",
    "text-bottom": "the lower part of the photo",
    "product-left": "the right side of the photo",
    "product-right": "the left side of the photo",
    flatlay: "the lower part of the photo",
};

/**
 * Layout talk in a brief ("Bottom 30% kept clear, leaving space for future text", "top-left 27% empty for the logo")
 * is for US, not for the image model — it writes those words / numbers into the photo or paints a blank panel.
 * The app reserves the text area and logo corner itself, so those sentences are dropped from the photo prompt.
 */
const LAYOUT_TALK = [
    /\d+(?:\.\d+)?\s*%/,
    /\b(?:space|room|area|place|gap)\s+(?:left\s+)?(?:for|to (?:add|place|put))\s+(?:the\s+|a\s+|our\s+|future\s+|later\s+)*(?:text|texts|headline|heading|title|copy|caption|cta|button|logo|icon|typography|overlay)/i,
    /\b(?:copy[\s-]?space|negative space|text (?:area|zone|space|overlay)|logo (?:area|zone|space|corner))\b/i,
];
const withoutLayoutTalk = (text) =>
    String(text || "")
        .split(/(?<=[.!?;\n])\s+/)
        .filter((s) => !LAYOUT_TALK.some((re) => re.test(s)))
        .join(" ")
        .replace(/\s{2,}/g, " ")
        .trim();

/**
 * Gemini understands plain language, so it gets the USER'S OWN prompt word for word (nothing summarized away),
 * plus clear rules: use the reference product exactly, keep space for the headline, add no text of its own.
 */
const buildGeminiPrompt = ({ layout, mode, userPrompt, hasPhoto, hasSketch }) => {
    const aspect = layout.aspectRatio || "4:5";
    const lines = [`Create ONE photorealistic advertising photograph, ${aspect} aspect ratio (${aspect === "9:16" ? "vertical story" : aspect === "1:1" ? "square" : "vertical Instagram"} format).`];
    let n = 0;
    if (hasPhoto) {
        n++;
        lines.push(
            `IMAGE ${n} is a photo of the REAL PRODUCT${layout.productName ? ` (${layout.productName})` : ""}. Put exactly this product in the scene: same container shape, lid, colors, ` +
            "label design and every word printed on it. Do not redraw, restyle, translate or misspell the label. It is the hero of the ad: sharp, fully visible, " +
            `naturally lit, sitting on a real surface with realistic shadow and reflections, placed ${WHERE_PRODUCT[layout.composition] || "prominently"}.`
        );
    }
    if (hasSketch) {
        n++;
        lines.push(`IMAGE ${n} is a rough layout sketch. Follow its composition (where the product, props and table edge are), not its drawing style.`);
    }
    const brief = withoutLayoutTalk(userPrompt) || withoutLayoutTalk(layout.sdPromptCore) || String(userPrompt || layout.sdPromptCore || "").trim();
    lines.push("", "SCENE — follow every detail of this brief from the brand:", brief);
    if (!userPrompt && layout.scene) lines.push(withoutLayoutTalk(layout.scene));
    if (layout.style?.look) {
        lines.push(
            "",
            `STYLE OF THIS VERSION — "${layout.style.name}": ${withoutLayoutTalk(layout.style.look) || layout.style.look}.`,
            "Apply this style to the background, light, color grade, camera angle and mood, while keeping everything the brief asks for."
        );
    }
    if (layout.brand) {
        const corner = Brand.cornerWords(layout.brand.logoCorner);
        lines.push(
            "",
            "BRAND STYLE — always apply:",
            ...Brand.VISUAL_STYLE.map((l) => `- ${l}`),
            // no size numbers here: the model would paint them, or paint a blank box of that size
            `- In the ${corner} the SAME scene simply continues (wall, window, shelf, sky …), softly out of focus, with no faces, people or products in it.`,
            `  Do NOT put a panel, card, box, frame, sticker, label, solid-colour block, white or blank rectangle, or any letters or numbers in the ${corner}.`,
            "- Never draw a logo, icon, brand mark, badge, mascot or emblem yourself."
        );
    }
    lines.push(
        "",
        `LAYOUT: in ${EMPTY_AREA[layout.composition] || "the upper part of the photo"} the same scene continues calmly — soft, out-of-focus background only, no objects or faces. No plain band, panel, box or overlay there.`,
        "Do NOT add any headline, slogan, caption, price tag, button, watermark, border, logo, icon or badge of your own. The only text in the image is what is printed on the product itself.",
        "These instructions are NOT text for the picture: never write any of their words, numbers or percentages in the image.",
        `Avoid: cartoon or illustration look, plastic skin, distorted hands, extra fingers, floating objects, duplicated products, blurry product${layout.negativePromptExtra ? `, ${layout.negativePromptExtra}` : ""}.`
    );
    if (mode === "product" && !hasPhoto) lines.push("Show the product clearly in the foreground.");
    return lines.join("\n");
};

const gemini = (client = geminiClient) => ({
    name: "gemini",
    label: "Google Gemini",
    modes: Object.keys(MODES),
    async health() {
        const h = await client.health();
        return {
            ...h,
            provider: "gemini",
            label: "Google Gemini",
            detail: [h.model, h.price].filter(Boolean).join(" · "),
            modes: [
                { value: "product", label: "Your real product photo in the scene", needsPhoto: true, cost: h.price },
                { value: "scene", label: "AI scene from your description", cost: h.price },
                { value: "sketch", label: "Follow the layout sketch", cost: h.price },
            ],
        };
    },
    async generate({ layout, mode = "scene", productPhoto, userPrompt }) {
        if (mode === "product" && !productPhoto) throw httpError(400, "Upload a photo of your product first (Product photo box) — or pick “AI scene”.");
        const images = [];
        let controlPng;
        if (mode === "product") {
            // send the real photo as it is (Gemini handles any background) — max 2048 px keeps the request small
            const ref = await sharp(productPhoto).rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
            images.push({ data: ref, mimeType: "image/png" });
            controlPng = await productSubject(layout, productPhoto); // shown as "what the AI got" in the UI
        }
        if (mode === "sketch") {
            controlPng = await svgToPng(renderScribbleSvg(layout, { size: "final", invert: true }));
            images.push({ data: controlPng, mimeType: "image/png" });
        }
        if (!controlPng) controlPng = await svgToPng(renderScribbleSvg(layout, { size: "final", invert: true }));

        const prompt = buildGeminiPrompt({ layout, mode, userPrompt, hasPhoto: mode === "product", hasSketch: mode === "sketch" });
        const out = await client.generateImage({ prompt, images, aspectRatio: layout.aspectRatio || "4:5" });
        return { image: out.image, controlPng, seed: null, ms: out.ms, model: `Google Gemini · ${out.model}`, controlModel: mode, warnings: [], prompt };
    },
});

/* ── Cloudflare Workers AI (free) — same natural-language prompt as Gemini, product photo as a reference image ── */
const cloudflare = (client = cloudflareClient) => ({
    name: "cloudflare",
    label: "Cloudflare AI (free)",
    modes: cloudflareClient.isFlux2(process.env.CLOUDFLARE_IMAGE_MODEL || "flux-2") ? Object.keys(MODES) : ["scene"],
    async health() {
        const h = await client.health();
        const refs = cloudflareClient.isFlux2(h.model || "flux-2");
        const cost = "free · ~60/day";
        return {
            ...h,
            provider: "cloudflare",
            label: "Cloudflare AI (free)",
            detail: [String(h.model || "").split("/").pop(), "free"].filter(Boolean).join(" · "),
            modes: [
                ...(refs ? [{ value: "product", label: "Your real product photo in the scene", needsPhoto: true, cost }] : []),
                { value: "scene", label: "AI scene from your description", cost },
                ...(refs ? [{ value: "sketch", label: "Follow the layout sketch", cost }] : []),
            ],
        };
    },
    async generate({ layout, mode = "scene", productPhoto, userPrompt, seed }) {
        if (!this.modes.includes(mode)) throw httpError(400, `This Cloudflare model can't use images — pick “AI scene”, or use the default model (remove CLOUDFLARE_IMAGE_MODEL).`);
        if (mode === "product" && !productPhoto) throw httpError(400, "Upload a photo of your product first (Product photo box) — or pick “AI scene”.");
        const images = [];
        let controlPng;
        if (mode === "product") {
            images.push({ data: productPhoto });
            controlPng = await productSubject(layout, productPhoto);
        } else {
            controlPng = await svgToPng(renderScribbleSvg(layout, { size: "final", invert: true }));
            if (mode === "sketch") images.push({ data: controlPng });
        }
        const prompt = buildGeminiPrompt({ layout, mode, userPrompt, hasPhoto: mode === "product", hasSketch: mode === "sketch" });
        const out = await client.generateImage({ prompt, images, aspectRatio: layout.aspectRatio || "4:5", seed: Number.isInteger(seed) && seed > 0 ? seed : undefined });
        return { image: out.image, controlPng, seed: seed || null, ms: out.ms, model: `Cloudflare · ${String(out.model).split("/").pop()}`, controlModel: mode, warnings: [], prompt };
    },
});

const PROVIDERS = { cloudflare, gemini, webui, stability };

/** The engine to use now (from .env — restart the backend after changing it) */
const hasGeminiKey = () => Boolean(String(process.env.GEMINI_IMAGE_API_KEY || process.env.GEMINI_API_KEY || "").trim());
const getImageProvider = (name = process.env.IMAGE_PROVIDER) => {
    // not set: Gemini when a Gemini key exists, else Stability AI (local GPU only when asked for)
    const hasCloudflare = Boolean(String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim() && String(process.env.CLOUDFLARE_API_TOKEN || "").trim());
    const key = String(name || "").trim().toLowerCase() || (hasCloudflare ? "cloudflare" : hasGeminiKey() ? "gemini" : "stability");
    const make = PROVIDERS[key];
    if (!make) throw Object.assign(new Error(`Unknown IMAGE_PROVIDER "${name}". Use: ${Object.keys(PROVIDERS).join(" | ")}`), { statusCode: 500 });
    return make();
};

module.exports = { getImageProvider, cloudflare, gemini, webui, stability, PROVIDERS, MODES, productSubject, lightDirectionOf, buildGeminiPrompt };
