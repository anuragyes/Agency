// ─────────────────────────────────────────────────────────────
// InstagramBriefPostPrompt.js — compact prompt for the Instagram Post Agent (Studio flow)
// Input : the small brief (from ContentBriefAgent) + live hashtag names (InstagramBriefResearch)
// Same output JSON as InstagramPostPrompt.js, but ~70–80% fewer input tokens:
//   - no full product profile, no full research JSON, no pretty-printing
// ─────────────────────────────────────────────────────────────
const MAX_HASHTAGS = 5;
const HASHTAGS_IN_PROMPT = 20;

const FORMAT_RULES = {
    image: `IMAGE POST 4:5: visual.brief = ONE strong photo/graphic; visual.onImageText max 8 words. reel=null, carousel=null.`,
    reel: `REEL 9:16, 15–30s: hook as on-screen text + voiceover in first 3s; reel.scenes 4–7 consecutive {start,end,visual,onScreenText,voiceover}; reel.coverText max 6 words; reel.audioSuggestion = mood only (no song names). carousel=null.`,
    carousel: `CAROUSEL 4:5: carousel.slides 4–8 {headline max 8 words, body max 25 words, visual}; slide 1 = hook, last = CTA. reel=null.`,
};

const shape = (contentType) => {
    const reel = contentType === "reel" ? `{"durationSec":20,"coverText":"","audioSuggestion":"","scenes":[{"start":0,"end":3,"visual":"","onScreenText":"","voiceover":""}]}` : "null";
    const carousel = contentType === "carousel" ? `{"slides":[{"headline":"","body":"","visual":""}]}` : "null";
    return `{"platform":"instagram","contentType":"${contentType}","title":"","objective":"","targetAudience":"","contentAngle":"","hook":"","caption":"","hashtags":[],"keywords":[],"callToAction":"","altText":"","visual":{"brief":"","onImageText":"","style":"","aspectRatio":"${contentType === "reel" ? "9:16" : "4:5"}"},"reel":${reel},"carousel":${carousel},"engagementTips":[],"whyThisWorks":""}`;
};

/** Drop fields the writer doesn't need to see again in revision mode */
const slimContent = (c = {}) => {
    // eslint-disable-next-line no-unused-vars
    const { hashtagSource, platform, engagementTips, whyThisWorks, keywords, ...rest } = c;
    return rest;
};

const buildInstagramBriefPostPrompt = ({ brief, research, contentType, userPrompt, previousContent, fixErrors, performanceLearnings }) => {
    const tags = (research?.hashtags || []).slice(0, HASHTAGS_IN_PROMPT).map((h) => h.hashtag);
    // eslint-disable-next-line no-unused-vars
    const { platform, formatHint, ...briefForWriter } = brief || {};

    return `You are Sociva's Instagram Post Agent. Write ONE Instagram ${contentType} from this BRIEF.
BRIEF: ${JSON.stringify(briefForWriter)}
${tags.length
            ? `LIVE INSTAGRAM HASHTAGS (real, used now, ranked): ${tags.join(" ")}\nhashtags: pick ${MAX_HASHTAGS} or fewer ONLY from this list, most relevant first.`
            : `hashtags: no live data — suggest ${MAX_HASHTAGS} or fewer plain descriptive hashtags.`}
${performanceLearnings?.promptInjection ? `\n${performanceLearnings.promptInjection}\n` : ""}FORMAT: ${FORMAT_RULES[contentType]}
RULES: hook = first caption line, max 125 chars, scroll-stopping. Give real value (tip/use case/how-to). Follow brief.optimizedPrompt. Use brief.importantWords naturally in the caption (Instagram search reads captions). No hashtags inside caption. End caption with ONE CTA (brief.cta). Caption max 1800 chars, short paragraphs, \\n line breaks. Use ONLY brief.facts and brief.product as facts — never invent prices, numbers, reviews, discounts or health claims. Follow brief.tone and brief.language. altText describes the visual. engagementTips 2–3 short items. whyThisWorks 1 sentence. FORMAT THE CAPTION AS PLAIN TEXT: Instagram does not render Markdown, so NEVER use **, __, *, # headings or \"- \" bullets. Layout: hook line, empty line, 2–3 short paragraphs (1–3 lines each, max ONE emoji at the start of a paragraph), optional list of 3–4 items each on its own line starting with \"• \" or one emoji (\"Hyaluronic Acid – hydrates and plumps\"), empty line, ONE CTA line. No repeated closing lines. Valid JSON only.
${previousContent ? `CURRENT DRAFT: ${JSON.stringify(slimContent(previousContent))}\nCHANGE REQUEST (apply fully, keep what works): "${String(userPrompt || "Improve it").replace(/"/g, "'")}"` : userPrompt ? `EXTRA INSTRUCTIONS: "${String(userPrompt).replace(/"/g, "'")}"` : ""}${fixErrors?.length ? `\nYOUR LAST ANSWER WAS REJECTED. Fix: ${fixErrors.join("; ")}` : ""}
JSON: ${shape(contentType)}`;
};

module.exports = buildInstagramBriefPostPrompt;
