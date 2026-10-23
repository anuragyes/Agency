// ─────────────────────────────────────────────────────────────
// InstagramLiveHashtags.js — Studio step 5, "draft -> refine"
//
// The caption + hook only need the brief, so the post writer starts while research is still running.
// When the live research arrives, ONLY the hashtags are refined here (no second LLM call, 0 tokens):
//   1. keep the draft's hashtags that are real live hashtags (the writer already judged them relevant)
//   2. add live hashtags that match the brief's important words / the caption
//   3. fill with the best-ranked live hashtags
// ─────────────────────────────────────────────────────────────
const { filterToVerified } = require("./InstagramHashtagGrounding.js");

const MAX_HASHTAGS = 5;     // same as the post writer (InstagramBriefPostPrompt / InstagramPostAgent)
const POOL = 20;            // the writer used to choose from the top 20 live hashtags

const toTag = (h) => "#" + String(h || "").replace(/^#+/, "").replace(/\s+/g, "").toLowerCase();
const squash = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");

/**
 * @param {Object} args
 * @param {string[]} [args.draft]    hashtags in the AI draft
 * @param {Object}   args.research   compact research (InstagramBriefResearch) — research.hashtags ranked
 * @param {Object}   [args.brief]
 * @param {string}   [args.caption]
 * @returns {string[]} up to 5 live hashtags (empty when there is no live data)
 */
const pickLiveHashtags = ({ draft = [], research, brief = {}, caption = "" } = {}) => {
    const pool = [...new Set((research?.hashtags || []).slice(0, POOL).map((h) => toTag(h?.hashtag || h)))].filter((t) => t.length > 1);
    if (!pool.length) return [];

    const { kept } = filterToVerified(draft, new Set(pool));
    // "filter coffee" -> "filtercoffee" (whole phrase, 3+ letters) + "filter", "coffee" (single words, 4+ letters)
    const phrases = [...(brief.importantWords || []), ...(brief.keywords || [])].map(String);
    const words = [...new Set([
        ...phrases.map(squash).filter((w) => w.length >= 3),
        ...phrases.flatMap((p) => p.split(/\s+/)).map(squash).filter((w) => w.length >= 4),
    ])];
    const text = squash(caption);
    const related = pool.filter((t) => !kept.includes(t) && (words.some((w) => t.includes(w)) || (t.length > 4 && text.includes(t.slice(1)))));
    const rest = pool.filter((t) => !kept.includes(t) && !related.includes(t));

    return [...kept, ...related, ...rest].slice(0, MAX_HASHTAGS);
};

module.exports = { pickLiveHashtags, MAX_HASHTAGS };
