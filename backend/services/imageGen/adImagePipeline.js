// ─────────────────────────────────────────────────────────────
// adImagePipeline.js — approved layout -> final ad JPEG
//   1. layout -> sketch SVG -> PNG                         (layoutRenderer + sharp, inside the provider)
//   2. -> photorealistic photo                              (Google Gemini, Stability AI, or local SD WebUI + ControlNet)
//   3. photo -> typography + logo -> JPEG                  (adComposer)
// Dependencies are injectable (tests use a fake provider + in-memory storage).
// ─────────────────────────────────────────────────────────────
const storage = require("./imageStorage.js");
const { getImageProvider } = require("./imageProviders.js");
const { composeAd } = require("./adComposer.js");

const loadLogo = async (logoUrl, load, warnings) => {
    if (!logoUrl) return null;
    try {
        return await load(logoUrl);
    } catch (err) {
        warnings.push(`Logo skipped: ${err.message}`);
        return null;
    }
};

/**
 * Full run (photo engine included: ~10–30 s on Stability AI, ~20–90 s on a local GPU).
 * @returns {Promise<{ images: {controlUrl, rawUrl, finalUrl}, generation, warnings, media }>}
 */
const runGeneration = async (
    { layout, logoUrl, mode, productPhotoUrl, userPrompt, seed, steps, cfgScale, controlWeight, req },
    { provider = getImageProvider(), save = storage.saveBuffer, load = storage.loadImage } = {}
) => {
    // 1 + 2. layout (+ your product photo) -> photo
    let productPhoto = null;
    if (mode === "product" && productPhotoUrl) {
        try {
            productPhoto = await load(productPhotoUrl);
        } catch (err) {
            throw Object.assign(new Error(`Couldn't read your product photo: ${err.message}. Upload it again.`), { statusCode: 400 });
        }
    }
    const out = await provider.generate({ layout, mode, productPhoto, userPrompt, seed, steps, cfgScale, controlWeight });
    const warnings = [...(out.warnings || [])];
    const control = await save(out.controlPng, { ext: "png", prefix: "control", req });
    const raw = await save(out.image, { ext: "png", prefix: "photo", req });

    // 3. real typography + the user's uploaded logo OR icon (logoUrl = whichever one is in use), drawn as it is
    const logo = await loadLogo(logoUrl, load, warnings);
    const composed = await composeAd({ layout, photo: out.image, logo });
    warnings.push(...(composed.warnings || []));
    const final = await save(composed.jpeg, { ext: "jpg", prefix: "ad", req });

    return {
        images: { controlUrl: control.url, rawUrl: raw.url, finalUrl: final.url },
        generation: {
            provider: provider.name, mode: mode || null, seed: out.seed, steps: steps || null, cfgScale: cfgScale || null, controlWeight: controlWeight || null,
            checkpoint: out.model, controlModel: out.controlModel, theme: composed.theme, ms: out.ms,
            prompt: out.prompt || null,
        },
        warnings,
        media: mediaFor(final.url),
    };
};

/** Text / CTA / logo changed after the photo was made -> redo ONLY step 3 on the same photo (no GPU, ~1 s) */
const recompose = async ({ layout, rawUrl, logoUrl, req }, { save = storage.saveBuffer, load = storage.loadImage } = {}) => {
    const warnings = [];
    const photo = await load(rawUrl);
    const logo = await loadLogo(logoUrl, load, warnings);
    const composed = await composeAd({ layout, photo, logo });
    warnings.push(...(composed.warnings || []));
    const final = await save(composed.jpeg, { ext: "jpg", prefix: "ad", req });
    return { finalUrl: final.url, theme: composed.theme, warnings, media: mediaFor(final.url) };
};

/** The object the Content Editor puts in post.media (Instagram needs JPEG -> we always output JPEG) */
const mediaFor = (url) => ({ type: "image", url, mimeType: "image/jpeg", source: "upload", publicReachable: storage.isPublicUrl(url) });

module.exports = { runGeneration, recompose, mediaFor };
