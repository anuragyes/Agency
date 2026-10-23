// ─────────────────────────────────────────────────────────────
// adComposer.js — the image steps that run in Node (sharp)
//   svgToPng()   layout sketch (SVG) -> PNG for ControlNet
//   composeAd()  Stable Diffusion photo -> final ad: resize to post size + scrim + headline / subline / CTA + the user's logo OR icon -> JPEG
//   Text is drawn AFTER the AI step, so it is always spelled right and the logo is the real one (SD can't do either).
// ─────────────────────────────────────────────────────────────
const sharp = require("sharp");
const { COMPOSITIONS } = require("../../ai/imageGen/AdLayoutSpecs.js");
const { textOverlaySvg, canvasOf, px, areasOf } = require("./layoutRenderer.js");
const Brand = require("../../ai/imageGen/BrandKit.js");
const { cutOutLogo } = require("./logoCutout.js");

const svgToPng = (svg) => sharp(Buffer.from(svg)).png().toBuffer();

/** Average brightness (0–1) of a region -> pick white or dark text for it */
const regionBrightness = async (buf, box) => {
    // extract -> buffer first: sharp's stats() reads the INPUT image, not the extracted region
    const region = await sharp(buf)
        .extract({ left: Math.round(box.x), top: Math.round(box.y), width: Math.max(1, Math.round(box.w)), height: Math.max(1, Math.round(box.h)) })
        .toBuffer();
    const { channels } = await sharp(region).stats();
    const [r, g, b] = channels.map((c) => c.mean / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * (b ?? r);
};

/** width / height of an image file */
const aspectOf = async (img) => {
    const m = await sharp(img, { density: 300 }).metadata();
    const rotated = (m.orientation || 1) >= 5;
    const w = rotated ? m.height : m.width;
    const h = rotated ? m.width : m.height;
    return w && h ? w / h : null;
};

/** logo / icon file -> PNG that fits w x h, original proportions (no stretch / crop / rotate / recolour / background) */
const fitLogo = (img, w, h) =>
    sharp(img, { density: 300 }).resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { fit: "inside" }).ensureAlpha().png().toBuffer({ resolveWithObject: true });

/** fitted mark -> left / top, pushed into the corner of its box (top-left or bottom-right) */
const cornerAnchor = (box, fw, fh, corner) => ({
    left: Math.round(corner === "bottom-right" ? box.x + box.w - fw : box.x),
    top: Math.round(corner === "bottom-right" ? box.y + box.h - fh : box.y),
});

/**
 * Brand mark rules (BrandKit.LOGO): the ONE file the user uploaded (logo OR icon), tight in the top-left /
 * bottom-right corner, logo 15–22 % (post) / 18–25 % (ad) wide, icon 8–12 % / 10–14 %.
 * Drawn exactly as uploaded — NO card, plate or background behind it (the user's files are already cut out).
 * @returns {Promise<{ layers: Object[], warnings: string[], used: "as-uploaded" }>}
 */
const brandLogoLayers = async ({ layout, base, W, H, logo }) => {
    const warnings = [];
    const kind = layout.brand.mark === "icon" ? "icon" : "logo";
    const aspect = (await aspectOf(logo).catch(() => null)) || layout.brand.logoAspect;
    const { box, corner } = Brand.logoPlacement(layout.brand, W, H, aspect);
    const fitted = await fitLogo(logo, box.w, box.h);
    const { left, top } = cornerAnchor(box, fitted.info.width, fitted.info.height, corner);

    // only a hint for the user — nothing is ever drawn behind the mark
    const behind = await regionBrightness(base, { x: left, y: top, w: fitted.info.width, h: fitted.info.height }).catch(() => null);
    const own = await logoBrightness(fitted.data);
    if (behind != null && own != null
        && (Math.abs(own - behind) < Brand.LOGO.minContrast || (await lostShare(fitted.data, behind)) > Brand.LOGO.maxLostShare)) {
        warnings.push(`Your ${kind} may be hard to see on this photo — try the other corner or a ${kind} file with more contrast.`);
    }
    return { layers: [{ input: fitted.data, left, top }], warnings, used: "as-uploaded" };
};

/** Share (0–1) of the logo's visible pixels that would almost disappear on a background of this brightness */
const lostShare = async (png, bg) => {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let lost = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
        if (data[i + 3] < 128) continue;
        n++;
        const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        if (Math.abs(lum - bg) < 0.2) lost++;
    }
    return n ? lost / n : 0;
};

/** Average brightness (0–1) of the visible (non-transparent) logo pixels, null if fully transparent */
const logoBrightness = async (png) => {
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
        if (data[i + 3] < 128) continue;
        sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        n++;
    }
    return n ? sum / n : null;
};

/**
 * @param {Object}  o
 * @param {Object}  o.layout   normalized layout (AdLayoutAgent)
 * @param {Buffer}  o.photo    PNG/JPEG from Stable Diffusion
 * @param {Buffer} [o.logo]    the user's uploaded logo OR icon (PNG / JPEG / SVG / WebP), drawn as it is — no background
 * @param {"auto"|"light"|"dark"} [o.theme]
 * @returns {Promise<{ jpeg: Buffer, theme, width, height }>}
 */
const composeAd = async ({ layout: layoutIn, photo, logo = null, theme = "auto" }) => {
    let layout = layoutIn;
    const { W, H } = canvasOf(layout);
    const comp = COMPOSITIONS[layout.composition];
    const base = await sharp(photo).resize(W, H, { fit: "cover", position: "centre", kernel: "lanczos3" }).removeAlpha().png().toBuffer();

    // the logo's own background (white / blue box, white tile …) -> transparent, empty margin trimmed
    if (logo) logo = (await cutOutLogo(logo).catch(() => null))?.png || logo;

    // brand kit: reserve the corner for the REAL logo's proportions, so the text never moves under it
    if (layout.brand && logo) {
        const a = await aspectOf(logo).catch(() => null);
        if (a) layout = { ...layout, brand: { ...layout.brand, logoAspect: a } };
    }

    const textBox = areasOf(layout, W, H).text;
    let useTheme = theme;
    if (useTheme !== "light" && useTheme !== "dark") useTheme = (await regionBrightness(base, textBox)) > 0.62 ? "dark" : "light";

    const overlay = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${textOverlaySvg(layout, W, H, { theme: useTheme })}</svg>`;
    const layers = [{ input: Buffer.from(overlay), left: 0, top: 0 }];
    const warnings = [];
    let logoUsed = null;

    if (layout.brand && logo) {
        const b = await brandLogoLayers({ layout, base, W, H, logo });
        layers.push(...b.layers);
        warnings.push(...b.warnings);
        logoUsed = b.used;
    } else if (logo) {
        // no brand kit: the composition's logo box, pushed into its nearest corner — drawn as uploaded, no plate
        const lb = px(comp.logo, W, H);
        const fitted = await fitLogo(logo, lb.w, lb.h);
        const right = lb.x + lb.w / 2 > W / 2;
        const bottom = lb.y + lb.h / 2 > H / 2;
        const left = Math.round(right ? lb.x + lb.w - fitted.info.width : lb.x);
        const top = Math.round(bottom ? lb.y + lb.h - fitted.info.height : lb.y);
        layers.push({ input: fitted.data, left, top });
        logoUsed = "as-uploaded";
    }

    const jpeg = await sharp(base).composite(layers).jpeg({ quality: 92, mozjpeg: true, chromaSubsampling: "4:4:4" }).toBuffer();
    return { jpeg, theme: useTheme, width: W, height: H, warnings, logoUsed };
};

module.exports = { svgToPng, composeAd, regionBrightness, aspectOf };
