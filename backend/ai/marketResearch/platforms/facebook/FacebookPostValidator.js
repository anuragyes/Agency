// ─────────────────────────────────────────────────────────────
// FacebookPostValidator.js — checks + cleans the AI's Facebook post JSON
// Same content shape as Instagram (hook, caption, hashtags, visual, reel.scenes, carousel.slides)
// so the Content Editor works for both. Facebook differences:
//   - formats: text | image (photo post) | carousel (photo album, 2–10 photos) | reel
//   - hashtags are optional (0–5), links are allowed (content.link)
//   - plain text only (Facebook doesn't render Markdown either)
// ─────────────────────────────────────────────────────────────
const { cleanText, cleanHashtags: cleanIgHashtags } = require("../instagram/InstagramPostValidator.js");

const CONTENT_TYPES = ["text", "image", "carousel", "reel"];
const MAX_HASHTAGS = 5;
const CAPTION_LIMIT = 5000; // Facebook allows ~63k, but long posts get "See more" after ~3 lines — keep it sane

const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);
const cleanHashtags = (tags) => cleanIgHashtags(tags).slice(0, MAX_HASHTAGS);
const cleanLink = (v) => {
    const s = str(v);
    return /^https?:\/\/[^\s]+\.[^\s]+$/i.test(s) ? s : "";
};

/** Message that actually gets posted: caption + blank line + hashtags (if any) */
const buildFacebookMessage = (content) => {
    const caption = cleanText(content?.caption);
    const tags = cleanHashtags(content?.hashtags).join(" ");
    return [caption, tags].filter(Boolean).join("\n\n");
};

/** formatHint / any format word -> Facebook content type */
const facebookFormat = (hint) => {
    const h = String(hint || "").toLowerCase();
    if (CONTENT_TYPES.includes(h)) return h;
    if (/reel|video|short/.test(h)) return "reel";
    if (/carousel|album|photos|gallery|slides/.test(h)) return "carousel";
    if (/text|link|thread|article|status/.test(h)) return "text";
    return "image";
};

const normalizeFacebookPost = (raw, contentType) => {
    const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const rawCaption = cleanText(p.caption);
    const inCaption = rawCaption.match(/#[\p{L}\p{N}_]+/gu) || [];
    const caption = rawCaption.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();

    const out = {
        platform: "facebook",
        contentType,
        title: cleanText(p.title),
        objective: str(p.objective),
        targetAudience: Array.isArray(p.targetAudience) ? p.targetAudience.join(", ") : str(p.targetAudience),
        contentAngle: cleanText(p.contentAngle),
        hook: cleanText(p.hook),
        caption,
        hashtags: cleanHashtags([...arr(p.hashtags), ...inCaption]),
        // "" = written by the AI | "facebook_page" = from your Page's real posts | "user" = typed by hand
        hashtagSource: str(p.hashtagSource),
        keywords: arr(p.keywords).map(str).filter(Boolean),
        callToAction: cleanText(p.callToAction),
        link: cleanLink(p.link),
        altText: cleanText(p.altText),
        visual: {
            brief: str(p.visual?.brief),
            onImageText: cleanText(p.visual?.onImageText),
            style: str(p.visual?.style),
            aspectRatio: contentType === "reel" ? "9:16" : contentType === "text" ? "" : str(p.visual?.aspectRatio) || "4:5",
        },
        reel: null,
        carousel: null,
        engagementTips: arr(p.engagementTips).map(cleanText).filter(Boolean),
        whyThisWorks: cleanText(p.whyThisWorks),
    };

    if (contentType === "reel") {
        out.reel = {
            durationSec: Number(p.reel?.durationSec) || 30,
            coverText: cleanText(p.reel?.coverText),
            audioSuggestion: str(p.reel?.audioSuggestion),
            scenes: arr(p.reel?.scenes).map((s, i) => ({
                start: Number.isFinite(Number(s?.start)) ? Number(s.start) : i * 4,
                end: Number.isFinite(Number(s?.end)) ? Number(s.end) : i * 4 + 4,
                visual: str(s?.visual),
                onScreenText: cleanText(s?.onScreenText),
                voiceover: cleanText(s?.voiceover),
            })),
        };
    }
    if (contentType === "carousel") {
        out.carousel = {
            slides: arr(p.carousel?.slides).slice(0, 10).map((s) => ({
                headline: cleanText(s?.headline),
                body: cleanText(s?.body),
                visual: str(s?.visual),
            })),
        };
    }
    return out;
};

const validateFacebookPost = (post) => {
    const errors = [];
    if (!post || typeof post !== "object") return { valid: false, errors: ["Post must be an object"] };

    if (!CONTENT_TYPES.includes(post.contentType)) errors.push(`contentType must be one of ${CONTENT_TYPES.join(", ")}`);
    ["hook", "caption"].forEach((f) => {
        if (!str(post[f])) errors.push(`${f} must be a non-empty string`);
    });
    if (post.contentType !== "text" && !str(post.visual?.brief)) errors.push("visual.brief must describe the photo / video");
    if ((post.hashtags || []).length > MAX_HASHTAGS) errors.push(`max ${MAX_HASHTAGS} hashtags on Facebook`);

    const len = buildFacebookMessage(post).length;
    if (len > CAPTION_LIMIT) errors.push(`post text is ${len} characters, max is ${CAPTION_LIMIT}`);

    if (post.contentType === "reel" && (post.reel?.scenes || []).length < 2) errors.push("reel.scenes must have at least 2 scenes");
    if (post.contentType === "carousel") {
        const n = (post.carousel?.slides || []).length;
        if (n < 2 || n > 10) errors.push("carousel.slides must have 2–10 photos");
    }
    return { valid: errors.length === 0, errors };
};

module.exports = {
    normalizeFacebookPost,
    validateFacebookPost,
    buildFacebookMessage,
    facebookFormat,
    cleanHashtags,
    cleanText,
    CONTENT_TYPES,
    MAX_HASHTAGS,
    CAPTION_LIMIT,
};
