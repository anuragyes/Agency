// node --test tests/imageGen/imageGen.test.js
// Image generation: prompt -> layout JSON -> SVG preview / scribble PNG -> (fake) SD + ControlNet -> typography + logo -> JPEG
// No network, no GPU, no MongoDB: the LLM, Stable Diffusion WebUI and storage are faked.
// these tests cover the free (non-brand) behaviour; the brand rules are tested in brandKit.test.js
process.env.AD_BRAND_KIT = "off";
const test = require("node:test");
const assert = require("node:assert");
const sharp = require("sharp");

const { generateAdLayout, reviseAdLayout, editAdLayout, normalizeLayout, cleanPhotoPrompt } = require("../../ai/imageGen/AdLayoutAgent.js");
const { COMPOSITIONS, PRODUCT_SHAPES, ASPECTS } = require("../../ai/imageGen/AdLayoutSpecs.js");
const R = require("../../services/imageGen/layoutRenderer.js");
const Brand = require("../../ai/imageGen/BrandKit.js");
const { svgToPng, composeAd } = require("../../services/imageGen/adComposer.js");
const { runGeneration, recompose } = require("../../services/imageGen/adImagePipeline.js");
const sd = require("../../services/imageGen/sdWebuiClient.js");
const stabilityClient = require("../../services/imageGen/stabilityClient.js");
const { getImageProvider, webui, stability } = require("../../services/imageGen/imageProviders.js");

const profile = { name: "Gaon Desi Ghee", category: "Food > Dairy > Ghee", features: ["A2 Gir cow milk", "Bilona hand-churned"] };

const fakeLlm = (replies) => {
    const calls = [];
    return { calls, lastUsage: null, async generate({ input }) { calls.push(input); return replies[calls.length - 1]; } };
};

const LAYOUT_REPLY = JSON.stringify({
    composition: "text-top",
    productShape: "jar",
    productView: "front",
    scene: "Rustic kitchen counter in warm morning light",
    props: [
        { shape: "leaf", x: 8, y: 74, w: 14, h: 8, label: "tulsi leaf" },
        { shape: "circle", x: 40, y: 10, w: 10, h: 10, label: "in the text area" }, // must be dropped
        { shape: "blob", x: 76, y: 70, w: 14, h: 10, label: "wooden spoon" },
    ],
    palette: { background: "#f3ece2", surface: "#c9b79c", accent: "#b45309" },
    texts: { headline: "**Pure Bilona A2 Ghee** & More", subline: "Hand-churned from Gir cow milk", cta: "Shop now" },
    sdPrompt: "glass jar of golden ghee on a rustic wooden counter, tulsi leaves, wooden spoon, warm morning window light, shallow depth of field, text that says GHEE",
    negativePrompt: "plastic",
});

/* ── layout agent ── */
test("layout: LLM JSON -> clean layout (props out of the text area, no text in the photo prompt)", async () => {
    const llm = fakeLlm([LAYOUT_REPLY]);
    const { layout } = await generateAdLayout({ userPrompt: "ghee jar ad, warm kitchen", aspectRatio: "4:5", productProfile: profile, llm });
    assert.equal(layout.aspectRatio, "4:5");
    assert.equal(layout.composition, "text-top");
    assert.equal(layout.productShape, "jar");
    assert.equal(layout.productName, "Gaon Desi Ghee");
    assert.deepEqual(layout.props.map((p) => p.label), ["tulsi leaf", "wooden spoon"]);
    assert.equal(layout.texts.headline, "Pure Bilona A2 Ghee & More", "markdown stripped");
    assert.ok(!/\btext\b/i.test(layout.sdPromptCore), "no 'text' request reaches Stable Diffusion");
    assert.match(layout.sdPrompt, /clean empty top area/);
    assert.match(layout.sdPrompt, /RAW photo/);
    assert.match(layout.negativePrompt, /watermark.*plastic/);
    assert.match(llm.calls[0], /PRODUCT FACTS/);
});

test("layout: unknown values fall back to safe defaults", () => {
    const l = normalizeLayout({ composition: "diagonal", productShape: "rocket", props: "x", palette: { accent: "red" }, texts: {} }, { aspectRatio: "9:16" });
    assert.equal(l.composition, "text-top");
    assert.equal(l.productShape, "generic");
    assert.equal(l.palette.accent, "#7c3aed");
    assert.deepEqual(l.props, []);
    const flat = normalizeLayout({ composition: "flatlay", productView: "front" }, { aspectRatio: "1:1" });
    assert.equal(flat.productView, "top-down");
});

test("layout: retries once with the validation errors", async () => {
    const llm = fakeLlm(['{"texts":{"headline":""},"sdPrompt":"jar"}', LAYOUT_REPLY]);
    await generateAdLayout({ userPrompt: "x", llm });
    assert.equal(llm.calls.length, 2);
    assert.match(llm.calls[1], /REJECTED/);
});

test("layout: revise keeps what the feedback didn't change", async () => {
    const { layout } = await generateAdLayout({ userPrompt: "x", productProfile: profile, llm: fakeLlm([LAYOUT_REPLY]) });
    const llm = fakeLlm([JSON.stringify({ composition: "text-bottom", sdPrompt: "glass jar of golden ghee on a rustic wooden counter, warm light" })]);
    const { layout: next } = await reviseAdLayout({ layout, feedback: "put the text at the bottom", productProfile: profile, llm });
    assert.equal(next.composition, "text-bottom");
    assert.equal(next.productShape, "jar");
    assert.equal(next.texts.headline, layout.texts.headline);
    assert.match(llm.calls[0], /CURRENT LAYOUT/);
    assert.match(llm.calls[0], /put the text at the bottom/);
});

test("layout: manual edits are clamped", () => {
    const base = normalizeLayout(JSON.parse(LAYOUT_REPLY), { aspectRatio: "4:5" });
    const e = editAdLayout(base, { texts: { headline: "x".repeat(200), cta: "Buy" }, composition: "product-left", productShape: "nope" });
    assert.equal(e.texts.headline.length, 48);
    assert.equal(e.texts.cta, "Buy");
    assert.equal(e.composition, "product-left");
    assert.equal(e.productShape, "jar");
    assert.match(e.sdPrompt, /right side/);
    assert.equal(base.composition, "text-top", "original not mutated");
});

/* ── SVG rendering ── */
const sample = () => normalizeLayout(JSON.parse(LAYOUT_REPLY), { aspectRatio: "4:5", productProfile: profile });

test("preview SVG: real headline (escaped), logo box, renders at the final size", async () => {
    const svg = R.renderPreviewSvg(sample());
    assert.match(svg, /data-role="headline" aria-label="[^"]*Pure Bilona A2/);
    assert.match(svg, /aria-label="[^"]*Ghee &amp; More"/, "& escaped");
    assert.match(svg, />LOGO</);
    const meta = await sharp(Buffer.from(svg)).metadata();
    assert.deepEqual([meta.width, meta.height], [1080, 1350]);
    assert.match(R.renderPreviewSvg(sample(), { logoUrl: "http://x/uploads/logos/a.png" }), /<image href="http:\/\/x\/uploads\/logos\/a.png"/);
});

test("every product shape + composition + aspect renders", async () => {
    for (const shape of Object.keys(PRODUCT_SHAPES)) {
        for (const composition of Object.keys(COMPOSITIONS)) {
            for (const aspectRatio of Object.keys(ASPECTS)) {
                const l = editAdLayout(sample(), { productShape: shape, composition, aspectRatio });
                await sharp(Buffer.from(R.renderScribbleSvg(l))).png().toBuffer();
                await sharp(Buffer.from(R.renderPreviewSvg(l))).resize(200).png().toBuffer();
            }
        }
    }
});

test("scribble: white lines on black at SD size, no text, text area left empty", async () => {
    const l = sample();
    const svg = R.renderScribbleSvg(l);
    assert.ok(!svg.includes("<text"), "no text in the ControlNet input");
    const png = await svgToPng(svg);
    const meta = await sharp(png).metadata();
    assert.deepEqual([meta.width, meta.height], [640, 800]);
    const tb = COMPOSITIONS[l.composition].text;
    const region = await sharp(png).extract({ left: Math.round((tb.x / 100) * 640), top: Math.round((tb.y / 100) * 800), width: Math.round((tb.w / 100) * 640), height: Math.round((tb.h / 100) * 800) }).toBuffer();
    const { channels } = await sharp(region).stats();
    assert.equal(channels[0].max, 0, "text area is pure black");
    const all = await sharp(png).stats();
    assert.equal(all.channels[0].max, 255, "has white strokes");
});

test("typography: long headline wraps to max 3 lines inside the text box", () => {
    const l = editAdLayout(sample(), { texts: { headline: "The purest hand churned bilona ghee from happy Gir cows" }, composition: "product-right" });
    const t = R.layoutText(l, 1080, 1350);
    assert.ok(t.headline.lines.length <= 3);
    assert.ok(t.headline.fs >= 30);
    const head = R.typeOf(l, "heading");
    for (const line of t.headline.lines) assert.ok(head.measure(line, t.headline.fs) <= t.box.w + 0.5, `"${line}" fits the box width`);
});

/* ── Stable Diffusion WebUI client ── */
const jsonRes = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
const fakeWebui = ({ txt2img } = {}) => {
    const calls = [];
    const fetchImpl = async (url, opts = {}) => {
        calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
        if (url.endsWith("/sdapi/v1/sd-models")) return jsonRes(200, [{ title: "realisticVisionV60B1_v51HyperVAE.safetensors [f47e942ad4]" }, { title: "v1-5-pruned.safetensors [abc]" }]);
        if (url.endsWith("/sdapi/v1/options")) return jsonRes(200, { sd_model_checkpoint: "v1-5-pruned.safetensors [abc]" });
        if (url.endsWith("/controlnet/model_list")) return jsonRes(200, { model_list: ["control_v11p_sd15_canny [d14c016b]", "control_v11p_sd15_scribble [d4ba51ff]"] });
        if (url.endsWith("/sdapi/v1/txt2img")) return txt2img ? txt2img(opts) : jsonRes(500, { detail: "no" });
        return jsonRes(404, { detail: "Not Found" });
    };
    return { calls, fetchImpl };
};

test("sd client: health finds the realistic checkpoint + scribble model by part of the name", async () => {
    process.env.SD_CHECKPOINT = "realisticVision";
    delete process.env.SD_CONTROLNET_MODEL;
    sd._resetCache();
    const { fetchImpl } = fakeWebui();
    const h = await sd.health({ fetchImpl });
    assert.equal(h.ok, true, h.problems.join());
    assert.equal(h.checkpoint, "realisticVisionV60B1_v51HyperVAE.safetensors [f47e942ad4]");
    assert.equal(h.controlModel, "control_v11p_sd15_scribble [d4ba51ff]");
    delete process.env.SD_CHECKPOINT;
});

test("sd client: WebUI not running -> clear 503 message", async () => {
    sd._resetCache();
    const h = await sd.health({ fetchImpl: async () => { throw new TypeError("fetch failed"); } });
    assert.equal(h.ok, false);
    assert.match(h.problems[0], /Start it with --api/);
});

test("sd client: txt2img sends ControlNet scribble (no preprocessor) + checkpoint override", async () => {
    process.env.SD_CHECKPOINT = "realisticVision";
    sd._resetCache();
    const png = await sharp({ create: { width: 64, height: 80, channels: 3, background: "#888" } }).png().toBuffer();
    const { calls, fetchImpl } = fakeWebui({ txt2img: () => jsonRes(200, { images: [png.toString("base64")], info: JSON.stringify({ seed: 1234 }) }) });
    const out = await sd.txt2imgScribble({ prompt: "p", negativePrompt: "n", width: 640, height: 800, controlImageBase64: "AAA", seed: -1 }, { fetchImpl });
    assert.equal(out.seed, 1234);
    assert.ok(Buffer.isBuffer(out.image));
    const body = calls.find((c) => c.url.endsWith("/txt2img")).body;
    const unit = body.alwayson_scripts.controlnet.args[0];
    assert.equal(unit.module, "none");
    assert.equal(unit.model, "control_v11p_sd15_scribble [d4ba51ff]");
    assert.equal(unit.image, "AAA");
    assert.equal(body.override_settings.sd_model_checkpoint, "realisticVisionV60B1_v51HyperVAE.safetensors [f47e942ad4]");
    assert.deepEqual([body.width, body.height], [640, 800]);
    delete process.env.SD_CHECKPOINT;
});

/* ── full pipeline with a fake Stable Diffusion ── */
const memoryStorage = () => {
    const files = new Map();
    return {
        files,
        save: async (buf, { ext, prefix }) => {
            const url = `http://localhost:5000/uploads/generated/${prefix}-${files.size}.${ext}`;
            files.set(url, buf);
            return { url };
        },
        load: async (url) => {
            if (!files.has(url)) throw new Error("not found");
            return files.get(url);
        },
    };
};

test("pipeline: approved layout -> scribble -> SD -> typography + logo -> 1080x1350 JPEG", async () => {
    const store = memoryStorage();
    const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
    store.files.set("http://localhost:5000/uploads/logos/logo.png", logo);
    let sdArgs;
    const fakeSd = {
        txt2imgScribble: async (args) => {
            sdArgs = args;
            const image = await sharp({ create: { width: args.width, height: args.height, channels: 3, background: "#f5f5f0" } }).png().toBuffer();
            return { image, seed: 42, ms: 1500, checkpoint: "rv", controlModel: "scribble" };
        },
    };
    const r = await runGeneration({ layout: sample(), logoUrl: "http://localhost:5000/uploads/logos/logo.png" }, { provider: webui(fakeSd), save: store.save, load: store.load });

    assert.deepEqual([sdArgs.width, sdArgs.height], [640, 800]);
    const control = await sharp(Buffer.from(sdArgs.controlImageBase64, "base64")).metadata();
    assert.equal(control.format, "png");
    assert.equal(r.generation.seed, 42);
    assert.equal(r.generation.theme, "dark", "bright photo -> dark text");
    assert.deepEqual(r.warnings, []);
    assert.equal(r.media.mimeType, "image/jpeg");
    assert.equal(r.media.publicReachable, false);
    const final = await sharp(store.files.get(r.images.finalUrl)).metadata();
    assert.equal(final.format, "jpeg");
    assert.deepEqual([final.width, final.height], [1080, 1350]);

    // logo is really on the image (top-left of the logo box is red-ish now)
    const lb = R.px(COMPOSITIONS["text-top"].logo, 1080, 1350);
    const spot = await sharp(store.files.get(r.images.finalUrl)).extract({ left: Math.round(lb.x + lb.w / 2 - 5), top: Math.round(lb.y + lb.h / 2 - 5), width: 10, height: 10 }).toBuffer();
    const { channels } = await sharp(spot).stats();
    assert.ok(channels[0].mean > 150 && channels[1].mean < 90, "logo composited");

    // edit the text afterwards -> recompose on the same photo (no SD call)
    const edited = editAdLayout(sample(), { texts: { headline: "New headline" } });
    const again = await recompose({ layout: edited, rawUrl: r.images.rawUrl, logoUrl: "http://missing/logo.png" }, { save: store.save, load: store.load });
    assert.notEqual(again.finalUrl, r.images.finalUrl);
    assert.match(again.warnings[0], /Logo skipped/);
});

test("composer: dark photo -> white text theme", async () => {
    const photo = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#101418" } }).png().toBuffer();
    const { theme, jpeg } = await composeAd({ layout: sample(), photo });
    assert.equal(theme, "light");
    assert.equal((await sharp(jpeg).metadata()).format, "jpeg");
});

test("composer: dark logo on a dark photo -> drawn as uploaded (no plate) + a hard-to-see warning", async () => {
    const photo = await sharp({ create: { width: 640, height: 800, channels: 3, background: "#15110d" } }).png().toBuffer();
    const logo = await sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 30, g: 20, b: 10, alpha: 1 } } }).png().toBuffer();
    const l = sample();
    const { jpeg, warnings } = await composeAd({ layout: l, photo, logo });
    if (l.brand) {
        const { box } = Brand.logoPlacement(l.brand, 1080, 1350, 3);
        const spot = await sharp(jpeg).extract({ left: Math.round(box.x + box.w + 6), top: Math.round(box.y + box.h / 2), width: 6, height: 4 }).toBuffer();
        const { channels } = await sharp(spot).stats();
        assert.ok(channels[0].mean < 60, `no light plate next to the logo (${channels[0].mean})`);
        assert.ok(warnings.some((w) => /hard to see/.test(w)), "the user is told it may be hard to see");
    }
});

/* ── Stability AI (hosted, no GPU) ── */
const withEnv = async (vars, fn) => {
    const old = {};
    for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }
    try { return await fn(); } finally { for (const k of Object.keys(old)) { if (old[k] == null) delete process.env[k]; else process.env[k] = old[k]; } }
};

test("provider: Stability AI by default (no GPU); IMAGE_PROVIDER=webui for a local GPU", () =>
    withEnv({ IMAGE_PROVIDER: null, STABILITY_API_KEY: null, GEMINI_API_KEY: null, GEMINI_IMAGE_API_KEY: null, CLOUDFLARE_ACCOUNT_ID: null, CLOUDFLARE_API_TOKEN: null }, async () => {
        assert.equal(getImageProvider().name, "stability");
        process.env.IMAGE_PROVIDER = "webui";
        assert.equal(getImageProvider().name, "webui");
        assert.throws(() => getImageProvider("dalle"), /Unknown IMAGE_PROVIDER/);
    }));

test("stability: health without a key explains what to do", () =>
    withEnv({ STABILITY_API_KEY: null }, async () => {
        const h = await stabilityClient.health({ fetchImpl: async () => assert.fail("no call without key") });
        assert.equal(h.ok, false);
        assert.match(h.problems[0], /STABILITY_API_KEY/);
    }));

test("stability: health shows credits; low credits is a problem", () =>
    withEnv({ STABILITY_API_KEY: "sk-test" }, async () => {
        const fetchOk = async (url, o) => {
            assert.match(url, /\/v1\/user\/balance$/);
            assert.equal(o.headers.Authorization, "Bearer sk-test");
            return new Response(JSON.stringify({ credits: 24.5 }), { status: 200 });
        };
        assert.deepEqual(await stabilityClient.health({ fetchImpl: fetchOk }), { ok: true, credits: 24.5, problems: [] });
        const low = await stabilityClient.health({ fetchImpl: async () => new Response(JSON.stringify({ credits: 1 }), { status: 200 }) });
        assert.equal(low.ok, false);
        assert.match(low.problems[0], /Only 1/);
        const bad = await stabilityClient.health({ fetchImpl: async () => new Response(JSON.stringify({ errors: ["bad key"] }), { status: 401 }) });
        assert.match(bad.problems[0], /rejected the API key/);
    }));

test("stability: sketch -> multipart request (image, prompt, strength) -> photo buffer", () =>
    withEnv({ STABILITY_API_KEY: "sk-test" }, async () => {
        const png = await sharp({ create: { width: 64, height: 80, channels: 3, background: "#999" } }).png().toBuffer();
        let sent;
        const fetchImpl = async (url, o) => {
            sent = { url, headers: o.headers, form: o.body };
            return new Response(JSON.stringify({ image: png.toString("base64"), seed: 777, finish_reason: "SUCCESS" }), { status: 200 });
        };
        const out = await stabilityClient.controlSketch({ sketchPng: png, prompt: "jar of ghee", negativePrompt: "text", controlStrength: 0.8, seed: 5 }, { fetchImpl });
        assert.match(sent.url, /\/v2beta\/stable-image\/control\/sketch$/);
        assert.equal(sent.headers.Accept, "application/json");
        assert.equal(sent.form.get("prompt"), "jar of ghee");
        assert.equal(sent.form.get("negative_prompt"), "text");
        assert.equal(sent.form.get("control_strength"), "0.8");
        assert.equal(sent.form.get("seed"), "5");
        assert.equal(sent.form.get("output_format"), "png");
        assert.equal(sent.form.get("image").type, "image/png");
        assert.equal(out.seed, 777);
        assert.ok(out.image.equals(png));
    }));

test("stability: out of credits / moderation -> clear errors", () =>
    withEnv({ STABILITY_API_KEY: "sk-test" }, async () => {
        const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
        const call = (status) => stabilityClient.controlSketch({ sketchPng: png, prompt: "p" }, { fetchImpl: async () => new Response(JSON.stringify({ errors: ["x"] }), { status }) });
        await assert.rejects(call(402), (e) => e.statusCode === 402 && /out of credits/.test(e.message));
        await assert.rejects(call(403), /content moderation/);
        await assert.rejects(call(429), /rate limit/);
    }));

test("pipeline with Stability: sends black-on-white sketch at FINAL size (1080x1350), no text", async () => {
    const store = memoryStorage();
    let got;
    const fakeClient = {
        controlSketch: async (a) => {
            got = a;
            const m = await sharp(a.sketchPng).metadata();
            const image = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: "#d8c7a8" } }).png().toBuffer();
            return { image, seed: 99, ms: 900, finishReason: "CONTENT_FILTERED" };
        },
    };
    const r = await runGeneration({ layout: sample(), mode: "sketch" }, { provider: stability(fakeClient), save: store.save, load: store.load });
    const m = await sharp(got.sketchPng).metadata();
    assert.deepEqual([m.width, m.height], [1080, 1350]);
    const tb = COMPOSITIONS["text-top"].text;
    const region = await sharp(got.sketchPng).extract({ left: Math.round(tb.x * 10.8), top: Math.round(tb.y * 13.5), width: Math.round(tb.w * 10.8), height: Math.round(tb.h * 13.5) }).toBuffer();
    assert.equal((await sharp(region).stats()).channels[0].min, 255, "text area of the sketch is pure white");
    assert.equal((await sharp(got.sketchPng).stats()).channels[0].min, 0, "has black lines");
    assert.match(got.prompt, /RAW photo/);
    assert.equal(r.generation.provider, "stability");
    assert.equal(r.generation.seed, 99);
    assert.match(r.warnings[0], /content filter/);
    const final = await sharp(store.files.get(r.images.finalUrl)).metadata();
    assert.deepEqual([final.format, final.width, final.height], ["jpeg", 1080, 1350]);
});

/* ── photo modes (fix: the sketch used to override detailed scenes, AI-drawn labels were misspelled) ── */
const SCENE_PROMPT = "An Indian woman in a cotton saree prepares gajar ka halwa in a brass kadai, pouring golden ghee from a spoon. " +
    "A premium glass jar of ghee with a cream-and-deep-green label reading “DHENU” and “A2 GIR COW GHEE.” stands in the foreground on a wooden counter. " +
    "Natural golden morning light from a window on the left, shallow depth of field, steam rising, no text overlays.";

test("photo prompt keeps the whole scene but never asks the AI to write the brand name", () => {
    const p = cleanPhotoPrompt(SCENE_PROMPT);
    assert.match(p, /woman in a cotton saree/);
    assert.match(p, /gajar ka halwa/);
    assert.match(p, /plain label/);
    assert.ok(!/DHENU|GIR COW GHEE|text/i.test(p), p);
    const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY), sdPrompt: SCENE_PROMPT }, { aspectRatio: "4:5" });
    assert.ok(l.sdPromptCore.length > 200, "long prompts are no longer cut to 60 words");
});

test("ad texts are cut at a word, never mid-word (was: “Explore DHENU dairy toda”)", () => {
    const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY), texts: { headline: "x", cta: "Explore DHENU dairy today and save more" } }, { aspectRatio: "4:5" });
    assert.equal(l.texts.cta, "Explore DHENU dairy today");
});

test("CTA button grows/shrinks so the whole text fits the text box", () => {
    const l = editAdLayout(sample(), { composition: "product-left", texts: { cta: "Explore DHENU dairy today" } });
    const t = R.layoutText(l, 1080, 1350);
    assert.ok(t.cta.w <= t.box.w + 0.5);
    assert.ok(R.typeOf(l, "cta").measure("Explore DHENU dairy today", t.cta.fs) + t.cta.fs * 2.4 <= t.box.w + 1, "text fits inside the pill");
});

const photoOf = (w, h, color) => sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

test("scene mode: Stable Image Ultra gets the FULL description + aspect ratio (no sketch)", async () => {
    let got;
    const client = { generateUltra: async (a) => { got = a; return { image: await photoOf(896, 1120, "#a0805a"), seed: 3, ms: 5, finishReason: "SUCCESS" }; } };
    const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY), sdPrompt: SCENE_PROMPT }, { aspectRatio: "4:5" });
    const store = memoryStorage();
    const r = await runGeneration({ layout: l, mode: "scene" }, { provider: stability(client), save: store.save, load: store.load });
    assert.equal(got.aspectRatio, "4:5");
    assert.match(got.prompt, /woman in a cotton saree.*brass kadai/);
    assert.equal(r.generation.mode, "scene");
    const final = await sharp(store.files.get(r.images.finalUrl)).metadata();
    assert.deepEqual([final.width, final.height], [1080, 1350], "any engine size -> final ad size");
});

test("product mode: YOUR photo is placed in the product box and sent to replace-background-and-relight", async () => {
    let got;
    const client = { replaceBackgroundRelight: async (a) => { got = a; return { image: await photoOf(1080, 1350, "#6b4a2b"), seed: 8, ms: 20000, finishReason: "SUCCESS" }; } };
    const store = memoryStorage();
    const jar = await photoOf(600, 800, "#e0b000"); // stands in for the real DHENU jar photo
    store.files.set("http://localhost:5000/uploads/products/jar.png", jar);
    const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY), sdPrompt: SCENE_PROMPT, productDescription: "glass jar of golden ghee" }, { aspectRatio: "4:5" });
    const r = await runGeneration({ layout: l, mode: "product", productPhotoUrl: "http://localhost:5000/uploads/products/jar.png" },
        { provider: stability(client), save: store.save, load: store.load });

    const meta = await sharp(got.subjectPng).metadata();
    assert.deepEqual([meta.width, meta.height], [1080, 1350]);
    const pb = R.px(COMPOSITIONS["text-top"].product, 1080, 1350);
    const center = await sharp(got.subjectPng).extract({ left: Math.round(pb.x + pb.w / 2 - 4), top: Math.round(pb.y + pb.h * 0.7), width: 8, height: 8 }).toBuffer();
    const c = (await sharp(center).stats()).channels;
    assert.ok(c[0].mean > 200 && c[2].mean < 60, "the real product sits in the product box");
    assert.equal(got.foregroundPrompt, "glass jar of golden ghee");
    assert.equal(got.lightDirection, "left", "“light from a window on the left” -> light_source_direction");
    assert.match(got.backgroundPrompt, /gajar ka halwa/);
    assert.equal(r.generation.mode, "product");

    await assert.rejects(runGeneration({ layout: l, mode: "product" }, { provider: stability(client), save: store.save, load: store.load }), /Upload a photo of your product/);
});

test("local WebUI only does sketch mode — clear message for the others", async () => {
    await assert.rejects(webui({}).generate({ layout: sample(), mode: "scene" }), (e) => e.statusCode === 400 && /needs Cloudflare \(free\), Google Gemini or Stability AI/.test(e.message));
});

test("stability: async result polling (202 -> 200) for replace-background-and-relight", () =>
    withEnv({ STABILITY_API_KEY: "sk-test" }, async () => {
        const png = await photoOf(64, 64, "#fff");
        const calls = [];
        const fetchImpl = async (url, o) => {
            calls.push(url);
            if (url.endsWith("/replace-background-and-relight")) {
                assert.equal(o.body.get("preserve_original_subject"), "0.8");
                assert.equal(o.body.get("light_source_direction"), "left");
                return new Response(JSON.stringify({ id: "gen123" }), { status: 200 });
            }
            if (url.endsWith("/v2beta/results/gen123")) {
                return calls.filter((u) => u.includes("results")).length < 2
                    ? new Response("", { status: 202 })
                    : new Response(JSON.stringify({ result: png.toString("base64"), seed: 11, finish_reason: "SUCCESS" }), { status: 200 });
            }
            throw new Error("unexpected " + url);
        };
        const out = await stabilityClient.replaceBackgroundRelight(
            { subjectPng: png, backgroundPrompt: "kitchen", foregroundPrompt: "jar", lightDirection: "left" },
            { fetchImpl, pollOptions: { intervalMs: 1, sleep: async () => {} } }
        );
        assert.equal(out.seed, 11);
        assert.equal(calls.filter((u) => u.includes("results")).length, 2);
    }));

/* ── Google Gemini ("Nano Banana") ── */
const gemini = require("../../services/imageGen/geminiImageClient.js");
const { gemini: geminiProvider } = require("../../services/imageGen/imageProviders.js");

const MODELS_JSON = { models: [
    { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-image", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-nano-banana-2.1", supportedGenerationMethods: ["generateContent"] },
    { name: "models/imagen-4.0-generate-001", supportedGenerationMethods: ["predict"] },
] };

test("gemini: default provider when a Gemini key is set", () =>
    withEnv({ IMAGE_PROVIDER: null, GEMINI_API_KEY: "g-key", GEMINI_IMAGE_API_KEY: null, CLOUDFLARE_ACCOUNT_ID: null, CLOUDFLARE_API_TOKEN: null }, async () => {
        assert.equal(getImageProvider().name, "gemini");
        process.env.IMAGE_PROVIDER = "stability";
        assert.equal(getImageProvider().name, "stability");
    }));

test("gemini: health picks the best image model the key can use", () =>
    withEnv({ GEMINI_API_KEY: "g-key", GEMINI_IMAGE_MODEL: null }, async () => {
        gemini._resetCache();
        const h = await gemini.health({ fetchImpl: async (url, o) => {
            assert.equal(o.headers["x-goog-api-key"], "g-key");
            return new Response(JSON.stringify(MODELS_JSON), { status: 200 });
        } });
        assert.equal(h.ok, true, h.problems.join());
        assert.equal(h.model, "gemini-nano-banana-2.1");
        assert.deepEqual(h.models, ["gemini-2.5-flash-image", "gemini-nano-banana-2.1"]);
        const none = await withEnv({ GEMINI_API_KEY: null, GEMINI_IMAGE_API_KEY: null }, () => gemini.health({ fetchImpl: async () => assert.fail() }));
        assert.match(none.problems[0], /GEMINI_IMAGE_API_KEY/);
    }));

const geminiFetch = (handler) => async (url, o) => {
    if (url.includes("/models?")) return new Response(JSON.stringify(MODELS_JSON), { status: 200 });
    return handler(url, o, JSON.parse(o.body));
};

test("gemini: reference images first, prompt last, aspect ratio + 2K; returns the image", () =>
    withEnv({ GEMINI_API_KEY: "g-key", GEMINI_IMAGE_MODEL: null, GEMINI_IMAGE_SIZE: null }, async () => {
        gemini._resetCache();
        const png = await photoOf(64, 80, "#c08040");
        let sent;
        const out = await gemini.generateImage({ prompt: "a kitchen", images: [{ data: png, mimeType: "image/png" }], aspectRatio: "4:5" }, {
            fetchImpl: geminiFetch((url, o, body) => {
                sent = { url, body };
                return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "here" }, { inlineData: { mimeType: "image/png", data: png.toString("base64") } }] } }] }), { status: 200 });
            }),
        });
        assert.match(sent.url, /models\/gemini-nano-banana-2\.1:generateContent$/);
        const parts = sent.body.contents[0].parts;
        assert.equal(parts[0].inlineData.data, png.toString("base64"));
        assert.equal(parts[1].text, "a kitchen");
        assert.deepEqual(sent.body.generationConfig.imageConfig, { aspectRatio: "4:5", imageSize: "2K" });
        assert.deepEqual(sent.body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
        assert.ok(out.image.equals(png));
    }));

for (const message of ["Invalid value for image_size", "Image size 2K is not supported for this model"]) {
    test(`gemini: model rejects imageSize ("${message}") -> retries without it, same aspect, and remembers`, () =>
        withEnv({ GEMINI_API_KEY: "g-key", GEMINI_IMAGE_MODEL: null, GEMINI_IMAGE_SIZE: null }, async () => {
            gemini._resetCache();
            const png = await photoOf(8, 8, "#000");
            const configs = [];
            const fetchImpl = geminiFetch((url, o, body) => {
                const c = body.generationConfig.imageConfig;
                configs.push(c);
                return c.imageSize
                    ? new Response(JSON.stringify({ error: { message } }), { status: 400 })
                    : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: png.toString("base64") } }] } }] }), { status: 200 });
            });
            await gemini.generateImage({ prompt: "x", aspectRatio: "4:5" }, { fetchImpl });
            assert.deepEqual(configs, [{ aspectRatio: "4:5", imageSize: "2K" }, { aspectRatio: "4:5" }]);
            await gemini.generateImage({ prompt: "y", aspectRatio: "4:5" }, { fetchImpl });
            assert.deepEqual(configs.slice(2), [{ aspectRatio: "4:5" }], "next image: no failed call first");
        }));
}

test("gemini: model rejects 4:5 -> retries with 3:4", () =>
    withEnv({ GEMINI_API_KEY: "g-key", GEMINI_IMAGE_MODEL: null, GEMINI_IMAGE_SIZE: "off" }, async () => {
        gemini._resetCache();
        const png = await photoOf(8, 8, "#000");
        const configs = [];
        await gemini.generateImage({ prompt: "x", aspectRatio: "4:5" }, {
            fetchImpl: geminiFetch((url, o, body) => {
                configs.push(body.generationConfig.imageConfig);
                return configs.length === 1
                    ? new Response(JSON.stringify({ error: { message: "Unsupported aspect ratio 4:5" } }), { status: 400 })
                    : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { data: png.toString("base64") } }] } }] }), { status: 200 });
            }),
        });
        assert.deepEqual(configs, [{ aspectRatio: "4:5" }, { aspectRatio: "3:4" }]);
    }));

test("gemini: no billing / safety block / no image -> clear messages", () =>
    withEnv({ GEMINI_API_KEY: "g-key", GEMINI_IMAGE_MODEL: null }, async () => {
        gemini._resetCache();
        const run = (res) => gemini.generateImage({ prompt: "x" }, { fetchImpl: geminiFetch(() => res()) });
        await assert.rejects(run(() => new Response(JSON.stringify({ error: { message: "Quota exceeded ... limit: 0" } }), { status: 429 })), (e) => e.statusCode === 402 && /billing/.test(e.message));
        await assert.rejects(run(() => new Response(JSON.stringify({ candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }), { status: 200 })), /safety filter/);
        await assert.rejects(run(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "OTHER" } }), { status: 200 })), /blocked the prompt/);
    }));

test("gemini provider: your product photo + the user's prompt WORD FOR WORD + text-space rules", async () => {
    let got;
    const client = { generateImage: async (a) => { got = a; return { image: await photoOf(896, 1152, "#8a6a4a"), model: "gemini-nano-banana-2.1", ms: 9000 }; } };
    const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY), sdPrompt: "short summary" }, { aspectRatio: "4:5", productProfile: { name: "DHENU A2 Gir Cow Ghee" } });
    const jar = await photoOf(600, 800, "#e0b000");
    const out = await geminiProvider(client).generate({ layout: l, mode: "product", productPhoto: jar, userPrompt: SCENE_PROMPT });
    assert.equal(got.images.length, 1, "the real product photo is sent");
    assert.equal(got.aspectRatio, "4:5");
    assert.ok(got.prompt.includes(SCENE_PROMPT), "user's prompt is not summarized");
    assert.match(got.prompt, /IMAGE 1 is a photo of the REAL PRODUCT \(DHENU A2 Gir Cow Ghee\)/);
    assert.match(got.prompt, /in the upper part of the photo the same scene continues calmly/);
    assert.match(got.prompt, /Do NOT add any headline/);
    assert.equal(out.prompt, got.prompt);
    await assert.rejects(geminiProvider(client).generate({ layout: l, mode: "product" }), /Upload a photo/);
    await geminiProvider(client).generate({ layout: l, mode: "scene", userPrompt: SCENE_PROMPT });
    assert.equal(got.images.length, 0, "scene mode: no reference images");
});

/* ── Cloudflare Workers AI (free) ── */
const cf = require("../../services/imageGen/cloudflareImageClient.js");
const { cloudflare: cloudflareProvider } = require("../../services/imageGen/imageProviders.js");
const CF_ENV = { CLOUDFLARE_ACCOUNT_ID: "acc1", CLOUDFLARE_API_TOKEN: "cf-token", CLOUDFLARE_IMAGE_MODEL: null };

test("cloudflare: default provider when its keys are set (free first)", () =>
    withEnv({ ...CF_ENV, IMAGE_PROVIDER: null, GEMINI_API_KEY: "g" }, async () => {
        assert.equal(getImageProvider().name, "cloudflare");
    }));

test("cloudflare: health checks token + model; missing keys explained", () =>
    withEnv(CF_ENV, async () => {
        const h = await cf.health({ fetchImpl: async (url, o) => {
            assert.match(url, /\/accounts\/acc1\/ai\/models\/search\?search=flux-2-klein-4b$/);
            assert.equal(o.headers.Authorization, "Bearer cf-token");
            return new Response(JSON.stringify({ success: true, result: [{ name: "@cf/black-forest-labs/flux-2-klein-4b" }] }), { status: 200 });
        } });
        assert.equal(h.ok, true, h.problems.join());
        const bad = await cf.health({ fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 10000, message: "Authentication error" }] }), { status: 403 }) });
        assert.match(bad.problems[0], /rejected the token/);
        const none = await withEnv({ CLOUDFLARE_API_TOKEN: null }, () => cf.health({ fetchImpl: async () => assert.fail() }));
        assert.match(none.problems[0], /CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN/);
    }));

test("cloudflare: FLUX.2 klein multipart — prompt, 1024x1280, product photo as input_image_0 (< 512 px)", () =>
    withEnv(CF_ENV, async () => {
        const out64 = (await photoOf(1024, 1280, "#7a5a3a")).toString("base64");
        let form;
        const r = await cf.generateImage({ prompt: "kitchen scene", images: [{ data: await photoOf(1200, 1600, "#e0b000") }], aspectRatio: "4:5" }, {
            fetchImpl: async (url, o) => {
                assert.match(url, /\/accounts\/acc1\/ai\/run\/@cf\/black-forest-labs\/flux-2-klein-4b$/);
                form = o.body;
                return new Response(JSON.stringify({ success: true, result: { image: out64 } }), { status: 200, headers: { "content-type": "application/json" } });
            },
        });
        assert.equal(form.get("prompt"), "kitchen scene");
        assert.equal(form.get("width"), "1024");
        assert.equal(form.get("height"), "1280");
        const ref = await sharp(Buffer.from(await form.get("input_image_0").arrayBuffer())).metadata();
        assert.ok(ref.width < 512 && ref.height < 512, `reference ${ref.width}x${ref.height}`);
        assert.equal((await sharp(r.image).metadata()).width, 1024);
    }));

test("cloudflare: daily free quota used up -> says when it resets", () =>
    withEnv(CF_ENV, async () => {
        await assert.rejects(
            cf.generateImage({ prompt: "x" }, { fetchImpl: async () => new Response(JSON.stringify({ success: false, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] }), { status: 429 }) }),
            (e) => e.statusCode === 429 && /resets at 00:00 UTC/.test(e.message)
        );
    }));

test("cloudflare provider: product mode sends your photo + the user's prompt word for word", () =>
    withEnv(CF_ENV, async () => {
        let got;
        const client = { generateImage: async (a) => { got = a; return { image: await photoOf(1024, 1280, "#8a6a4a"), model: "@cf/black-forest-labs/flux-2-klein-4b", ms: 4000 }; } };
        const l = normalizeLayout({ ...JSON.parse(LAYOUT_REPLY) }, { aspectRatio: "4:5", productProfile: { name: "DHENU A2 Gir Cow Ghee" } });
        const out = await cloudflareProvider(client).generate({ layout: l, mode: "product", productPhoto: await photoOf(600, 800, "#e0b000"), userPrompt: SCENE_PROMPT });
        assert.equal(got.images.length, 1);
        assert.ok(got.prompt.includes(SCENE_PROMPT));
        assert.match(got.prompt, /IMAGE 1 is a photo of the REAL PRODUCT/);
        assert.equal(out.model, "Cloudflare · flux-2-klein-4b");
    }));

/* ── one prompt -> up to 4 images in different styles (no sketch step) ── */
const { normalizeStyles, buildStyleVariants } = require("../../ai/imageGen/AdLayoutAgent.js");
const { STYLE_PRESETS, MAX_VARIANTS } = require("../../ai/imageGen/AdLayoutSpecs.js");
const { buildGeminiPrompt } = require("../../services/imageGen/imageProviders.js");

const STYLED_REPLY = JSON.stringify({
    ...JSON.parse(LAYOUT_REPLY),
    styles: [
        { name: "Rustic kitchen", look: "warm rustic kitchen counter, morning window light, wooden textures, homely mood", composition: "text-top" },
        { name: "Festive Diwali", look: "festive Diwali table with diyas and marigolds, warm golden bokeh, celebratory mood", composition: "product-left" },
        { name: "rustic kitchen", look: "duplicate name must be dropped from the list here", composition: "flatlay" },
        { name: "Bad", look: "too short" },
        { name: "Minimal white", look: "minimal white studio, soft shadow, label that says “DHENU”, airy and clean", composition: "nonsense" },
    ],
});

test("styles: LLM styles are cleaned (no duplicates, no text requests, valid compositions)", () => {
    const s = normalizeStyles(JSON.parse(STYLED_REPLY).styles);
    assert.deepEqual(s.map((x) => x.name), ["Rustic kitchen", "Festive Diwali", "Minimal white"]);
    assert.equal(s[2].composition, null, "unknown composition -> null (keep the base one)");
    assert.ok(!/DHENU/.test(s[2].look), "no quoted words for the image model to write");
    assert.equal(normalizeStyles("x").length, 0);
});

test("styles: the layout prompt asks the LLM for 4 different styles", async () => {
    const llm = fakeLlm([STYLED_REPLY]);
    const { layout } = await generateAdLayout({ userPrompt: "ghee jar, warm kitchen", productProfile: profile, llm });
    assert.match(llm.calls[0], /styles: exactly 4 CLEARLY DIFFERENT visual styles/);
    assert.equal(layout.styles.length, 3);
});

test("variants: one layout -> N layouts, each with its own style + composition, same texts", async () => {
    const { layout } = await generateAdLayout({ userPrompt: "ghee", productProfile: profile, llm: fakeLlm([STYLED_REPLY]) });
    const v = buildStyleVariants(layout, 4);
    assert.equal(v.length, 4);
    assert.deepEqual(v.map((x) => x.style.name), ["Rustic kitchen", "Festive Diwali", "Minimal white", STYLE_PRESETS[0].name], "LLM styles first, presets fill the gap");
    assert.deepEqual(v.map((x) => x.composition), ["text-top", "product-left", "text-top", "text-top"]);
    for (const x of v) {
        assert.equal(x.texts.headline, layout.texts.headline);
        assert.equal(x.styles, undefined, "variants don't carry the style list");
        assert.ok(x.sdPrompt.includes(x.style.look), "style goes into the Stable Diffusion / Stability prompt");
    }
    assert.equal(buildStyleVariants(layout, 1).length, 1);
    assert.equal(buildStyleVariants(layout, 99).length, MAX_VARIANTS);
});

test("variants: no LLM styles -> the 4 presets, all different", () => {
    const base = normalizeLayout(JSON.parse(LAYOUT_REPLY), { aspectRatio: "4:5", productProfile: profile });
    const v = buildStyleVariants(base);
    assert.equal(new Set(v.map((x) => x.style.name)).size, 4);
    assert.equal(new Set(v.map((x) => x.composition)).size >= 3, true, "compositions vary");
});

test("variants: the Gemini / Cloudflare prompt carries the user's prompt AND this version's style", () => {
    const base = normalizeLayout(JSON.parse(LAYOUT_REPLY), { aspectRatio: "4:5", productProfile: profile });
    const [, lifestyle] = buildStyleVariants(base);
    const p = buildGeminiPrompt({ layout: lifestyle, mode: "scene", userPrompt: "ghee jar with parathas" });
    assert.match(p, /ghee jar with parathas/);
    assert.match(p, /STYLE OF THIS VERSION — "Lifestyle"/);
});

test("variants: a revised variant keeps its style", () => {
    const base = normalizeLayout(JSON.parse(LAYOUT_REPLY), { aspectRatio: "4:5", productProfile: profile });
    const [first] = buildStyleVariants(base);
    const revised = normalizeLayout({ texts: { headline: "New" }, sdPrompt: "golden ghee jar on marble, soft daylight, minimal" }, { previous: first });
    assert.equal(revised.style.name, first.style.name);
});

// ── 6-step editor flow: POST /plan -> the user edits texts -> POST /batch { layout } (no second LLM call) ──
test("plan: a reviewed plan comes back clamped (edited texts kept, aspect switched, no text in the photo prompt)", async () => {
    const { layoutFromPlan, buildStyleVariants } = require("../../ai/imageGen/AdLayoutAgent.js");
    const { layout } = await generateAdLayout({ userPrompt: "ghee jar on a kitchen counter", aspectRatio: "4:5", productProfile: profile, llm: fakeLlm([LAYOUT_REPLY]) });
    const edited = { ...layout, texts: { headline: "  Pure **A2** ghee  ", subline: "Hand-churned", cta: "Order now" }, sdPromptCore: layout.sdPromptCore + ', label reading "GAON"' };
    const back = layoutFromPlan(JSON.parse(JSON.stringify(edited)), { aspectRatio: "1:1", productProfile: profile });
    assert.ok(back, "a valid plan is accepted");
    assert.strictEqual(back.aspectRatio, "1:1");
    assert.strictEqual(back.texts.headline, "Pure A2 ghee");
    assert.strictEqual(back.texts.cta, "Order now");
    assert.ok(!/GAON/.test(back.sdPromptCore), "quoted brand text is stripped from the photo prompt");
    assert.strictEqual(back.composition, layout.composition);
    assert.strictEqual(buildStyleVariants(back, 3).length, 3);
});

test("plan: junk or an empty plan is refused (the server plans again with the LLM)", () => {
    const { layoutFromPlan } = require("../../ai/imageGen/AdLayoutAgent.js");
    assert.strictEqual(layoutFromPlan(null), null);
    assert.strictEqual(layoutFromPlan([]), null);
    assert.strictEqual(layoutFromPlan({ texts: { headline: "Hi" } }), null); // no photo prompt
});


/* ── font engine + font pairs ── */
const fonts = require("../../services/imageGen/fontEngine.js");
const { FONT_PAIRS, DEFAULT_FONT_PAIR } = require("../../ai/imageGen/AdLayoutSpecs.js");

test("font engine: every font pair's files load (heading, body, CTA)", () => {
    assert.ok(fonts.available(), "opentype.js + Inter are available");
    for (const [key, pair] of Object.entries(FONT_PAIRS)) {
        for (const role of ["heading", "body", "cta"]) assert.ok(fonts.face(pair[role]), `${key} ${role} (${pair[role].slug} ${pair[role].weight}) loads`);
    }
});

test("font engine: real widths — wider text measures wider, size scales linearly, ₹ comes from latin-ext", () => {
    const f = fonts.face(FONT_PAIRS["modern-sans"].heading);
    const a = fonts.measure(f, "Pure Ghee", 100);
    assert.ok(a > 300 && a < 700, `width ${a}`);
    assert.ok(fonts.measure(f, "WWWW", 100) > fonts.measure(f, "iiii", 100));
    assert.ok(Math.abs(fonts.measure(f, "Pure Ghee", 50) * 2 - a) < 0.01);
    assert.ok(fonts.canRender(f, "Only ₹499 today"));
    assert.ok(!fonts.canRender(f, "शुद्ध देसी घी"), "Devanagari -> SVG <text> fallback");
});

test("every font pair × composition × aspect: headline, subline and CTA fit their box", () => {
    const texts = { headline: "Hand churned bilona ghee from happy Gir cows", subline: "Slow-cooked in small batches on a wood fire, the way our grandmothers made it", cta: "Order fresh today" };
    for (const fontPair of Object.keys(FONT_PAIRS)) {
        for (const composition of Object.keys(COMPOSITIONS)) {
            for (const aspectRatio of Object.keys(ASPECTS)) {
                const l = editAdLayout(sample(), { fontPair, composition, aspectRatio, texts });
                const { W, H } = R.canvasOf(l);
                const t = R.layoutText(l, W, H);
                const tag = `${fontPair} / ${composition} / ${aspectRatio}`;
                assert.equal(t.fontPair, fontPair);
                assert.ok(t.headline.lines.length >= 1 && t.headline.lines.length <= 3, tag);
                for (const line of t.headline.lines) assert.ok(R.typeOf(l, "heading").measure(line, t.headline.fs) <= t.box.w + 0.5, `${tag}: headline "${line}"`);
                for (const line of t.subline.lines) assert.ok(R.typeOf(l, "body").measure(line, t.subline.fs) <= t.box.w + 0.5, `${tag}: subline "${line}"`);
                assert.ok(t.cta.textW + t.cta.fs * 2.4 <= t.box.w + 0.5, `${tag}: CTA`);
                assert.ok(t.top >= t.box.y - 0.5 && t.top + t.total <= t.box.y + t.box.h + 0.5, `${tag}: whole block inside the text box`);
                assert.ok(t.cta.y + t.cta.h <= H, `${tag}: button on the canvas`);
                assert.deepEqual(t.issues, [], tag);
            }
        }
    }
});

test("text is drawn as font outlines (paths), Hindi falls back to <text>", () => {
    const svg = R.textOverlaySvg(editAdLayout(sample(), { fontPair: "elegant-serif" }), 1080, 1350);
    assert.match(svg, /<g data-role="headline"[^>]*><path d="M/);
    assert.ok(!/<text[^>]*>[^<]*Pure Bilona/.test(svg), "no <text> for latin headlines");
    const hi = R.textOverlaySvg(editAdLayout(sample(), { texts: { headline: "शुद्ध देसी घी" } }), 1080, 1350);
    assert.match(hi, /<text[^>]*font-family="&apos;Inter&apos;, &apos;Nirmala UI&apos;[^>]*>शुद्ध देसी घी<\/text>/);
});

test("a headline too long for 3 lines is cut with … and reported as an issue", () => {
    const l = editAdLayout(sample(), { composition: "product-right", fontPair: "impact-condensed", texts: { headline: "Supercalifragilistic expialidocious extraordinarily wonderful" } });
    const t = R.layoutText({ ...l, texts: { ...l.texts, headline: "Extraordinarily wonderful handmade bilona ghee churned slowly from happy grass fed Gir cows in Rajasthan villages" } }, 1080, 1350);
    assert.equal(t.headline.lines.length, 3);
    assert.match(t.headline.lines[2], /…$/);
    assert.ok(t.issues.some((i) => i.code === "text-too-long" && i.target === "headline"));
});

test("fontPair: LLM label is normalized, unknown -> default, edit + revise keep it", () => {
    const base = JSON.parse(LAYOUT_REPLY);
    assert.equal(normalizeLayout({ ...base, fontPair: "Elegant serif" }, { aspectRatio: "4:5" }).fontPair, "elegant-serif");
    assert.equal(normalizeLayout({ ...base, fontPair: "comic sans" }, { aspectRatio: "4:5" }).fontPair, DEFAULT_FONT_PAIR);
    const l = editAdLayout(sample(), { fontPair: "editorial" });
    assert.equal(l.fontPair, "editorial");
    assert.equal(editAdLayout(l, { fontPair: "nope" }).fontPair, "editorial");
    assert.equal(normalizeLayout({ ...base, fontPair: undefined }, { aspectRatio: "4:5", previous: l }).fontPair, "editorial");
});

test("composeAd renders a JPEG with every font pair", async () => {
    const photo = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#6b4f2a" } }).png().toBuffer();
    for (const fontPair of Object.keys(FONT_PAIRS)) {
        const out = await composeAd({ layout: editAdLayout(sample(), { fontPair }), photo });
        const meta = await sharp(out.jpeg).metadata();
        assert.equal(meta.format, "jpeg", fontPair);
    }
});

test("headline lines are balanced (no lonely last word)", () => {
    const l = editAdLayout(sample(), { composition: "text-top", texts: { headline: "Pure Bilona A2 Ghee, only ₹499" } });
    const t = R.layoutText(l, 1080, 1350);
    assert.equal(t.headline.lines.length, 2);
    assert.ok(t.headline.lines[1].split(" ").length >= 2, `last line "${t.headline.lines[1]}"`);
});

/* ── a different hook (headline / subline / CTA) on every image of a set ── */
const HOOKED_REPLY = JSON.stringify({
    ...JSON.parse(LAYOUT_REPLY),
    styles: [
        { name: "Rustic kitchen", hook: "Benefit", look: "warm rustic kitchen counter, morning window light, wooden textures, homely mood", composition: "text-top",
            texts: { headline: "Richer taste in every spoon", subline: "Hand-churned A2 ghee for everyday cooking", cta: "Order now" } },
        { name: "Festive Diwali", hook: "Emotion", look: "festive Diwali table with diyas and marigolds, warm golden bokeh, celebratory mood", composition: "product-left",
            texts: { headline: "Taste of nani's kitchen", subline: "The ghee your family grew up with", cta: "" } },
        { name: "Minimal white", hook: "Curiosity", look: "minimal white studio, soft shadow, airy and clean product shot", composition: "text-bottom",
            texts: { headline: "Why is our ghee golden?", subline: "Slow wood-fire cooking, the bilona way", cta: "See how it's made" } },
        { name: "Moody dark", look: "dark moody low-key scene, dramatic rim light, rich contrast, luxurious feel", composition: "product-right", texts: { headline: "" } },
    ],
});

test("hooks: the prompt asks for different texts per style, from different hook angles", async () => {
    const llm = fakeLlm([HOOKED_REPLY]);
    await generateAdLayout({ userPrompt: "ghee", productProfile: profile, llm });
    assert.match(llm.calls[0], /EVERY style gets its OWN ad texts written from a DIFFERENT hook angle/);
    assert.match(llm.calls[0], /Benefit \(.*Curiosity \(/);
});

test("hooks: every variant gets its own texts; a style without texts uses the base texts; empty CTA falls back", async () => {
    const { layout } = await generateAdLayout({ userPrompt: "ghee", productProfile: profile, llm: fakeLlm([HOOKED_REPLY]) });
    const v = buildStyleVariants(layout, 4);
    assert.deepEqual(v.map((x) => x.texts.headline), ["Richer taste in every spoon", "Taste of nani's kitchen", "Why is our ghee golden?", layout.texts.headline]);
    assert.deepEqual(v.map((x) => x.style.hook || null), ["Benefit", "Emotion", "Curiosity", null]);
    assert.equal(v[1].texts.cta, layout.texts.cta, "empty CTA -> the base CTA");
    assert.equal(v[2].texts.cta, "See how it's made");
    // a revision of one image keeps its own hook text unless the feedback changes it
    const revised = normalizeLayout({ sdPrompt: "golden ghee jar on marble, soft daylight, minimal" }, { previous: v[2] });
    assert.equal(revised.texts.headline, "Why is our ghee golden?");
});

test("hooks: style texts are clamped like normal texts (limits, no markdown)", () => {
    const [s] = normalizeStyles([{ name: "A", look: "a b c d e f g h", texts: { headline: "**" + "Very long headline that goes on and on and on forever".repeat(2) + "**", cta: "x" } }]);
    assert.ok(s.texts.headline.length <= 48 && !s.texts.headline.includes("*"));
});
