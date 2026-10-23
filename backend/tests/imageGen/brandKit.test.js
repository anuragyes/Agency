// node --test tests/imageGen/brandKit.test.js
// Brand rules for AI-generated images (ai/imageGen/BrandKit.js): logo placement / size / clear space,
// fixed typography + colours, brand visual style in the prompts. No network, no GPU, no MongoDB.
delete process.env.AD_BRAND_KIT; // brand kit on (the default)
const test = require("node:test");
const assert = require("node:assert");
const sharp = require("sharp");

const Brand = require("../../ai/imageGen/BrandKit.js");
const { normalizeLayout, editAdLayout, buildStyleVariants, layoutFromPlan, generateAdLayout } = require("../../ai/imageGen/AdLayoutAgent.js");
const { buildAdLayoutPrompt } = require("../../ai/imageGen/AdLayoutPrompt.js");
const { COMPOSITIONS, ASPECTS } = require("../../ai/imageGen/AdLayoutSpecs.js");
const R = require("../../services/imageGen/layoutRenderer.js");
const { composeAd } = require("../../services/imageGen/adComposer.js");
const { buildGeminiPrompt } = require("../../services/imageGen/imageProviders.js");

const raw = (over = {}) => ({
    composition: "text-top",
    productShape: "box",
    props: [{ shape: "circle", x: 2, y: 2, w: 10, h: 8, label: "gear" }, { shape: "blob", x: 76, y: 70, w: 12, h: 10, label: "wheel" }],
    palette: { background: "#000000", surface: "#111111", accent: "#00ff00" },
    texts: { headline: "Build your first robot", subline: "Hands-on STEM kits for curious kids aged 8–14", cta: "Book a free demo" },
    fontPair: "elegant-serif",
    sdPrompt: "An Indian girl and her father assemble a small wheeled robot on a white table in a bright classroom, soft daylight.",
    ...over,
});
const layout = (over = {}, opts = {}) => normalizeLayout(raw(over), { aspectRatio: "4:5", ...opts });

/** transparent PNG logo, 3:1 */
const logoPng = (rgb = { r: 239, g: 48, b: 39 }) =>
    sharp({ create: { width: 300, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: { create: { width: 260, height: 70, channels: 4, background: { ...rgb, alpha: 1 } } }, left: 20, top: 15 }])
        .png().toBuffer();
const flat = (W, H, v) => sharp({ create: { width: W, height: H, channels: 3, background: { r: v, g: v, b: v } } }).png().toBuffer();
const noisy = async (W, H) => {
    const px = Buffer.alloc(W * H * 3);
    for (let i = 0; i < px.length; i++) px[i] = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * 255;
    return sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
};
const pixel = async (jpeg, x, y) => {
    const { data } = await sharp(jpeg).extract({ left: Math.round(x), top: Math.round(y), width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
    return [data[0], data[1], data[2]];
};

test("brand: layouts get the brand settings, fixed font system + colours (LLM / UI can't switch them)", () => {
    const l = layout();
    assert.equal(l.brand.kit, "ilp");
    assert.equal(l.brand.purpose, "social");
    assert.equal(l.brand.logoCorner, Brand.LOGO.defaultCorner);
    assert.equal(l.fontPair, "brand");
    assert.deepEqual(l.palette, { background: "#ffffff", surface: "#f3f6fc", accent: "#ef3027" });
    const e = editAdLayout(l, { fontPair: "editorial", palette: { accent: "#123456" } });
    assert.equal(e.fontPair, "brand", "font stays the brand's");
    assert.equal(e.palette.accent, "#ef3027", "colours stay the brand's");
    const pair = R.fontPairOf(l);
    assert.deepEqual([pair.heading.family, pair.heading.weight, pair.body.family, pair.body.weight, pair.cta.family, pair.cta.weight], ["Poppins", 800, "Poppins", 600, "Inter", 700]);
});

test("brand: purpose / corner / width are clamped to the rules", () => {
    assert.equal(Brand.normalizeBrand({ purpose: "billboard", logoCorner: "top-right" }).purpose, "social");
    assert.equal(Brand.normalizeBrand({ logoCorner: "top-right" }).logoCorner, Brand.LOGO.defaultCorner, "only top-left / bottom-right");
    assert.equal(Brand.normalizeBrand({ purpose: "social", logoWidthPct: 40 }).logoWidthPct, 22);
    assert.equal(Brand.normalizeBrand({ purpose: "social", logoWidthPct: 5 }).logoWidthPct, 15);
    assert.equal(Brand.normalizeBrand({ purpose: "ad", logoWidthPct: 10 }).logoWidthPct, 18);
    assert.equal(Brand.normalizeBrand({ purpose: "ad" }).logoWidthPct, 22);
    // switching purpose -> that purpose's default width
    assert.equal(Brand.normalizeBrand({ purpose: "ad" }, Brand.normalizeBrand({ purpose: "social" })).logoWidthPct, 22);
});

test("brand: logo width 15–22 % (post) / 18–25 % (ad), proportions kept, corner + clear space", () => {
    for (const purpose of ["social", "ad"]) {
        for (const logoCorner of ["top-left", "bottom-right"]) {
            for (const logoAspect of [0.8, 1, 3, 6]) {
                for (const aspectRatio of Object.keys(ASPECTS)) {
                    const { width: W, height: H } = ASPECTS[aspectRatio];
                    const b = Brand.normalizeBrand({ purpose, logoCorner, logoAspect });
                    const { box, zone, clear } = Brand.logoPlacement(b, W, H);
                    const pct = (box.w / W) * 100;
                    const range = Brand.LOGO.widthPct[purpose];
                    const tag = `${purpose}/${logoCorner}/${logoAspect}/${aspectRatio}`;
                    assert.ok(pct >= range.min - 0.01 && pct <= range.max + 0.01, `${tag}: width ${pct.toFixed(1)} %`);
                    assert.ok(Math.abs(box.w / box.h - logoAspect) < 0.001, `${tag}: proportions`);
                    assert.ok(clear >= box.h * Brand.LOGO.mascotFaceRatio - 0.01, `${tag}: clear space ≥ mascot face`);
                    assert.ok(zone.x >= -0.01 && zone.y >= -0.01 && zone.x + zone.w <= W + 0.01 && zone.y + zone.h <= H + 0.01, `${tag}: clear space inside the canvas`);
                    if (logoCorner === "top-left") assert.ok(box.x < W / 2 && box.y < H / 2, tag);
                    else assert.ok(box.x > W / 2 && box.y > H / 2, tag);
                }
            }
        }
    }
});

test("brand: text block, product and props never enter the logo's clear space", () => {
    for (const composition of Object.keys(COMPOSITIONS)) {
        for (const logoCorner of ["top-left", "bottom-right"]) {
            for (const aspectRatio of Object.keys(ASPECTS)) {
                const l = editAdLayout(layout({}, { aspectRatio }), { composition, brand: { logoCorner, logoAspect: 1 } });
                const { W, H } = R.canvasOf(l);
                const a = R.areasOf(l, W, H);
                const tag = `${composition}/${logoCorner}/${aspectRatio}`;
                assert.ok(!Brand.intersects(a.text, a.logo.zone), `${tag}: text box`);
                assert.ok(!Brand.intersects(a.product, a.logo.zone), `${tag}: product box`);
                for (const p of R.visibleProps(l, W, H)) assert.ok(!Brand.intersects(R.px(p, W, H), a.logo.zone), `${tag}: prop ${p.label}`);
                const t = R.layoutText(l, W, H);
                const block = { x: t.box.x, y: t.top, w: t.box.w, h: t.total };
                assert.ok(!Brand.intersects(block, a.logo.zone), `${tag}: drawn text`);
            }
        }
    }
});

test("brand: typography sizes follow the brand ranges on a 1080 x 1350 post", () => {
    const l = editAdLayout(layout(), { texts: { headline: "Build your first robot", subline: "Hands-on STEM kits for kids", cta: "Book a free demo" } });
    const t = R.layoutText(l, 1080, 1350);
    assert.deepEqual(t.issues, []);
    assert.ok(t.headline.fs >= 64 && t.headline.fs <= 88, `headline ${t.headline.fs}`);
    assert.ok(t.subline.fs >= 36 && t.subline.fs <= 48, `subline ${t.subline.fs}`);
    assert.ok(t.cta.fs >= 28 && t.cta.fs <= 36, `cta ${t.cta.fs}`);
    // long texts may go below the range, but never below the readable floor
    const long = editAdLayout(l, { composition: "product-left", texts: { headline: "Robotics and coding classes for curious young minds", subline: "Small batches, real kits and friendly mentors in every session near you", cta: "Book your free trial class" } });
    const t2 = R.layoutText(long, 1080, 1350);
    assert.ok(t2.headline.fs >= Brand.TYPE.headline.floor && t2.subline.fs >= Brand.TYPE.subline.floor && t2.cta.fs >= Brand.TYPE.cta.floor);
});

test("brand: colours — red headline + blue subline on light areas, white on dark, red button", () => {
    const l = layout();
    const dark = R.textOverlaySvg(l, 1080, 1350, { theme: "dark" });
    const light = R.textOverlaySvg(l, 1080, 1350, { theme: "light" });
    assert.match(dark, /data-role="headline"[^>]*><path[^>]*fill="#ef3027"/);
    assert.match(dark, /data-role="subline"[^>]*><path[^>]*fill="#253c80"/);
    assert.match(dark, /stop-color="#ffffff"/, "white scrim behind dark text");
    assert.match(light, /data-role="headline"[^>]*><path[^>]*fill="#ffffff"/);
    assert.match(light, /stop-color="#253c80"/, "learning-blue scrim behind white text");
    for (const svg of [dark, light]) assert.match(svg, /data-role="cta"[^>]*><rect[^>]*fill="#ef3027"\/><path[^>]*fill="#ffffff"/);
});

test("brand: planner + photo prompts carry the visual style, keep the logo corner clean, no AI logos", async () => {
    const p = buildAdLayoutPrompt({ userPrompt: "robotics kit for kids", aspectRatio: "4:5" });
    assert.match(p, /BRAND RULES/);
    assert.match(p, /Indian children/);
    assert.match(p, /fontPair: always "brand"/);
    const l = editAdLayout(layout(), { brand: { logoCorner: "bottom-right" } });
    assert.match(l.sdPrompt, /bottom-right corner/);
    assert.match(l.sdPrompt, /child-focused educational/);
    const g = buildGeminiPrompt({ layout: l, mode: "scene", userPrompt: "kids building a robot" });
    assert.match(g, /BRAND STYLE/);
    assert.match(g, /In the bottom-right corner the SAME scene simply continues/);
    assert.match(g, /Do NOT put a panel, card, box/);
    assert.ok(!/\d+\s*%/.test(g), "no percentages the model could paint into the photo");
    // layout talk in the user's brief never reaches the image model
    const g2 = buildGeminiPrompt({ layout: l, mode: "scene", userPrompt: "Kids building a robot in a bright classroom. Bottom 30% is kept uncluttered with soft blur, leaving space for future text. Top-left 27% x 20% empty for the logo." });
    assert.match(g2, /Kids building a robot/);
    assert.ok(!/30%|27%|future text|for the logo/.test(g2), g2);
    assert.match(g, /Never draw a logo/);
});

test("brand: variants share one logo corner (a campaign), brand presets fill the gaps", () => {
    const base = editAdLayout(layout(), { brand: { logoCorner: "bottom-right", purpose: "ad" } });
    const v = buildStyleVariants(base, 4);
    assert.equal(v.length, 4);
    assert.deepEqual([...new Set(v.map((x) => x.brand.logoCorner))], ["bottom-right"]);
    assert.deepEqual([...new Set(v.map((x) => x.brand.purpose))], ["ad"]);
    assert.deepEqual(v.map((x) => x.style.name), Brand.STYLE_PRESETS.map((s) => s.name));
    assert.ok(v.every((x) => x.fontPair === "brand"));
    // a plan sent back by the UI keeps its brand settings
    const back = layoutFromPlan(JSON.parse(JSON.stringify(base)), { aspectRatio: "4:5" });
    assert.equal(back.brand.logoCorner, "bottom-right");
    assert.equal(back.brand.purpose, "ad");
});

test("brand: the LLM layout is branded even when it picks other fonts / colours", async () => {
    const llm = { generate: async () => JSON.stringify(raw()) };
    const { layout: l } = await generateAdLayout({ userPrompt: "robot kit", aspectRatio: "1:1", llm });
    assert.equal(l.fontPair, "brand");
    assert.equal(l.palette.accent, "#ef3027");
    assert.ok(l.brand);
});

test("brand: AD_BRAND_KIT=off -> the old free behaviour", () => {
    process.env.AD_BRAND_KIT = "off";
    try {
        const l = layout();
        assert.equal(l.brand, undefined);
        assert.equal(l.fontPair, "elegant-serif");
        assert.equal(l.palette.accent, "#00ff00");
    } finally {
        delete process.env.AD_BRAND_KIT;
    }
});

test("composer: logo drawn as uploaded, tight in the corner, exact width, proportions kept, nothing behind it", async () => {
    const l = editAdLayout(layout(), { brand: { logoCorner: "top-left" } });
    const logo = await logoPng();
    const out = await composeAd({ layout: l, photo: await flat(1080, 1350, 245), logo });
    assert.equal(out.logoUsed, "as-uploaded");
    const { box } = Brand.logoPlacement(l.brand, 1080, 1350, 3);
    assert.ok(Math.abs(box.w - 1080 * 0.18) < 0.5, "18 % of the width");
    assert.ok(Math.abs(box.x - 1080 * 0.035) < 1 && Math.abs(box.y - 1080 * 0.035) < 1, `right in the corner (${box.x}, ${box.y})`);
    const [r, g, b] = await pixel(out.jpeg, box.x + box.w / 2, box.y + box.h / 2);
    assert.ok(r > 200 && g < 90 && b < 90, `logo red at its centre (${r},${g},${b})`);
    const [r2, g2, b2] = await pixel(out.jpeg, box.x - 4, box.y + box.h / 2);
    assert.ok(r2 > 200 && g2 > 200 && b2 > 200, "nothing drawn around it");
});

test("composer: busy photo -> still only the user's file, NO white card / plate behind it", async () => {
    const l = editAdLayout(layout(), { composition: "text-bottom", brand: { logoCorner: "top-left" } });
    const photo = await noisy(1080, 1350);
    const out = await composeAd({ layout: l, photo, logo: await logoPng() });
    assert.equal(out.logoUsed, "as-uploaded");
    const { box } = Brand.logoPlacement(l.brand, 1080, 1350, 3);
    // the transparent margin of the logo file shows the photo (noise), not a white card
    const spots = await Promise.all([[box.x + 2, box.y + 2], [box.x + box.w - 3, box.y + 2], [box.x + 2, box.y + box.h - 3]].map(([x, y]) => pixel(out.jpeg, x, y)));
    assert.ok(spots.some(([r, g, b]) => r < 220 || g < 220 || b < 220), "photo visible around the logo (no white card)");
});

test("composer: an icon is smaller than a logo and sits in the bottom-right corner", async () => {
    const l = editAdLayout(layout(), { composition: "text-top", brand: { logoCorner: "bottom-right", mark: "icon" } });
    assert.equal(l.brand.mark, "icon");
    const icon = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 37, g: 60, b: 128, alpha: 1 } } }).png().toBuffer();
    const out = await composeAd({ layout: l, photo: await flat(1080, 1350, 245), logo: icon });
    const { box } = Brand.logoPlacement(l.brand, 1080, 1350, 1);
    assert.ok(Math.abs(box.w - 1080 * 0.10) < 0.5, "icon 10 % of the width");
    assert.ok(Math.abs(1080 - (box.x + box.w) - 1080 * 0.035) < 1 && Math.abs(1350 - (box.y + box.h) - 1080 * 0.035) < 1, "right in the bottom-right corner");
    const [r, g, b] = await pixel(out.jpeg, box.x + box.w / 2, box.y + box.h / 2);
    assert.ok(b > 100 && r < 80, `icon at its place (${r},${g},${b})`);
    // switching back to a logo -> the logo's own default width
    assert.equal(editAdLayout(l, { brand: { mark: "logo" } }).brand.logoWidthPct, 18);
});

test("composer: bottom-right corner on a 1:1 ad (logo 22 % wide)", async () => {
    const l = editAdLayout(layout({}, { aspectRatio: "1:1" }), { composition: "text-bottom", brand: { logoCorner: "bottom-right", purpose: "ad" } });
    const out = await composeAd({ layout: l, photo: await flat(1080, 1080, 240), logo: await logoPng() });
    assert.equal(out.width, 1080);
    assert.equal(out.height, 1080);
    const { box } = Brand.logoPlacement(l.brand, 1080, 1080, 3);
    assert.ok(box.x + box.w > 1000 && box.y + box.h > 1000);
    assert.ok(Math.abs(box.w - 1080 * 0.22) < 0.5);
    const [r, g, b] = await pixel(out.jpeg, box.x + box.w / 2, box.y + box.h / 2);
    assert.ok(r > 200 && g < 90 && b < 90, "logo in the bottom-right corner");
});

test("composer: a logo with a white or blue background is cut out — no box behind it on the photo", async () => {
    const { cutOutLogo } = require("../../services/imageGen/logoCutout.js");
    const mark = (bg, fmt) => sharp({ create: { width: 400, height: 300, channels: 3, background: bg } })
        .composite([{ input: { create: { width: 200, height: 120, channels: 4, background: { r: 239, g: 48, b: 39, alpha: 1 } } }, left: 100, top: 90 }])[fmt]().toBuffer();
    for (const [bg, fmt] of [[{ r: 255, g: 255, b: 255 }, "jpeg"], [{ r: 30, g: 90, b: 216 }, "png"]]) {
        const cut = await cutOutLogo(await mark(bg, fmt));
        assert.ok(cut.removed, "background found");
        assert.ok(cut.width < 220 && cut.height < 140, `empty margin trimmed (${cut.width}x${cut.height})`);
        const l = editAdLayout(layout(), { brand: { logoCorner: "top-left" } });
        const out = await composeAd({ layout: l, photo: await flat(1080, 1350, 40), logo: await mark(bg, fmt) });
        const { box } = Brand.logoPlacement(l.brand, 1080, 1350, cut.width / cut.height);
        const [r, g, b] = await pixel(out.jpeg, box.x + box.w / 2, box.y + box.h / 2);
        assert.ok(r > 200 && g < 90 && b < 90, `logo red at its centre (${r},${g},${b})`);
        // the mark is tight in the corner: its old background would show right next to it
        const [r2, g2, b2] = await pixel(out.jpeg, box.x + 4, box.y + box.h / 2);
        assert.ok(r2 > 200 && g2 < 90 && b2 < 90, `logo edge is the logo itself (${r2},${g2},${b2})`);
        const [r3, g3, b3] = await pixel(out.jpeg, box.x - 10, box.y + box.h / 2);
        assert.ok(r3 < 120 && g3 < 120 && b3 < 150, `dark photo around it, no white / blue box (${r3},${g3},${b3})`);
    }
    // already transparent -> left as it is
    assert.equal((await cutOutLogo(await logoPng())).removed, false);
});
