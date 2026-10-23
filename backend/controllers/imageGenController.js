// ─────────────────────────────────────────────────────────────
// imageGenController.js — "Generate an image of your product" (the other option is the user's own image)
//   POST   /api/image-gen/plan               6-step flow, steps 2+3: prompt -> optimized photo prompt + texts + 4 styles (LLM, nothing saved)
//   POST   /api/image-gen/batch              MAIN FLOW: prompt -> up to 4 photos in different styles (no sketch step)
//                                            returns at once (status "generating"); the UI polls GET ?batchId=
//   POST   /api/image-gen/batch/:batchId/texts  new headline / subline / CTA on every photo of the batch
//   GET    /api/image-gen/options            compositions / product shapes / aspect ratios for the UI
//   GET    /api/image-gen/health             is the photo engine ready? (Stability AI key + credits, or local SD WebUI + ControlNet)
//   POST   /api/image-gen/layout             user prompt -> AI layout -> SVG preview      (LLM)
//   GET    /api/image-gen?productId=&postId=&batchId= list
//   GET    /api/image-gen/:id                one (with the SVG preview)
//   (legacy sketch flow, kept for old jobs / API users)
//   POST   /api/image-gen/:id/revise         AI changes the layout from the user's feedback (LLM)
//   PATCH  /api/image-gen/:id/layout         manual edits (texts, composition, shape, colors, photo prompt)
//   POST   /api/image-gen/:id/approve        user approves the sketch
//   POST   /api/image-gen/:id/generate       { mode: product | scene | sketch } -> photo -> typography + logo -> JPEG
//   POST   /api/image-gen/:id/compose        re-apply text / logo on the same photo (after editing the texts)
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const AdImage = require("../models/AdImage.js");
const Product = require("../models/Product.js");
const InstagramPost = require("../models/InstagramPost.js");
const FacebookPost = require("../models/FacebookPost.js");
const { generateAdLayout, reviseAdLayout, editAdLayout, buildStyleVariants, layoutFromPlan } = require("../ai/imageGen/AdLayoutAgent.js");
const { ASPECTS, COMPOSITIONS, PRODUCT_SHAPES, TEXT_LIMITS, MAX_VARIANTS, FONT_PAIRS, DEFAULT_FONT_PAIR } = require("../ai/imageGen/AdLayoutSpecs.js");
const { renderPreviewSvg } = require("../services/imageGen/layoutRenderer.js");
const { runGeneration, recompose, mediaFor } = require("../services/imageGen/adImagePipeline.js");
const { getImageProvider } = require("../services/imageGen/imageProviders.js");
const { refreshUrl, loadImage } = require("../services/imageGen/imageStorage.js");
const { cutOutLogo } = require("../services/imageGen/logoCutout.js");
const Brand = require("../ai/imageGen/BrandKit.js");

const POST_MODELS = { instagram: InstagramPost, facebook: FacebookPost };
const STUCK_MS = 10 * 60 * 1000; // a "generating" job older than this is treated as crashed
/** how many photos of a batch are made at the same time (free tiers rate-limit -> 2 is safe) */
const CONCURRENCY = Math.min(MAX_VARIANTS, Math.max(1, Number(process.env.IMAGE_GEN_CONCURRENCY) || 2));

const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const findJob = async (id) => (mongoose.isValidObjectId(id) ? AdImage.findById(id) : null);

/** logo url -> width / height (cached; the brand kit reserves the logo's corner with its real proportions) */
const logoAspectCache = new Map();
const logoAspect = async (url) => {
    if (!url) return null;
    if (logoAspectCache.has(url)) return logoAspectCache.get(url);
    // measured AFTER the background is cut out + trimmed (that is what gets drawn)
    const a = await loadImage(url).then(cutOutLogo).then((r) => r.width / r.height).catch(() => null);
    if (logoAspectCache.size > 200) logoAspectCache.clear();
    logoAspectCache.set(url, a);
    return a;
};

/**
 * The product's brand mark (logo OR icon — only one is ever used) + real product photo (all optional).
 * Only files the user uploaded in the app; markUrl = the one drawn on the images, markKind = "logo" | "icon".
 */
const productAssets = async (productId) => {
    const none = { logoUrl: null, iconUrl: null, markUrl: null, markKind: null, photoUrl: null, logoAspect: null };
    if (!productId) return none;
    const p = await Product.findById(productId).select("logoUrl iconUrl photoUrl").lean();
    if (!p) return none;
    const logoUrl = p.logoUrl ? refreshUrl(p.logoUrl) : null;
    const iconUrl = !logoUrl && p.iconUrl ? refreshUrl(p.iconUrl) : null; // never both (an upload clears the other)
    const markUrl = logoUrl || iconUrl;
    const markKind = markUrl ? "logo" : null; // the separate icon option was removed: an old icon is sized like a logo
    return { logoUrl, iconUrl, markUrl, markKind, photoUrl: p.photoUrl ? refreshUrl(p.photoUrl) : null, logoAspect: await logoAspect(markUrl) };
};

/**
 * Brand kit settings from the request ({ purpose: "social" | "ad", logoCorner: "top-left" | "bottom-right" })
 * + the real logo's proportions -> layout.brand. Every image of a batch (campaign) gets the same settings.
 */
const withBrand = (layout, body = {}, assets = {}) => {
    if (!Brand.enabled()) return layout;
    const patch = {};
    if (body.purpose) patch.purpose = body.purpose;
    if (body.logoCorner) patch.logoCorner = body.logoCorner;
    if (body.logoWidthPct != null) patch.logoWidthPct = body.logoWidthPct;
    if (assets.logoAspect) patch.logoAspect = assets.logoAspect;
    if (assets.markKind) patch.mark = assets.markKind;
    return editAdLayout(layout, { brand: patch });
};

/** the logo / icon was changed after the image was planned -> reserve the corner for the new file (kind + proportions) */
const syncLogo = (doc, assets) => {
    const b = doc.layout?.brand;
    if (!b || !assets) return;
    const patch = {};
    if (assets.logoAspect && Math.abs((b.logoAspect || 0) - assets.logoAspect) >= 0.01) patch.logoAspect = assets.logoAspect;
    if (assets.markKind && assets.markKind !== (b.mark || "logo")) patch.mark = assets.markKind;
    if (!Object.keys(patch).length) return;
    doc.layout = editAdLayout(doc.layout, { brand: patch });
    doc.markModified("layout");
};

/** What the frontend gets: the job + its SVG preview (+ the media object once there is a final image) */
const view = (doc, assets = {}) => {
    const { logoUrl = null, iconUrl = null, markUrl = null, markKind = null, photoUrl = null, logoAspect: aspect = null } = assets || {};
    const p = doc.toObject ? doc.toObject() : doc;
    if (p.layout?.brand && (aspect || markKind)) p.layout = { ...p.layout, brand: { ...p.layout.brand, ...(aspect ? { logoAspect: aspect } : {}), ...(markKind ? { mark: markKind } : {}) } };
    if (p.images) for (const k of ["controlUrl", "rawUrl", "finalUrl"]) if (p.images[k]) p.images[k] = refreshUrl(p.images[k]);
    return {
        ...p,
        logoUrl,
        iconUrl,
        productPhotoUrl: photoUrl,
        previewSvg: renderPreviewSvg(p.layout, { logoUrl: markUrl, productPhotoUrl: photoUrl }),
        media: p.images?.finalUrl ? mediaFor(p.images.finalUrl) : null,
    };
};

/** Default aspect ratio: asked > the draft's visual brief > reel/story = 9:16 > 4:5 */
const pickAspect = (asked, post) => {
    if (ASPECTS[asked]) return asked;
    if (post?.contentType === "reel") return "9:16";
    const fromPost = post?.content?.visual?.aspectRatio;
    return ASPECTS[fromPost] ? fromPost : "4:5";
};

const postContextOf = (post) => {
    if (!post?.content) return null;
    const c = post.content;
    const ctx = {
        format: post.contentType,
        hook: c.hook,
        visualBrief: c.visual?.brief,
        visualStyle: c.visual?.style,
        onImageText: c.visual?.onImageText,
        cta: c.cta || post.brief?.cta,
    };
    Object.keys(ctx).forEach((k) => !ctx[k] && delete ctx[k]);
    return Object.keys(ctx).length ? ctx : null;
};

/** Photo mode: asked (if the engine has it) > your real product photo when uploaded > AI scene; local WebUI only does "sketch" */
const pickMode = (asked, assets) => {
    let provider;
    try {
        provider = getImageProvider();
    } catch {
        return "sketch";
    }
    if (provider.modes.includes(asked)) return asked;
    if (provider.modes.includes("product") && assets?.photoUrl) return "product";
    return provider.modes.includes("scene") ? "scene" : provider.modes[0];
};

// ───────── GET /options ─────────
const getOptions = (req, res) =>
    res.json({
        success: true,
        data: {
            aspects: Object.entries(ASPECTS).map(([value, a]) => ({ value, width: a.width, height: a.height })),
            compositions: Object.entries(COMPOSITIONS).map(([value, c]) => ({ value, label: c.label })),
            productShapes: Object.entries(PRODUCT_SHAPES).map(([value, s]) => ({ value, label: s.label })),
            textLimits: TEXT_LIMITS,
            // curated font pairs: the browser loads `url` (GET /fonts/...) to preview each heading font
            fontPairs: Object.entries(FONT_PAIRS).filter(([value]) => (Brand.enabled() ? value === Brand.FONT_PAIR : value !== Brand.FONT_PAIR)).map(([value, f]) => ({
                value, label: f.label, mood: f.mood,
                heading: { family: f.heading.family, weight: f.heading.weight, url: `/fonts/${f.heading.slug}-latin-${f.heading.weight}-normal.woff` },
                body: { family: f.body.family, weight: f.body.weight, url: `/fonts/${f.body.slug}-latin-${f.body.weight}-normal.woff` },
            })),
            defaultFontPair: Brand.enabled() ? Brand.FONT_PAIR : DEFAULT_FONT_PAIR,
            // brand kit: fixed colours + typography, logo corner + size rules (the UI hides the font picker)
            brand: Brand.publicKit(),
        },
    });

// ───────── GET /storage — where media is kept (Cloudinary = public links, no ngrok needed) ─────────
const getStorage = (req, res) => {
    const cloud = require("../services/cloudStorage.js").isConfigured();
    res.json({ success: true, data: { cloud, provider: cloud ? "cloudinary" : "local", publicBaseUrl: Boolean(process.env.PUBLIC_BASE_URL) } });
};

// ───────── GET /health ─────────
const getHealth = async (req, res, next) => {
    try {
        const data = await getImageProvider().health();
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/** prompt + the post / product it is for -> what the layout agent needs (throws { statusCode } on bad input) */
const resolveContext = async ({ prompt, productId, postId, platform } = {}) => {
    if (!prompt || !String(prompt).trim()) throw httpError(400, "Describe the image you want (prompt)");
    let post = null;
    if (postId) {
        const Model = POST_MODELS[platform] || InstagramPost;
        if (!mongoose.isValidObjectId(postId)) throw httpError(400, "Invalid postId");
        post = await Model.findById(postId).lean();
        if (!post) throw httpError(404, "Post not found");
    }
    const pid = productId || post?.productId;
    let productProfile = post?.productProfile || {};
    if (pid) {
        if (!mongoose.isValidObjectId(pid)) throw httpError(400, "Invalid productId");
        const product = await Product.findById(pid).lean();
        if (!product) throw httpError(404, "Product not found");
        productProfile = product.aiProfile || productProfile;
    }
    return { post, pid, productProfile, platform: post ? (POST_MODELS[platform] ? platform : "instagram") : null };
};

// ───────── POST /layout  { prompt, productId?, postId?, platform?, aspectRatio?, purpose?, logoCorner? } ─────────
const createLayout = async (req, res, next) => {
    try {
        const { prompt, aspectRatio } = req.body || {};
        const { post, pid, productProfile, platform } = await resolveContext(req.body || {});

        const planned = await generateAdLayout({
            userPrompt: prompt,
            aspectRatio: pickAspect(aspectRatio, post),
            productProfile,
            postContext: postContextOf(post),
        });
        const assets = await productAssets(pid);
        const layout = withBrand(planned.layout, req.body || {}, assets);
        const { usage } = planned;

        const doc = await AdImage.create({
            productId: pid || undefined,
            postId: post?._id,
            platform,
            prompt: String(prompt).trim().slice(0, 2000),
            layout,
            status: "layout",
            usage,
            revisions: [{ by: "user", prompt: String(prompt).trim().slice(0, 300) }],
        });
        res.status(201).json({
            success: true,
            data: view(doc, assets),
            assistant: { message: "Here's the layout sketch. Change the text, ask me to adjust it, or approve it to make the photo." },
        });
    } catch (err) {
        if (err.statusCode && err.statusCode < 500) return fail(res, err.statusCode, err.message);
        next(err);
    }
};

/**
 * Make the photo of one job: photo engine -> typography + logo -> JPEG. Saves the job as done / failed.
 * Used by POST /:id/generate (one photo) and POST /batch (up to 4, in the background).
 */
const runJob = async (doc, { mode, assets, opts = {}, req }) => {
    try {
        doc.status = "generating";
        doc.error = undefined;
        doc.set("generation.startedAt", new Date());
        await doc.save();

        syncLogo(doc, assets);
        const result = await runGeneration({ layout: doc.layout, logoUrl: assets.markUrl, productPhotoUrl: assets.photoUrl, userPrompt: doc.prompt, mode, ...opts, req });

        if (doc.images?.finalUrl) doc.history.push({ finalUrl: doc.images.finalUrl, rawUrl: doc.images.rawUrl, seed: doc.generation?.seed });
        if (doc.history.length > 12) doc.history = doc.history.slice(-12);
        doc.images = result.images;
        doc.generation = { ...result.generation, startedAt: doc.generation?.startedAt };
        doc.warnings = result.warnings;
        doc.status = "done";
        await doc.save();
        return result;
    } catch (err) {
        doc.status = "failed";
        doc.error = err.message;
        await doc.save().catch(() => { });
        throw err;
    }
};

/** run fn over items, at most `limit` at a time; never throws (every job saves its own error) */
const runPool = async (items, limit, fn) => {
    const queue = [...items];
    const worker = async () => {
        while (queue.length) {
            const item = queue.shift();
            await fn(item).catch(() => { });
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

// ───────── POST /batch  { prompt, productId?, postId?, platform?, aspectRatio?, count? (1–4), mode?, purpose?, logoCorner? } ─────────
// purpose: "social" (logo 15–22 % wide) | "ad" (18–25 %); logoCorner: "top-left" | "bottom-right" — same for every image of the set
// prompt -> AI plans texts + photo prompt + 4 styles (1 LLM call) -> up to 4 photos in different styles, made in the background.
// Responds right away with the jobs (status "generating"); the UI polls GET /api/image-gen?batchId=...
const createBatch = async (req, res, next) => {
    try {
        const b = req.body || {};
        const { post, pid, productProfile, platform } = await resolveContext(b);
        const count = Math.min(MAX_VARIANTS, Math.max(1, Math.round(Number(b.count)) || MAX_VARIANTS));

        let provider;
        try {
            provider = getImageProvider();
        } catch (err) {
            return fail(res, 500, err.message);
        }
        const assets = await productAssets(pid);
        const mode = pickMode(b.mode, assets);
        if (mode === "product" && !assets.photoUrl) return fail(res, 400, "Upload a photo of your product first — or pick “AI scene”.");

        // the plan the user already reviewed (POST /plan, texts maybe edited) -> no second LLM call
        const planned = b.layout ? layoutFromPlan(b.layout, { aspectRatio: pickAspect(b.aspectRatio || b.layout.aspectRatio, post), productProfile }) : null;
        const { layout: base, usage } = planned
            ? { layout: planned, usage: { promptTokens: 0, completionTokens: 0, estimated: false } }
            : await generateAdLayout({
                userPrompt: b.prompt,
                aspectRatio: pickAspect(b.aspectRatio, post),
                productProfile,
                postContext: postContextOf(post),
            });
        // brand kit: one purpose + one logo corner for the whole set (a campaign keeps its logo in the same corner)
        const layout = withBrand(base, b, assets);
        const variants = buildStyleVariants(layout, count);

        const batchId = new mongoose.Types.ObjectId().toString();
        const now = new Date();
        const prompt = String(b.prompt).trim().slice(0, 2000);
        const docs = await AdImage.create(
            variants.map((v) => ({
                productId: pid || undefined,
                postId: post?._id,
                platform,
                batchId,
                style: v.style?.name,
                prompt,
                layout: v,
                status: "generating",
                layoutApprovedAt: now, // no sketch to approve any more
                generation: { provider: provider.name, mode, startedAt: now },
                usage,
                revisions: [{ by: "user", prompt: prompt.slice(0, 300) }],
            }))
        );

        res.status(202).json({
            success: true,
            data: { batchId, mode, items: docs.map((d) => view(d, assets)) },
            assistant: { message: `Making ${docs.length} image${docs.length === 1 ? "" : "s"} in different styles — about ${docs.length > CONCURRENCY ? "30–120" : "10–60"} s.` },
        });

        // background: the request is answered, each job saves its own result / error
        runPool(docs, CONCURRENCY, (doc) => runJob(doc, { mode, assets, req })).catch((err) => console.error("[imageGen batch]", err));
    } catch (err) {
        if (err.statusCode && err.statusCode < 500) return fail(res, err.statusCode, err.message);
        next(err);
    }
};

// ───────── POST /plan  { prompt, productId?, postId?, platform?, aspectRatio?, purpose?, logoCorner? } ─────────
// Steps 2 + 3 of the editor's 6-step image flow: the AI optimizes the prompt into a photo prompt, writes the
// headline / subline / CTA and picks 4 styles. Nothing is saved — the UI shows it, the user may edit the texts,
// then sends it back as POST /batch { layout } (no second LLM call).
const planLayout = async (req, res, next) => {
    try {
        const b = req.body || {};
        const { post, pid, productProfile } = await resolveContext(b);
        const planned = await generateAdLayout({
            userPrompt: b.prompt,
            aspectRatio: pickAspect(b.aspectRatio, post),
            productProfile,
            postContext: postContextOf(post),
        });
        const assets = await productAssets(pid);
        const layout = withBrand(planned.layout, b, assets);
        const { usage } = planned;
        const styles = buildStyleVariants(layout, MAX_VARIANTS).map((v) => ({ name: v.style.name, look: v.style.look, hook: v.style.hook || null, composition: v.composition, texts: v.texts }));
        res.json({
            success: true,
            data: { prompt: String(b.prompt).trim().slice(0, 2000), layout, styles, previewSvg: renderPreviewSvg(layout, { logoUrl: assets.markUrl, productPhotoUrl: assets.photoUrl }) },
            usage,
            assistant: { message: "Your prompt is optimized — check the texts and styles, then pick a size." },
        });
    } catch (err) {
        if (err.statusCode && err.statusCode < 500) return fail(res, err.statusCode, err.message);
        next(err);
    }
};

// ───────── POST /batch/:batchId/texts  { texts?, fontPair?, ids?, refresh? } — same photos, new text / font ─────────
//   ids     only these images of the set (default: all). Every image has its own texts (a different hook), so
//           new texts are normally sent for ONE image; a font can go to one or all.
//   refresh true + nothing else = just redraw text + the current logo on the photos (after a logo upload / delete)
const batchTexts = async (req, res, next) => {
    try {
        const texts = req.body?.texts && typeof req.body.texts === "object" ? req.body.texts : null;
        const fontPair = typeof req.body?.fontPair === "string" && FONT_PAIRS[req.body.fontPair] ? req.body.fontPair : null;
        const refresh = req.body?.refresh === true;
        if (!texts && !fontPair && !refresh) return fail(res, 400, "Send the new texts and/or font ({ texts: { headline, subline, cta }, fontPair, ids? })");
        const all = await AdImage.find({ batchId: String(req.params.batchId) });
        if (!all.length) return fail(res, 404, "Image set not found");
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : null;
        const docs = ids ? all.filter((d) => ids.includes(String(d._id))) : all;
        if (!docs.length) return fail(res, 404, "None of those images belong to this set");
        if (docs.some(isBusy)) return fail(res, 409, "Some images are still being made — wait for them to finish");

        const assets = await productAssets(docs[0].productId);
        const warnings = [];
        for (const doc of docs) {
            if (texts || fontPair) {
                applyLayout(doc, editAdLayout(doc.layout, { ...(texts ? { texts } : {}), ...(fontPair ? { fontPair } : {}) }));
                doc.revisions.push({ by: "user", prompt: [texts && "Edited texts", fontPair && `Font: ${FONT_PAIRS[fontPair].label}`].filter(Boolean).join(" · ") });
            }
            if (doc.images?.rawUrl && doc.status === "done") {
                try {
                    syncLogo(doc, assets);
                    const r = await recompose({ layout: doc.layout, rawUrl: doc.images.rawUrl, logoUrl: assets.markUrl, req });
                    doc.set("images.finalUrl", r.finalUrl);
                    doc.set("generation.theme", r.theme);
                    doc.warnings = r.warnings;
                    warnings.push(...r.warnings);
                } catch (err) {
                    warnings.push(`${doc.style || "Image"}: ${err.message}`);
                }
            }
            await doc.save();
        }
        res.json({
            success: true,
            data: { batchId: req.params.batchId, items: all.map((d) => view(d, assets)) },
            assistant: { message: `${refresh && !texts && !fontPair ? "Logo updated" : fontPair && !texts ? "Font updated" : "Text updated"} on ${docs.length === all.length && all.length > 1 ? "all images" : docs.length === 1 ? "this image" : `${docs.length} images`}.`, warnings: [...new Set(warnings)] },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── GET /?productId=&postId= ─────────
const listJobs = async (req, res, next) => {
    try {
        const q = {};
        if (req.query.batchId) q.batchId = String(req.query.batchId);
        for (const k of ["productId", "postId"]) {
            if (req.query[k]) {
                if (!mongoose.isValidObjectId(req.query[k])) return fail(res, 400, `Invalid ${k}`);
                q[k] = req.query[k];
            }
        }
        const docs = await AdImage.find(q).sort({ updatedAt: -1 }).limit(Math.min(Number(req.query.limit) || 20, 50));
        const assets = q.productId ? await productAssets(q.productId) : null;
        res.json({ success: true, data: await Promise.all(docs.map(async (d) => view(d, assets || (await productAssets(d.productId))))) });
    } catch (err) {
        next(err);
    }
};

// ───────── GET /:id ─────────
const getJob = async (req, res, next) => {
    try {
        const doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        res.json({ success: true, data: view(doc, await productAssets(doc.productId)) });
    } catch (err) {
        next(err);
    }
};

const productProfileOf = async (doc) => (doc.productId ? (await Product.findById(doc.productId).lean())?.aiProfile || {} : {});
const isBusy = (doc) => doc.status === "generating" && Date.now() - new Date(doc.generation?.startedAt || doc.updatedAt).getTime() < STUCK_MS;

/** Changing the picture itself (not only the texts) means the sketch must be approved + generated again */
const PICTURE_KEYS = ["aspectRatio", "composition", "productShape", "productView", "props", "sdPromptCore"]; // palette = preview colors + CTA only
const pictureChanged = (a, b) => PICTURE_KEYS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
const applyLayout = (doc, next) => {
    const changed = pictureChanged(doc.layout, next);
    doc.layout = next;
    doc.markModified("layout");
    if (changed) {
        doc.status = "layout";
        doc.layoutApprovedAt = undefined;
    }
    return changed;
};

// ───────── POST /:id/revise  { feedback } ─────────
const reviseLayout = async (req, res, next) => {
    try {
        const feedback = String(req.body?.feedback || "").trim();
        if (!feedback) return fail(res, 400, "Tell me what to change (feedback)");
        const doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        if (isBusy(doc)) return fail(res, 409, "The photo is being generated — wait for it to finish");

        const { layout, usage } = await reviseAdLayout({ layout: doc.layout, feedback, productProfile: await productProfileOf(doc) });
        const pictureRedo = applyLayout(doc, layout);
        doc.revisions.push({ by: "ai", prompt: feedback.slice(0, 300) });
        doc.usage = usage;
        await doc.save();
        res.json({
            success: true,
            data: view(doc, await productAssets(doc.productId)),
            assistant: { message: pictureRedo ? "Updated the sketch. Approve it again to generate the photo." : "Updated the text. Click “Re-apply text” to put it on your photo." },
        });
    } catch (err) {
        next(err);
    }
};

// ───────── PATCH /:id/layout  { texts?, composition?, productShape?, aspectRatio?, palette?, sdPrompt? } ─────────
const editLayout = async (req, res, next) => {
    try {
        const doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        if (isBusy(doc)) return fail(res, 409, "The photo is being generated — wait for it to finish");
        const next = editAdLayout(doc.layout, req.body || {});
        applyLayout(doc, next);
        doc.revisions.push({ by: "user", prompt: `Edited ${Object.keys(req.body || {}).join(", ") || "layout"}` });
        await doc.save();
        res.json({ success: true, data: view(doc, await productAssets(doc.productId)) });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /:id/approve ─────────
const approveLayout = async (req, res, next) => {
    try {
        const doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        if (isBusy(doc)) return fail(res, 409, "The photo is being generated — wait for it to finish");
        if (doc.status === "layout") doc.status = "approved";
        doc.layoutApprovedAt = new Date();
        await doc.save();
        res.json({ success: true, data: view(doc, await productAssets(doc.productId)), assistant: { message: "Layout approved. Generate the photo now? It takes about 10–60 seconds." } });
    } catch (err) {
        next(err);
    }
};

// ───────── POST /:id/generate  { mode?, seed?, steps?, cfgScale?, controlWeight? } ─────────
const generateImage = async (req, res, next) => {
    let doc;
    try {
        doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        if (!doc.batchId && (!doc.layoutApprovedAt || doc.status === "layout")) return fail(res, 409, "Approve the layout sketch first");
        if (isBusy(doc)) return fail(res, 409, "This image is already being generated");

        const b = req.body || {};
        const int = (v, min, max) => (Number.isInteger(Number(v)) && v !== "" && v != null ? Math.min(max, Math.max(min, Number(v))) : undefined);
        const opts = {
            seed: int(b.seed, -1, 2 ** 32 - 1),
            steps: int(b.steps, 10, 60),
            cfgScale: b.cfgScale != null ? Math.min(12, Math.max(2, Number(b.cfgScale) || 6)) : undefined,
            controlWeight: b.controlWeight != null ? Math.min(1.5, Math.max(0.3, Number(b.controlWeight) || 0.85)) : undefined,
        };

        const assets = await productAssets(doc.productId);
        const mode = pickMode(b.mode, assets);
        const result = await runJob(doc, { mode, assets, opts, req });

        res.json({
            success: true,
            data: view(doc, assets),
            assistant: {
                message: `Your ad image is ready (${Math.round((result.generation.ms || 0) / 1000)} s). Use it in the post, or regenerate for a different photo.`,
                warnings: result.warnings,
            },
        });
    } catch (err) {
        if (err.statusCode) return fail(res, err.statusCode, err.message, doc ? { data: view(doc) } : {});
        next(err);
    }
};

// ───────── POST /:id/compose — same photo, new text / logo ─────────
const composeImage = async (req, res, next) => {
    try {
        const doc = await findJob(req.params.id);
        if (!doc) return fail(res, 404, "Image job not found");
        if (!doc.images?.rawUrl) return fail(res, 409, "Generate the photo first");
        if (doc.status === "layout") return fail(res, 409, "The picture layout changed — approve and generate a new photo");
        const assets = await productAssets(doc.productId);
        syncLogo(doc, assets);
        const r = await recompose({ layout: doc.layout, rawUrl: doc.images.rawUrl, logoUrl: assets.markUrl, req });
        doc.set("images.finalUrl", r.finalUrl);
        doc.set("generation.theme", r.theme);
        doc.warnings = r.warnings;
        doc.status = "done";
        await doc.save();
        res.json({ success: true, data: view(doc, assets), assistant: { message: "Text and logo re-applied.", warnings: r.warnings } });
    } catch (err) {
        next(err);
    }
};

module.exports = { getOptions, getStorage, getHealth, planLayout, createBatch, batchTexts, createLayout, listJobs, getJob, reviseLayout, editLayout, approveLayout, generateImage, composeImage };
