// ─────────────────────────────────────────────────────────────
// FacebookBriefPostPrompt.js — compact prompt for the Facebook Post Agent (Studio flow)
// Input : the small brief (ContentBriefAgent) + what worked on YOUR Page (FacebookBriefResearch)
// Output: same JSON shape as Instagram, tuned for Facebook (conversation, shares, links allowed).
// ─────────────────────────────────────────────────────────────
const { MAX_HASHTAGS } = require("./FacebookPostValidator.js");

const FORMAT_RULES = {
    text: `TEXT POST (no photo): caption carries everything; may include ONE link in "link" if the brief has a real URL (never invent one). visual.brief = "", reel=null, carousel=null.`,
    image: `PHOTO POST 4:5 or 1:1: visual.brief = ONE strong photo/graphic; visual.onImageText max 8 words. reel=null, carousel=null.`,
    carousel: `PHOTO ALBUM (multi-photo post) 4:5: carousel.slides 3–6 photos {headline max 8 words = text on that photo, body max 25 words = what the photo shows, visual}; photo 1 = hook, last = CTA. reel=null.`,
    reel: `FACEBOOK REEL 9:16, 15–45s: hook on screen + voiceover in first 3s; reel.scenes 4–7 consecutive {start,end,visual,onScreenText,voiceover}; captions on screen (most watch muted); reel.coverText max 6 words; reel.audioSuggestion = mood only (no song names). carousel=null.`,
};

const shape = (contentType) => {
    const reel = contentType === "reel" ? `{"durationSec":30,"coverText":"","audioSuggestion":"","scenes":[{"start":0,"end":3,"visual":"","onScreenText":"","voiceover":""}]}` : "null";
    const carousel = contentType === "carousel" ? `{"slides":[{"headline":"","body":"","visual":""}]}` : "null";
    const ratio = contentType === "reel" ? "9:16" : contentType === "text" ? "" : "4:5";
    return `{"platform":"facebook","contentType":"${contentType}","title":"","objective":"","targetAudience":"","contentAngle":"","hook":"","caption":"","hashtags":[],"keywords":[],"callToAction":"","link":"","altText":"","visual":{"brief":"","onImageText":"","style":"","aspectRatio":"${ratio}"},"reel":${reel},"carousel":${carousel},"engagementTips":[],"whyThisWorks":""}`;
};

const slimContent = (c = {}) => {
    // eslint-disable-next-line no-unused-vars
    const { hashtagSource, platform, engagementTips, whyThisWorks, keywords, ...rest } = c;
    return rest;
};

/** What worked on the user's own Page -> 1–2 short lines for the writer (real data only) */
const pageInsights = (research) => {
    if (!research || research.status === "unavailable") return "";
    const lines = [];
    const top = (research.topPosts || []).slice(0, 3).map((p) => `"${String(p.hook || "").slice(0, 90)}" (${p.format}, ${p.engagement} reactions+comments+shares)`);
    if (top.length) lines.push(`YOUR PAGE'S BEST RECENT POSTS: ${top.join(" | ")}`);
    const fmt = (research.formats || []).filter((f) => f.avgEngagement != null).slice(0, 3).map((f) => `${f.format} avg ${f.avgEngagement}`);
    if (fmt.length) lines.push(`FORMAT PERFORMANCE ON YOUR PAGE: ${fmt.join(", ")}`);
    return lines.join("\n");
};

const buildFacebookBriefPostPrompt = ({ brief, research, contentType, userPrompt, previousContent, fixErrors, performanceLearnings }) => {
    const tags = (research?.hashtags || []).slice(0, 15).map((h) => h.hashtag);
    // eslint-disable-next-line no-unused-vars
    const { platform, formatHint, ...briefForWriter } = brief || {};
    const insights = pageInsights(research);

    return `You are Sociva's Facebook Post Agent. Write ONE Facebook Page ${contentType} from this BRIEF.
${performanceLearnings?.promptInjection ? `${performanceLearnings.promptInjection}\n` : ""}BRIEF: ${JSON.stringify(briefForWriter)}
${insights ? `${insights}\nLearn from what worked (style, length, format) — never copy those posts.\n` : ""}${tags.length
            ? `HASHTAGS ALREADY USED ON YOUR PAGE: ${tags.join(" ")}\nhashtags: 0–3, prefer ones from this list when relevant.`
            : `hashtags: 0–3 plain descriptive hashtags (Facebook needs few).`}
FORMAT: ${FORMAT_RULES[contentType]}
RULES: Facebook shows ~2–3 lines before "See more": hook = first line, max 100 chars, specific and human. Write like a person talking to their community — warm, conversational, not salesy. Give real value (tip / story / use case). End with ONE CTA (brief.cta) and invite comments with a simple question when it fits the goal. Follow brief.optimizedPrompt, brief.tone and brief.language. Use brief.importantWords naturally. Use ONLY brief.facts and brief.product as facts — never invent prices, numbers, reviews, discounts, links or health claims. link = a real URL from the brief only, else "". Caption 300–1200 chars, short paragraphs with \\n line breaks. PLAIN TEXT ONLY: never use **, __, *, # headings or "- " bullets; lists use "• " or one emoji per line. Max one emoji per paragraph. No hashtags inside caption. altText describes the visual. engagementTips 2–3 short Facebook-specific items. whyThisWorks 1 sentence. Max ${MAX_HASHTAGS} hashtags. Valid JSON only.
${previousContent ? `CURRENT DRAFT: ${JSON.stringify(slimContent(previousContent))}\nCHANGE REQUEST (apply fully, keep what works): "${String(userPrompt || "Improve it").replace(/"/g, "'")}"` : userPrompt ? `EXTRA INSTRUCTIONS: "${String(userPrompt).replace(/"/g, "'")}"` : ""}${fixErrors?.length ? `\nYOUR LAST ANSWER WAS REJECTED. Fix: ${fixErrors.join("; ")}` : ""}
JSON: ${shape(contentType)}`;
};

module.exports = buildFacebookBriefPostPrompt;
module.exports.pageInsights = pageInsights;
