// ─────────────────────────────────────────────────────────────
// InstagramPostValidator.js — checks + cleans the AI's post JSON
// normalizeInstagramPost() fixes small things (hashtag format, limits)
// validateInstagramPost() reports what is still wrong (agent retries once)
// ─────────────────────────────────────────────────────────────

// The user picks up to 6 real hashtags in the Content Editor (Instagram's own guidance is max 5 since Dec 2025)
const MAX_HASHTAGS = 6;
const CAPTION_LIMIT = 2200;            // Instagram hard limit (caption + hashtags)
const CONTENT_TYPES = ["image", "reel", "carousel"];

const str = (v) => (typeof v === "string" ? v.trim() : "");
const arr = (v) => (Array.isArray(v) ? v : []);

/**
 * Instagram shows PLAIN TEXT only. The model sometimes writes Markdown (**bold**, ## headings, "- " bullets)
 * which shows up as raw stars on Instagram ("✨ **Key Ingredients:**", "LUMÉA. :**").
 * This keeps the words + emojis + line breaks and removes the Markdown.
 */
const cleanText = (v) => {
    if (typeof v !== "string") return "";
    return v
        .replace(/\r\n?/g, "\n")
        .replace(/\*\*|__/g, "")                                          // bold markers, also broken ones like ":**"
        .replace(/(^|[\s(])\*(?=\S)([^*\n]+?)\*(?=[\s.,!?:;)]|$)/gm, "$1$2") // *italic*
        .replace(/`+/g, "")                                                // `code`
        .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")                              // "## Heading" (a hashtag has no space after #)
        .replace(/^[ \t]*[-*+][ \t]+/gm, "• ")                             // "- item" / "* item" -> "• item"
        .replace(/^[ \t]+|[ \t]+$/gm, "")                                  // indentation + trailing spaces
        .replace(/[ \t]{2,}/g, " ")                                         // double spaces
        .replace(/([.!?…])[ \t]*[:;,]+$/gm, "$1")                           // "LUMÉA. :" left after removing "**"
        .replace(/^[\s:;,*_~-]+$/gm, "")                                    // lines that are only leftover symbols
        .replace(/\n{3,}/g, "\n\n")                                         // max one empty line between paragraphs
        .trim();
};

/** "#Desi Ghee", "desighee", "#desighee" -> "#desighee" ; removes duplicates ; max MAX_HASHTAGS */
const cleanHashtags = (tags) => {
    const seen = new Set();
    return arr(tags)
        .map((t) => "#" + String(t).replace(/^#+/, "").replace(/[^\p{L}\p{N}_]+/gu, ""))
        .filter((t) => t.length > 2 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
        .slice(0, MAX_HASHTAGS);
};

/** Caption that actually gets posted: caption text + blank line + hashtags */
const buildFinalCaption = (content) => {
    const caption = cleanText(content?.caption);
    const tags = cleanHashtags(content?.hashtags).join(" ");
    return [caption, tags].filter(Boolean).join("\n\n");
};

const normalizeInstagramPost = (raw, contentType) => {
    const p = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};

    // remove hashtags the model may have left inside the caption; keep them in the list
    const rawCaption = cleanText(p.caption);
    const inCaption = (rawCaption.match(/#[\p{L}\p{N}_]+/gu) || []);
    const caption = rawCaption.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();

    const out = {
        platform: "instagram",
        contentType,
        title: cleanText(p.title),
        objective: str(p.objective),
        targetAudience: Array.isArray(p.targetAudience) ? p.targetAudience.join(", ") : str(p.targetAudience),
        contentAngle: cleanText(p.contentAngle),
        hook: cleanText(p.hook),
        caption,
        hashtags: cleanHashtags([...arr(p.hashtags), ...inCaption]),
        // "" = written by the AI | "instagram_api" = picked from real Instagram data | "user" = typed by hand
        hashtagSource: str(p.hashtagSource),
        keywords: arr(p.keywords).map(str).filter(Boolean),
        callToAction: cleanText(p.callToAction),
        altText: cleanText(p.altText),
        visual: {
            brief: str(p.visual?.brief),
            onImageText: cleanText(p.visual?.onImageText),
            style: str(p.visual?.style),
            aspectRatio: contentType === "reel" ? "9:16" : str(p.visual?.aspectRatio) || "4:5",
        },
        reel: null,
        carousel: null,
        engagementTips: arr(p.engagementTips).map(cleanText).filter(Boolean),
        whyThisWorks: cleanText(p.whyThisWorks),
    };

    if (contentType === "reel") {
        out.reel = {
            durationSec: Number(p.reel?.durationSec) || 20,
            coverText: cleanText(p.reel?.coverText),
            audioSuggestion: str(p.reel?.audioSuggestion),
            scenes: arr(p.reel?.scenes).map((s, i) => ({
                start: Number.isFinite(Number(s?.start)) ? Number(s.start) : i * 3,
                end: Number.isFinite(Number(s?.end)) ? Number(s.end) : i * 3 + 3,
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

const validateInstagramPost = (post) => {
    const errors = [];
    if (!post || typeof post !== "object") return { valid: false, errors: ["Post must be an object"] };

    if (!CONTENT_TYPES.includes(post.contentType)) errors.push("contentType must be image, reel or carousel");
    ["hook", "caption", "callToAction"].forEach((f) => {
        if (!str(post[f])) errors.push(`${f} must be a non-empty string`);
    });
    if (!post.hashtags?.length) errors.push(`hashtags must contain 1–${MAX_HASHTAGS} hashtags`);
    if (!str(post.visual?.brief)) errors.push("visual.brief must describe the visual");

    const finalLen = buildFinalCaption(post).length;
    if (finalLen > CAPTION_LIMIT) errors.push(`caption + hashtags is ${finalLen} characters, max is ${CAPTION_LIMIT}`);

    if (post.contentType === "reel") {
        if ((post.reel?.scenes || []).length < 2) errors.push("reel.scenes must have at least 2 scenes");
    }
    if (post.contentType === "carousel") {
        const n = (post.carousel?.slides || []).length;
        if (n < 2 || n > 10) errors.push("carousel.slides must have 2–10 slides");
    }

    return { valid: errors.length === 0, errors };
};

module.exports = {
    normalizeInstagramPost,
    validateInstagramPost,
    buildFinalCaption,
    cleanHashtags,
    cleanText,
    CONTENT_TYPES,
    MAX_HASHTAGS,
    CAPTION_LIMIT,
};
